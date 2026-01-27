import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpenAiConnection } from "./open-ai.connection";
import { WsServerGateway } from "../ws-server/ws-server.gateway";
import { Assistant } from "../assistants/assistants.model";
import { AiCdrService } from "../ai-cdr/ai-cdr.service";
import { AiToolsHandlersService } from "../ai-tools-handlers/ai-tools-handlers.service";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import { AudioService } from "../audio/audio.service";

export interface sessionData {
    channelId?: string
    callerId?: string
    address: string
    port: string
    openAiConn?: OpenAiConnection
    currentResponseId?: string
    responseIds?: string[]
    itemIds?: string[]
    init?: string
    events?: object[]
    assistant?: Assistant
    lastResponseAt?: number
    lastEventAt?: number
    watchdogTimer?: NodeJS.Timeout
    isPlayground?: boolean  // Flag to identify playground sessions
}

@Injectable()
export class OpenAiService implements OnModuleInit {
    private API_KEY: string;
    private sessions = new Map<string, sessionData>();
    private readonly logger = new Logger(OpenAiService.name);

    constructor(
        public eventEmitter: EventEmitter2,
        @Inject(WsServerGateway) private readonly wsGateway: WsServerGateway,
        @Inject(AiCdrService) private readonly aiCdrService: AiCdrService,
        @Inject(AiToolsHandlersService) private readonly aiToolsHandlersService: AiToolsHandlersService,
        private readonly configService: ConfigService,
        @Inject(UsersService) private readonly usersService: UsersService,
        private readonly audioService: AudioService
    ) {
        this.API_KEY = this.configService.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
    }

    async createConnection(channelId: string, assistant: Assistant): Promise<OpenAiConnection> {

        const session: sessionData = this.sessions.get(channelId)

        if (session && session.openAiConn) {
            return session.openAiConn
        }

        const balanceData = await this.usersService.getUserBalance(String(assistant.userId));
        if (balanceData.balance <= 0) {
            this.logger.warn(`User ${assistant.userId} has insufficient balance: ${balanceData.balance}. Connection rejected.`);
            throw new Error(`Insufficient balance: ${balanceData.balance}`);
        }

        const connection = new OpenAiConnection(
            this.API_KEY,
            channelId,
            this.eventEmitter,
            assistant
        );

        const newSession: sessionData = {
            channelId,
            address: session?.address || '',
            port: session?.port || '',
            responseIds: [],
            itemIds: [],
            events: [],
            init: 'false',
            openAiConn: connection,
            assistant,
            lastEventAt: Date.now(),
        }

        this.sessions.set(channelId, newSession)

        // running watchdog
        // this.startWatchdog(channelId)

        return connection;
    }

    getConnection(channelId: string): OpenAiConnection | undefined {
        const session = this.sessions.get(channelId);
        if (session.openAiConn) {
            return session.openAiConn
        }
    }

    closeConnection(channelId: string) {
        if (!channelId) {
            return;
        }
        const session = this.sessions.get(channelId);
        if (!session) {
            return;
        }

        if (session.watchdogTimer) {
            clearInterval(session.watchdogTimer)
        }

        if (session.openAiConn) {
            try {
                session.openAiConn.close()
            } catch (e) {
                this.logger.error(`Error closing OpenAI connection for ${channelId}:`, e);

            }
            this.sessions.delete(channelId);
        }
    }

    onModuleInit() {
        if (!this.API_KEY) {
            this.logger.error('OPENAI_API_KEY is not defined in configuration!');
        } else {
            this.logger.log(`OpenAI Service initialized with API Key: ${this.API_KEY.substring(0, 7)}...`);
        }

        // if (this.isRealtime) {
        //     this.RTConnect();
        // }
    }

