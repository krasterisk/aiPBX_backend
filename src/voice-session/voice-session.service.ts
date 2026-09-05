import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AssistantsService } from '../assistants/assistants.service';
import { NonRealtimeService } from '../non-realtime/non-realtime.service';
import { AudioService } from '../audio/audio.service';
import { Assistant } from '../assistants/assistants.model';
import {
    mapPipelineEvent,
    resolveSampleRate,
    toPcmBuffer,
    VOICE_VAD_SAMPLE_RATE,
    VoiceClient,
    VoiceSampleRate,
    VoiceSessionStartDto,
} from './voice-session.protocol';

interface VoiceSession {
    socketId: string;
    channelId: string;
    userId: number;
    assistant: Assistant;
    inputSampleRate: VoiceSampleRate;
    outputSampleRate: VoiceSampleRate;
}

@Injectable()
export class VoiceSessionService {
    private readonly logger = new Logger(VoiceSessionService.name);
    private readonly sessions = new Map<string, VoiceSession>();

    constructor(
        private readonly assistantsService: AssistantsService,
        private readonly nonRealtimeService: NonRealtimeService,
        private readonly audioService: AudioService,
        private readonly eventEmitter: EventEmitter2,
    ) {}

    async startSession(client: VoiceClient, userId: number, dto: VoiceSessionStartDto): Promise<void> {
        try {
            const inputSampleRate = resolveSampleRate(dto.inputSampleRate);
            const outputSampleRate = resolveSampleRate(dto.outputSampleRate);
            const assistantId = Number(dto.assistantId);
            if (!assistantId) {
                client.emit('error', { message: 'assistantId is required' });
                return;
            }

            const raw = await this.assistantsService.getAssistantById(assistantId);
            const assistantData = (raw.toJSON ? raw.toJSON() : raw) as Assistant;
            if (Number(assistantData.userId) !== Number(userId)) {
                client.emit('error', { message: 'Assistant not found' });
                return;
            }

            if (this.sessions.has(client.id)) {
                await this.endSession(client.id);
            }

            const channelId = `voice-${client.id}`;
            const assistant = {
                ...assistantData,
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
            } as Assistant;

            this.bindSessionEvents(client, channelId, outputSampleRate);

            this.sessions.set(client.id, {
                socketId: client.id,
                channelId,
                userId,
                assistant,
                inputSampleRate,
                outputSampleRate,
            });

            await this.nonRealtimeService.createSession(
                channelId,
                dto.callerId?.trim() || 'VoiceSession',
                assistant,
                'websocket',
                '0',
            );

            client.emit('session.ready', {
                channelId,
                assistantId: assistant.id,
                inputSampleRate,
                outputSampleRate,
            });
        } catch (err) {
            const message = err.status === 404 ? 'Assistant not found' : (err.message || 'Failed to start session');
            this.logger.warn(`startSession failed: ${message}`);
            client.emit('error', { message });
        }
    }

    async handleAudio(socketId: string, audio: unknown): Promise<void> {
        const session = this.sessions.get(socketId);
        if (!session) return;

        let pcm: Buffer;
        try {
            pcm = toPcmBuffer(audio);
        } catch {
            return;
        }

        const forVad = session.inputSampleRate === VOICE_VAD_SAMPLE_RATE
            ? pcm
            : this.audioService.resampleLinear(pcm, session.inputSampleRate, VOICE_VAD_SAMPLE_RATE);

        await this.nonRealtimeService.processAudio(forVad, session.channelId);
    }

    async endSession(socketId: string): Promise<void> {
        const session = this.sessions.get(socketId);
        if (!session) return;

        this.eventEmitter.removeAllListeners(`audioDelta.${session.channelId}`);
        this.eventEmitter.removeAllListeners(`voice.event.${session.channelId}`);
        await this.nonRealtimeService.closeSession(session.channelId);
        this.sessions.delete(socketId);
    }

    private bindSessionEvents(client: VoiceClient, channelId: string, outputSampleRate: VoiceSampleRate): void {
        this.eventEmitter.on(`audioDelta.${channelId}`, (chunk: Buffer, sourceRate = 24000) => {
            const pcm = sourceRate === outputSampleRate
                ? chunk
                : this.audioService.resampleLinear(chunk, sourceRate, outputSampleRate);
            client.emit('audio', pcm);
        });

        this.eventEmitter.on(`voice.event.${channelId}`, (pipelineEvent: { type?: string }) => {
            const mapped = mapPipelineEvent(pipelineEvent);
            if (mapped) {
                client.emit(mapped.event, mapped.payload);
            }
        });
    }
}
