import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {OpenAiConnection} from "./open-ai.connection";
import {WsServerGateway} from "../ws-server/ws-server.gateway";
import {Assistant} from "../assistants/assistants.model";
import {AiCdrService} from "../ai-cdr/ai-cdr.service";


export interface sessionData {
    channelId?: string
    callerId?: string
    address: string
    port: string
    openAiConn?: OpenAiConnection
    responseIds?: string[]
    itemIds?: string[]
    init?: string
    events?: object[]
    assistant?: Assistant
}

@Injectable()
export class OpenAiService implements OnModuleInit {
    private readonly API_KEY = process.env.OPENAI_API_KEY;
    private sessions = new Map<string, sessionData>();
    private readonly logger = new Logger(OpenAiService.name);

    constructor(
        public eventEmitter: EventEmitter2,
        @Inject(WsServerGateway) private readonly wsGateway: WsServerGateway,
        @Inject(AiCdrService) private readonly  aiCdrService: AiCdrService
    ) {}

    createConnection(channelId: string, assistant: Assistant): OpenAiConnection {

        const session: sessionData = this.sessions.get(channelId)

        if (session && session.openAiConn) {
                return session.openAiConn
        }

        const connection = new OpenAiConnection(
            this.API_KEY,
            channelId,
            this.eventEmitter,
            assistant
        );

        this.sessions.set(channelId, {
            channelId: channelId || session?.channelId,
            address: session?.address || '',
            port: session?.port || '',
            itemIds: session?.itemIds || [],
            responseIds: session?.responseIds || [],
            events: session?.events || [],
            init: session?.init || 'false',
            openAiConn: connection,
            assistant
        });

        return connection;
    }

    getConnection(channelId: string): OpenAiConnection | undefined {
        const session = this.sessions.get(channelId);
        if(session.openAiConn) {
            return session.openAiConn
        }
    }

    closeConnection(channelId: string) {
        const session = this.sessions.get(channelId);
        if(session.openAiConn) {
            const connection = session.openAiConn
            connection.close();
            this.sessions.delete(channelId);
        }
    }

    onModuleInit() {
        // if (this.isRealtime) {
        //     this.RTConnect();
        // }
    }

    private updateSession(serverEvent: any) {
        const channelId = serverEvent?.response?.metadata?.channelId;
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
            existingSession.responseIds = Array.isArray(existingSession.responseIds)
                ? [...new Set([...existingSession.responseIds, responseId])]
                : [responseId];
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

    private async loggingEvents(channelId: string, callerId: string, event: any, assistant: Assistant) {
        try {
            if (channelId && assistant) {
                this.wsGateway.sendToClient(channelId, callerId, event)
                await this.aiCdrService.create({
                    channelId,
                    callerId,
                    data: event,
                    assistantId: assistant.id,
                    assistantName: assistant.name,
                    userId: assistant.userId,
                    vPbxUserId: assistant.user.vpbx_user_id
                })
            }
        } catch (e) {
            this.logger.error(JSON.stringify(event))
        }

    }

    public async dataDecode(e, channelId: string, callerId: string, assistant: Assistant) {

        const serverEvent = typeof e === 'string' ? JSON.parse(e) : e;

       if (serverEvent.type !== "response.audio.delta") {
           await this.loggingEvents(channelId,callerId,e, assistant)
          // console.log(JSON.stringify(Array.from(this.sessions.entries()), null, 2));
       }

        if (serverEvent.type === "response.audio.delta") {
            const currentSession = this.getSessionByField('itemIds', serverEvent.item_id)
            if (currentSession) {
                const delta = serverEvent.delta
                const deltaBuffer = Buffer.from(delta, 'base64')
                const urlData = {
                    channelId: currentSession.channelId,
                    address: currentSession.address,
                    port: Number(currentSession.port)
                }
                    this.eventEmitter.emit(`audioDelta.${currentSession.channelId}`, deltaBuffer, urlData)
            }
        }

        if (serverEvent.type === "error") {
            this.logger.error(JSON.stringify(serverEvent))
            await this.loggingEvents(channelId,callerId,e, assistant)
        }

        if (serverEvent.type === "response.created") {
            this.updateSession(serverEvent)
        }

        if (serverEvent.type === "input_audio_buffer.committed") {
            this.updateSession(serverEvent)
            const currentSession = this.getSessionByField('itemIds', serverEvent.previous_item_id)
            if (currentSession) {
                const metadata: sessionData = {
                    channelId: currentSession.channelId,
                    address: currentSession.address,
                    port: currentSession.port
                }
                this.rtAudioOutBandResponseCreate(metadata,currentSession)
            }
        }

        if (serverEvent.type === "response.done") {
            // console.log(JSON.stringify(serverEvent))
            this.updateSession(serverEvent)
        }

        if (serverEvent.type === "response.output_item.added") {
             this.updateSession(serverEvent)
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
            if(!assistant) {
                this.logger.error(`Can't update session, not assistant data`)
            }

            const tools = (assistant.tools || []).map(tool => {
                const data = tool.toJSON?.() || tool.dataValues;
                const { type, name, description, parameters } = data;
                return { type, name, description, parameters };
            });
            const initAudioSession = {
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: assistant.instruction,
                    voice: assistant.voice,
                    input_audio_format: assistant.input_audio_format,
                    output_audio_format: assistant.output_audio_format,
                    input_audio_transcription: {
                        model: assistant.input_audio_transcription_model,
                        language: assistant.input_audio_transcription_language
                    },
                    turn_detection: {
                        type: assistant.turn_detection_type,
                        threshold: Number(assistant.turn_detection_threshold),
                        prefix_padding_ms: Number(assistant.turn_detection_prefix_padding_ms),
                        silence_duration_ms: Number(assistant.turn_detection_silence_duration_ms),
                        create_response: false,
                        interrupt_response: false
                    },
                    temperature: Number(assistant.temperature),
                    max_response_output_tokens: assistant.max_response_output_tokens,
                    tools,
                    tool_choice: 'auto'
                }
            };
            connection.send(initAudioSession)
        } else {
            this.logger.error('WebSocket is not open, cannot send session update');
        }
    }

    async rtInputAudioAppend(chunk: Buffer, channelId: string) {
        const connection = this.getConnection(channelId);
        if (connection) {
            // Конвертируем PCM16 в base64
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
                    metadata
                }
            }
            connection.send(event);
        } else {
            this.logger.error("error sending text. ws is closed")
        }
    }


    async rtInitAudioResponse(metadata: sessionData) {

        if (metadata.openAiConn) {

            await this.updateRtAudioSession(metadata)

            const greeting = metadata.assistant.greeting

            const prompt = greeting
                ? greeting
                : `This is a service request, don't do anything. Don't answer anything, just return empty response`;


            console.log(greeting)

            if (!metadata.channelId && !metadata.address && !metadata.port) return;

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
                responseIds: [],
                itemIds: [],
                events: []
            };

            this.sessions.set(metadata.channelId, initSessionData);

            const event = {
                type: "response.create",
                response: {
                    // conversation: 'none',
                    // modalities: ["text","audio"],
                    input: [],
                    instructions: prompt,
                    metadata: initOpenAiData,
                }
            }
            metadata.openAiConn.send(event);
        } else {
            this.logger.error(`WS session ${metadata.channelId} do not exist`)
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