    private updateSession(serverEvent: any, channelId?: string) {
        // const channelId = serverEvent?.response?.metadata?.channelId;
        const responseId = serverEvent?.response?.id || serverEvent?.response_id;
        const itemId = serverEvent?.item?.id
            || serverEvent?.item_id
            || serverEvent?.response?.output[0]?.id
            || serverEvent?.conversation?.item?.id
        const previousItemId = serverEvent?.previous_item_id || serverEvent?.conversation?.previous_item_id

        if (!channelId && !responseId && !itemId && !previousItemId) return; // Если нет ключевых идентификаторов, выходим

        // Ищем существующую сессию по channelId, responseId или itemId
        let existingSession = this.sessions.get(channelId)
            || this.getSessionByField('responseIds', responseId)
            || this.getSessionByField('itemIds', previousItemId)
            || this.getSessionByField('itemIds', itemId)

        if (!existingSession && !channelId) return;

        // Если сессия не найдена, создаем новую
        if (!existingSession) {
            existingSession = {
                channelId: channelId || '',
                address: serverEvent.response?.metadata?.address || '',
                port: serverEvent.response?.metadata?.port || '',
                currentResponseId: responseId ? responseId : '',
                responseIds: responseId ? [responseId] : [],
                itemIds: itemId ? [itemId] : [],
                events: [],
            };
        }

        // Обновляем данные сессии
        existingSession.channelId = existingSession?.channelId || channelId;
        existingSession.address = serverEvent.response?.metadata?.address ?? existingSession.address;
        existingSession.port = serverEvent.response?.metadata?.port ?? existingSession.port;

        // Добавляем новые responseIds и itemIds, избегая дубликатов
        if (responseId) {
            existingSession.currentResponseId = responseId
            existingSession.responseIds = Array.isArray(existingSession.responseIds)
                ? [...new Set([...existingSession.responseIds, responseId])]
                : [responseId];
            existingSession.lastResponseAt = Date.now()
        }

        if (itemId) {
            existingSession.itemIds = Array.isArray(existingSession.itemIds)
                ? [...new Set([...existingSession.itemIds, itemId])]
                : [itemId];
        }

        existingSession.events.push(serverEvent);

        // Записываем обновлённую сессию обратно в Map
        this.sessions.set(existingSession.channelId, existingSession);

        // console.log(JSON.stringify(Array.from(this.sessions.entries()), null, 2));
    }

    private getSessionByField(field: keyof sessionData, value: any) {
        return [...this.sessions.values()].find(session => {
            if (Array.isArray(session[field])) {
                return (session[field] as string[]).includes(value);
            }
            return session[field] === value;
        });
    }

    private async cdrCreateLog(channelId: string, callerId: string, assistant?: Assistant) {
        try {
            if (channelId) {
                await this.aiCdrService.cdrCreate({
                    channelId,
                    callerId,
                    assistantId: assistant?.id,
                    assistantName: assistant?.name,
                    userId: assistant?.userId,
                    vPbxUserId: assistant?.user?.vpbx_user_id
                })
            }
        } catch (e) {
            this.logger.error(e)
        }
    }

    private async loggingEvents(channelId: string, callerId: string, event: any, assistant?: Assistant) {
        try {
            if (channelId) {
                const assistantName = assistant?.name || ''
                const userId = assistant?.userId || null

                // Check if this is a playground session
                if (channelId.startsWith('playground-')) {
                    // Extract socketId from channelId (format: playground-{socketId})
                    const socketId = channelId.replace('playground-', '');
                    this.wsGateway.sendToPlayground(socketId, channelId, assistantName, event);
                } else {
                    // Regular SIP/Asterisk session
                    this.wsGateway.sendToClient(channelId, callerId, assistantName, userId, event);
                }

                await this.aiCdrService.eventCreate({
                    channelId,
                    callerId,
                    events: event,
                    userId: assistant?.userId,
                    vPbxUserId: assistant?.user.vpbx_user_id
                })
            }
        } catch (e) {
            this.logger.error(JSON.stringify(event), e)
        }
    }

