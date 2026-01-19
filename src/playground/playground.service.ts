import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Socket } from 'socket.io';
import { AssistantsService } from '../assistants/assistants.service';
import { OpenAiService, sessionData } from '../open-ai/open-ai.service';
import { Assistant } from '../assistants/assistants.model';
import { WsServerGateway } from '../ws-server/ws-server.gateway';

interface PlaygroundSession {
    socketId: string;
    channelId: string;
    assistant: Assistant;
    openAiConn?: any;
    audioDeltaHandler?: (outAudio: Buffer, serverData: sessionData) => Promise<void>;
    audioInterruptHandler?: (serverData: sessionData) => Promise<void>;
}

@Injectable()
export class PlaygroundService implements OnModuleInit {
    private logger = new Logger(PlaygroundService.name);
    private sessions = new Map<string, PlaygroundSession>(); // socketId -> session
    private initializingSocketIds = new Set<string>(); // Track sockets currently initializing

    constructor(
        private assistantsService: AssistantsService,
        private openAiService: OpenAiService,
        private eventEmitter: EventEmitter2,
        private wsGateway: WsServerGateway
    ) { }

    onModuleInit() {
        this.eventEmitter.on('playground.init', (client, assistantId) => this.handleInit(client, assistantId));
        this.eventEmitter.on('playground.audio_in', (socketId, audio) => this.handleAudioIn(socketId, audio));
        this.eventEmitter.on('playground.stop', (socketId) => this.handleStop(socketId));
    }

    async handleInit(client: Socket, assistantId: string) {
        const socketId = client.id;

        // Prevent concurrent initialization for the same socket
        if (this.initializingSocketIds.has(socketId)) {
            this.logger.warn(`Ignoring duplicate init request for ${socketId} - already initializing`);
            return;
        }

        this.initializingSocketIds.add(socketId);

        try {
            this.logger.log(`Initializing playground session for ${socketId}, assistant ${assistantId}`);

            const assistant = await this.assistantsService.getAssistantById(assistantId);
            if (!assistant) {
                this.wsGateway.server.to(socketId).emit('playground.error', 'Assistant not found');
                return;
            }

            // Clean up existing session if any (only if it exists)
            const existingSession = this.sessions.get(socketId);
            if (existingSession) {
                this.logger.log(`Cleaning up existing session for ${socketId}`);
                await this.cleanupSession(socketId);
            }

            const channelId = `playground-${socketId}`; // Unique ID for OpenAI context

            const session: PlaygroundSession = {
                socketId,
                channelId,
                assistant
            };
            this.sessions.set(socketId, session);

            // Init OpenAI Connection
            const openAiConnection = await this.openAiService.createConnection(channelId, assistant);
            session.openAiConn = openAiConnection;

            // Register handlers to receive audio from OpenAI
            this.registerOpenAiHandlers(session);

            // Initialize OpenAI Session
            // IMPORTANT: Override audio formats for playground (browser uses PCM16, not G.711)
            // We need to properly extract Sequelize model data first
            const assistantData = assistant.toJSON ? assistant.toJSON() : assistant;

            this.logger.log(`Playground assistant data check: greeting=${!!assistantData.greeting}, instruction=${!!assistantData.instruction}`);
            if (!assistantData.instruction) {
                this.logger.error(`CRITICAL: Assistant ${assistantId} has NO instruction in playgroundData! Keys: ${Object.keys(assistantData).join(', ')}`);
            }

            const playgroundSessionData: sessionData = {
                channelId,
                address: 'websocket',
                port: '0',
                init: 'false',
                openAiConn: openAiConnection,
                assistant: {
                    ...assistantData,
                    // Override audio formats for browser compatibility
                    input_audio_format: 'pcm16',
                    output_audio_format: 'pcm16'
                } as Assistant
            };

            this.logger.log(`Initializing OpenAI session with PCM16 audio format for playground`);
            await this.openAiService.updateRtAudioSession(playgroundSessionData);
            // await this.openAiService.rtInitAudioResponse(playgroundSessionData);

            this.wsGateway.server.to(socketId).emit('playground.ready');

        } catch (e) {
            this.logger.error(`Error initializing playground: ${e.message}`, e.stack);
            this.wsGateway.server.to(client.id).emit('playground.error', e.message);
        } finally {
            // Always remove from initializing set
            this.initializingSocketIds.delete(socketId);
        }
    }

    async handleAudioIn(socketId: string, audio: Buffer) {
        const session = this.sessions.get(socketId);
        if (!session) {
            this.logger.warn(`Audio received for unknown session: ${socketId}`);
            return;
        }

        // Log first audio chunk
        if (!session['audioReceived']) {
            this.logger.log(`First audio chunk received for ${session.channelId}, size: ${audio.length} bytes`);
            session['audioReceived'] = true;
        }

        // Forward raw audio to OpenAI
        this.openAiService.rtInputAudioAppend(audio, session.channelId);
    }

    async handleStop(socketId: string) {
        await this.cleanupSession(socketId);
        this.wsGateway.server.to(socketId).emit('playground.stopped');
    }

    private registerOpenAiHandlers(session: PlaygroundSession) {
        // Main OpenAI event handler - processes ALL events from OpenAI
        this.openAiService.eventEmitter.on(
            `openai.${session.channelId}`,
            (event) => this.openAiService.dataDecode(
                event,
                session.channelId,
                '', // No caller ID for playground
                session.assistant
            )
        );

        session.audioDeltaHandler = async (outAudio: Buffer, serverData: sessionData) => {
            // Log first outgoing audio
            if (!session['audioSent']) {
                this.logger.log(`First audio chunk from OpenAI for ${session.channelId}, size: ${outAudio.length} bytes`);
                session['audioSent'] = true;
            }

            // Send audio chunk back to frontend via WS
            this.wsGateway.server.to(session.socketId).emit('playground.audio_out', outAudio);
        };

        session.audioInterruptHandler = async (serverData: sessionData) => {
            this.logger.log(`Audio interrupt for ${session.channelId}`);
            this.wsGateway.server.to(session.socketId).emit('playground.interrupt');
        };

        this.openAiService.eventEmitter.on(`audioDelta.${session.channelId}`, session.audioDeltaHandler);
        this.openAiService.eventEmitter.on(`audioInterrupt.${session.channelId}`, session.audioInterruptHandler);

        this.openAiService.eventEmitter.on(`HangupCall.${session.channelId}`, () => {
            this.handleStop(session.socketId);
        });

        this.logger.log(`Event handlers registered for ${session.channelId}`);
    }

    private async cleanupSession(socketId: string) {
        const session = this.sessions.get(socketId);
        if (!session) return;

        this.logger.log(`Cleaning up session ${session.channelId}`);

        // Remove all event listeners
        this.openAiService.eventEmitter.removeAllListeners(`openai.${session.channelId}`);

        if (session.audioDeltaHandler) {
            this.openAiService.eventEmitter.off(`audioDelta.${session.channelId}`, session.audioDeltaHandler);
        }
        if (session.audioInterruptHandler) {
            this.openAiService.eventEmitter.off(`audioInterrupt.${session.channelId}`, session.audioInterruptHandler);
        }

        await this.openAiService.closeConnection(session.channelId);
        this.sessions.delete(socketId);
    }
}