    public async dataDecode(e, channelId: string, callerId: string, assistant: Assistant) {

        const serverEvent = typeof e === 'string' ? JSON.parse(e) : e;
        const currentSession = this.sessions.get(channelId)

        if (serverEvent.type !== "response.audio.delta" &&
            serverEvent.type !== "response.audio_transcript.delta"
        ) {
            await this.loggingEvents(channelId, callerId, e, assistant)
        }

        if (serverEvent.type === "input_audio_buffer.speech_started") {
            const responseId = currentSession?.currentResponseId
            this.logger.log(`Speech started`)
            if (responseId) {
                this.logger.log(`Current responseId: ${responseId}`)
                const cancelEvent = {
                    type: 'response.cancel',
                    response_id: responseId
                }

                // console.log(currentSession.currentResponseId, cancelEvent)
                if (!assistant?.model?.startsWith('qwen')) {
                    currentSession.openAiConn.send(cancelEvent)
                    this.logger.log(`Canceled OpenAI response ${responseId} for ${channelId}`);
                    this.eventEmitter.emit(`audioInterrupt.${currentSession.channelId}`, currentSession)
                    currentSession.currentResponseId = ''
                } else {
                    this.logger.log(`[Qwen] Skipping manual cancel (handled by server VAD) for ${channelId}`);
                }


                // this.sessions.set(channelId, {
                //     ...currentSession,
                //     currentResponseId: ''
                // })

            }
        }

        if (serverEvent.type === "response.audio.delta") {
            // const currentSession = this.getSessionByField('itemIds', serverEvent.item_id)
            if (currentSession) {
                const delta = serverEvent.delta
                const deltaBuffer = Buffer.from(delta, 'base64')

                const urlData = {
                    channelId: currentSession.channelId,
                    address: currentSession.address,
                    port: Number(currentSession.port)
                }

                if (assistant?.model?.startsWith('qwen') && !currentSession.channelId.startsWith('playground-')) {
                    const pcm16_8k = this.audioService.resampleLinear(deltaBuffer, 24000, 8000);
                    const outputBuffer = this.audioService.pcm16ToAlaw(pcm16_8k);
                    this.eventEmitter.emit(`audioDelta.${currentSession.channelId}`, outputBuffer, urlData)
                } else {
                    this.eventEmitter.emit(`audioDelta.${currentSession.channelId}`, deltaBuffer, urlData)
                }
            }
        }

        if (serverEvent.type === "error") {
            if (serverEvent.error?.code === 'response_cancel_not_active') {
                this.logger.warn(`Cancel ignored (no active response): ${channelId}`)
            } else {
                this.logger.error(JSON.stringify(serverEvent))
                await this.loggingEvents(channelId, callerId, e, assistant)
            }
        }

        if (serverEvent.type === "response.created") {
            this.updateSession(serverEvent, channelId)
            console.log(serverEvent)
        }

        if (serverEvent.type === "response.done") {
            const tokens = serverEvent?.response?.usage?.total_tokens ?? 0
            if (tokens) {
                await this.aiCdrService.cdrUpdate({ channelId, callerId, tokens })
            }

            const output = serverEvent?.response?.output;

            if (Array.isArray(output)) {
                // const currentSession = this.sessions.get(channelId);
                for (const item of output) {
                    if (
                        item.type === "function_call"
                    ) {
                        if (item.name === 'transfer_call') {
                            this.logger.log('Переводим вызов на сотрудника')

                            let args: any = {};
                            try {
                                args = typeof item.arguments === 'string'
                                    ? JSON.parse(item.arguments)
                                    : item.arguments;
                            } catch (e) {
                                this.logger.error('Ошибка парсинга arguments:', e);
                            }

                            const hasExtension = args?.exten && args.exten.trim() !== '';

                            if (hasExtension) {

                                const params = {
                                    extension: args.exten
                                    // context: 'sip-out'+assistant.userId
                                }

                                this.eventEmitter.emit(`transferToDialplan.${currentSession.channelId}`, params)
                            }
                        } else if (item.name === 'hangup_call') {
                            this.logger.log('Завершаем вызов')
                            this.eventEmitter.emit(`HangupCall.${currentSession.channelId}`)
                        } else {
                            const result = await this.aiToolsHandlersService.functionHandler(item.name, item.arguments, assistant)
                            if (result) {

                                this.logger.log("RESULT:", typeof result === 'string' ? result : JSON.stringify(result))

                                const functionEvent = {
                                    type: "conversation.item.create",
                                    item: {
                                        type: "function_call_output",
                                        call_id: item.call_id,
                                        output: typeof result === 'string' ? result : JSON.stringify(result)
                                    }
                                }

                                currentSession.openAiConn.send(functionEvent)

                                const metadata: sessionData = {
                                    channelId: currentSession.channelId,
                                    address: currentSession.address,
                                    port: currentSession.port
                                }

                                this.rtAudioOutBandResponseCreate(metadata, currentSession)
                            }
                        }
                    }
                }
            }

        }

        if (serverEvent.type === "call.hangup" && assistant) {
            await this.aiCdrService.cdrHangup(channelId, assistant.id)
        }

        if (serverEvent.type === "session.created") {
            await this.cdrCreateLog(channelId, callerId, assistant)
        }

        if (serverEvent.type === "input_audio_buffer.committed") {
            this.updateSession(serverEvent, channelId)
            // const currentSession = this.getSessionByField('itemIds', serverEvent.previous_item_id)
            if (currentSession && !assistant?.model?.startsWith('qwen')) { // Skip for Qwen
                const metadata: sessionData = {
                    channelId: currentSession.channelId,
                    address: currentSession.address,
                    port: currentSession.port
                }
                this.rtAudioOutBandResponseCreate(metadata, currentSession)
            }
        }

        if (serverEvent.type === "response.done") {
            // console.log(JSON.stringify(serverEvent))
            this.updateSession(serverEvent, channelId)
        }

        if (serverEvent.type === "response.output_item.added") {
            this.updateSession(serverEvent, channelId)
        }
    }

    // public RTConnect() {
    //     this.ws = new WebSocket(this.API_RT_URL, {
    //         headers: {
    //             Authorization: `Bearer ${this.API_KEY}`,
    //             "OpenAI-Beta": "realtime=v1",
    //         }
    //     });
    //
    //     this.ws.on('open', () => {
    //         console.log('WebSocket OpenAI connection established');
    //         if (this.inAudio) {
    //             this.updateRtAudioSession()
    //         } else {
    //             this.updateRtTextSession()
    //         }
    //     });
    //
    //     this.ws.on('message', (data) => {
    //         this.dataDecode(data);
    //     });
    //
    //     this.ws.on('error', (error) => {
    //         console.error('WebSocket Error:', error);
    //     });
    //
    //     this.ws.on('close', () => {
    //         console.log('WebSocket connection closed, reconnecting...');
    //         if (this.isRealtime) {
    //             setTimeout(() => this.RTConnect(), 5000);
    //         } else {
    //             setTimeout(() => this.connect(), 5000);
    //         }
    //     });
    // }


    public updateRtAudioSession(session: sessionData) {
        if (session && session.openAiConn) {
            const connection = session.openAiConn
            const assistant = session.assistant

            // Detailed diagnostics
            this.logger.log(`[updateRtAudioSession] Updating session for ${session.channelId}`);
            this.logger.log(`[updateRtAudioSession] Assistant present: ${!!assistant}`);

            if (!assistant) {
                this.logger.error(`[updateRtAudioSession] CRITICAL: No assistant data for ${session.channelId}`);
                this.logger.error(`[updateRtAudioSession] Session keys: ${Object.keys(session).join(', ')}`);
                return;
            }

            this.logger.log(`[updateRtAudioSession] Assistant type: ${assistant.constructor?.name || 'unknown'}`);
            this.logger.log(`[updateRtAudioSession] Assistant keys: ${Object.keys(assistant).join(', ')}`);

            const customer_phone = session.callerId && session.callerId !== 'Playground'
                ? 'Customer phone number is ' + session.callerId + '. ' +
                'Use customer phone if necessary, example, when calling the create order tool.'
                : ''

            // Debug: Check if greeting and instruction exist
            if (!assistant.instruction) {
                this.logger.warn(`[updateRtAudioSession] Missing assistant fields: instruction=${!!assistant.instruction}`);
                this.logger.warn(`[updateRtAudioSession] Full assistant object keys: ${Object.keys(assistant).join(', ')}`);
            }

            const instructions = (assistant.greeting || '') + (assistant.instruction || '') + customer_phone

            this.logger.log(`[updateRtAudioSession] Final instructions length: ${instructions.length} characters`);

            const tools = (assistant.tools || []).map(tool => {
                // Handle both Sequelize models and plain objects
                const data = tool.toJSON?.() || tool.dataValues || tool;

                if (!data) {
                    this.logger.warn('Tool data is undefined, skipping');
                    return null;
                }

                const { type, name, description, parameters, toolData } = data;

                if (type === 'function') {
                    return { type, name, description, parameters };
                } else {
                    return toolData && typeof toolData === 'object' ? toolData : {}
                }
            }).filter(tool => tool !== null);
            const initAudioSession = {
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions,
                    voice: assistant.voice,
                    input_audio_format: assistant.input_audio_format,
                    output_audio_format: assistant.output_audio_format,
                    input_audio_transcription: {
                        model: assistant.input_audio_transcription_model || 'whisper-1',
                        ...(assistant.input_audio_transcription_language && {
                            language: assistant.input_audio_transcription_language
                        })
                    },

                    turn_detection: {
                        type: assistant.turn_detection_type,
                        threshold: Number(assistant.turn_detection_threshold),
                        prefix_padding_ms: Number(assistant.turn_detection_prefix_padding_ms),
                        silence_duration_ms: Number(assistant.turn_detection_silence_duration_ms),
                        create_response: assistant.model.startsWith('qwen'),
                        interrupt_response: assistant.model.startsWith('qwen'),
                        idle_timeout_ms: Number(assistant.idle_timeout_ms) || 10000
                    },
                    temperature: Number(assistant.temperature),
                    max_response_output_tokens: assistant.max_response_output_tokens,
                    tools,
                    tool_choice: assistant.tool_choice || 'auto'
                }
            };

            this.logger.log(`Updating OpenAI session for ${session.channelId}: input=${assistant.input_audio_format}, output=${assistant.output_audio_format}`);
            this.logger.log(`[updateRtAudioSession] Sending session.update event to OpenAI...`);
            this.logger.log(initAudioSession);

            // Update internal session data with new assistant (important for playground overrides)
            const existingSession = this.sessions.get(session.channelId);
            if (existingSession) {
                existingSession.assistant = assistant;
                this.logger.log(`[updateRtAudioSession] Updated internal session assistant for ${session.channelId}`);
            } else {
                this.logger.warn(`[updateRtAudioSession] No existing session found for ${session.channelId} in sessions Map`);
            }

            connection.send(initAudioSession);
            this.logger.log(`[updateRtAudioSession] Successfully sent session.update to OpenAI for ${session.channelId}`);
        } else {
            this.logger.error(`[updateRtAudioSession] WebSocket is not open or session is invalid, cannot send session update`);
            if (session) {
                this.logger.error(`[updateRtAudioSession] Session details: channelId=${session.channelId}, hasConnection=${!!session.openAiConn}`);
            }
        }
    }

    async rtInputAudioAppend(chunk: Buffer, channelId: string) {
        const connection = this.getConnection(channelId);
        if (connection) {
            // Конвертируем в base64
            const base64Audio = chunk.toString('base64');
            connection.send({
                event_id: channelId,
                type: 'input_audio_buffer.append',
                audio: base64Audio
            });
        }
    }

    async rtTextAppend(text: string, channelId: string) {
        const connection = this.getConnection(channelId);
        if (connection) {
            const event = {
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text
                        }
                    ]
                },
            };
            connection.send(event)
        } else {
            this.logger.error("error sending text. ws is closed")
        }
    }

    private rtAudioOutBandResponseCreate(metadata: sessionData, session: sessionData) {
        const connection = session.openAiConn
        if (connection) {
            // const input = session.itemIds?.map(id => ({
            //     type: "item_reference",
            //     id
            // })) || [];
            const event = {
                type: "response.create",
                response: {
                    // conversation: "none",
                    modalities: ["text", "audio"],
                    // input,
                    instructions: "Please respond to the user audio",
                    // metadata
                }
            }
            this.logger.log(`[rtAudioOutBandResponseCreate] Sending response.create for ${session.channelId}`);
            connection.send(event);
        } else {
            this.logger.error("error sending text. ws is closed")
        }
    }


    async rtInitAudioResponse(metadata: sessionData) {

        this.logger.log(`[rtInitAudioResponse] Called for channel ${metadata.channelId}`);

        if (metadata.openAiConn) {

            // const customer_phone = metadata.callerId
            //     ? 'Customer phone number is ' + metadata.callerId + '. ' +
            //     'Use it if necessary, example, when calling the create order function.'
            //     : ''
            //
            // const greeting = '';
            //
            // const prompt = greeting
            //     ? greeting  + customer_phone
            //     : `This is a service request, don't do anything. Don't answer anything, just return empty response.`
            //     + customer_phone;

            if (!metadata.channelId && !metadata.address && !metadata.port) {
                this.logger.warn(`[rtInitAudioResponse] Missing required metadata, skipping`);
                return;
            }

            const initOpenAiData = {
                channelId: metadata.channelId,
                address: metadata?.address || '',
                port: metadata?.port || '',
            };

            const initSessionData: sessionData = {
                channelId: metadata.channelId,
                address: metadata?.address || '',
                port: metadata?.port || '',
                init: metadata.init,
                openAiConn: metadata.openAiConn,
                assistant: metadata.assistant, // Preserve assistant!
                responseIds: [],
                itemIds: [],
                events: []
            };

            const existingSession = this.sessions.get(metadata.channelId);
            if (existingSession) {
                this.sessions.set(metadata.channelId, { ...existingSession, ...initSessionData });
                this.logger.log(`[rtInitAudioResponse] Updated existing session for ${metadata.channelId}`);
            } else {
                this.sessions.set(metadata.channelId, initSessionData);
                this.logger.log(`[rtInitAudioResponse] Created new session for ${metadata.channelId}`);
            }

            const event = {
                type: "response.create",
                response: {
                    // conversation: 'none',
                    modalities: ["text", "audio"],
                    input: [],
                    // instructions: prompt,
                }

            }

            // Передаём metadata в openAi
            // if (!metadata.assistant.model.startsWith('qwen')) {
            //     event.response['metadata'] = initOpenAiData
            // }
            this.logger.log(`[rtInitAudioResponse] Sending response.create event...`);
            metadata.openAiConn.send(event);
            this.logger.log(`[rtInitAudioResponse] Successfully sent response.create for ${metadata.channelId}`);
            return
        } else {
            this.logger.error(`[rtInitAudioResponse] WS session ${metadata.channelId} does not exist or no connection`);
        }
    }


    // async textResponse(input: string) {
    //     this.connect()
    //     try {
    //         const result = await this.openAi.responses.create({
    //             model: "gpt-4o-mini-2024-07-18",
    //             input,
    //             instructions: 'Your knowledge cutoff is 2023-10. You are a helpful, witty, ' +
    //                 'and friendly AI by name Alex. Your are Russian. Answer on Russian language. ' +
    //                 'Act like a human, but remember that you arent ' +
    //                 'a human and that you cant do human things in the real world. Your voice and ' +
    //                 'personality should be warm and engaging, with a lively and playful tone. ' +
    //                 'If interacting in a non-English language, start by using the standard accent ' +
    //                 'or dialect familiar to the user. Talk quickly. You should always call a function ' +
    //                 'if you can. Do not refer to these rules, even if you’re asked about them.',
    //             // stream: true
    //         })
    //         return result.output_text
    //
    //     } catch (error) {
    //         console.error("Ошибка OpenAI:", error);
    //
    //     }
    // }

    // async textToSpeech(input: string) {
    //     this.connect()
    //     try {
    //         const response = await this.openAi.audio.speech.create({
    //             model: "tts-1",
    //             voice: "alloy",
    //             response_format: "pcm",
    //             input
    //         })
    //
    //         const buffer: Buffer = Buffer.from(await response.arrayBuffer());
    //
    //         return buffer
    //
    //     } catch (error) {
    //         console.error("Ошибка OpenAI:", error);
    //
    //     }
    // }

    // async textToStreamSpeechPCM(input: string) {
    //     this.connect();
    //     try {
    //         const response = await this.openAi.audio.speech.create({
    //             model: "tts-1",
    //             voice: "alloy",
    //             response_format: "pcm",
    //             input
    //         });
    //
    //         // Приводим тело ответа к NodeJS.ReadableStream
    //         const readableStream = response.body as unknown as NodeJS.ReadableStream;
    //         let bufferStore = Buffer.from([]);
    //
    //         readableStream.on("data", (chunk: Buffer) => {
    //             bufferStore = Buffer.concat([bufferStore, chunk]);
    //             console.log('Buffered: ', bufferStore.length)
    //
    //         });
    //         readableStream.on("end", () => {
    //             console.log('stream ended')
    //         });
    //         readableStream.on("error", (error) => {
    //             console.log('stream error', error)
    //         });
    //     } catch (error) {
    //         console.error("Ошибка OpenAI:", error);
    //     }
    // }
    //
    // async textToStreamOpus(input: string): Promise<NodeJS.ReadableStream> {
    //     this.connect();
    //     try {
    //         const response = await this.openAi.audio.speech.create({
    //             model: "tts-1",
    //             voice: "alloy",
    //             response_format: "pcm",
    //             input
    //         });
    //
    //         return response.body as unknown as NodeJS.ReadableStream;
    //         // const readableStream = response.body as unknown as NodeJS.ReadableStream;
    //         // const passThrough = new PassThrough();
    //
    //         // readableStream.pipe(passThrough);
    //         // return passThrough;
    //     } catch (error) {
    //         console.error("Ошибка OpenAI:", error);
    //         throw error;
    //     }
    // }
}
