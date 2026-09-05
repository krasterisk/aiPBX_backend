jest.mock('../assistants/assistants.service', () => ({ AssistantsService: class AssistantsService {} }));
jest.mock('../non-realtime/non-realtime.service', () => ({ NonRealtimeService: class NonRealtimeService {} }));
jest.mock('../audio/audio.service', () => ({ AudioService: class AudioService {} }));

import { EventEmitter2 } from '@nestjs/event-emitter';
import { VoiceSessionService } from './voice-session.service';
import { VoiceClient } from './voice-session.protocol';

function fakeClient(): VoiceClient & { events: Array<{ event: string; payload?: unknown }> } {
    const events: Array<{ event: string; payload?: unknown }> = [];
    return {
        id: 'sock-1',
        events,
        emit(event: string, payload?: unknown) {
            events.push({ event, payload });
        },
    };
}

describe('VoiceSessionService', () => {
    let assistantsService: { getAssistantById: jest.Mock };
    let nonRealtimeService: { createSession: jest.Mock; processAudio: jest.Mock; closeSession: jest.Mock };
    let audioService: { resampleLinear: jest.Mock };
    let eventEmitter: EventEmitter2;
    let service: VoiceSessionService;
    let client: ReturnType<typeof fakeClient>;

    const assistant = {
        id: 7,
        userId: 42,
        name: 'Bot',
        greeting: 'Алло',
        pipelineMode: 'non-realtime',
        toJSON() { return this; },
    };

    beforeEach(() => {
        assistantsService = { getAssistantById: jest.fn().mockResolvedValue(assistant) };
        nonRealtimeService = {
            createSession: jest.fn().mockResolvedValue({}),
            processAudio: jest.fn().mockResolvedValue(undefined),
            closeSession: jest.fn().mockResolvedValue(undefined),
        };
        audioService = {
            resampleLinear: jest.fn((buf: Buffer, from: number, to: number) => {
                if (from === to) return buf;
                return Buffer.from([9, 0]);
            }),
        };
        eventEmitter = new EventEmitter2();
        service = new VoiceSessionService(
            assistantsService as never,
            nonRealtimeService as never,
            audioService as never,
            eventEmitter,
        );
        client = fakeClient();
    });

    it('starts a session for an owned assistant and emits session.ready', async () => {
        await service.startSession(client, 42, { assistantId: 7, inputSampleRate: 16000, outputSampleRate: 16000 });

        expect(nonRealtimeService.createSession).toHaveBeenCalledWith(
            'voice-sock-1',
            'VoiceSession',
            expect.objectContaining({ id: 7, input_audio_format: 'pcm16', output_audio_format: 'pcm16' }),
            'websocket',
            '0',
        );
        expect(client.events).toContainEqual({
            event: 'session.ready',
            payload: {
                channelId: 'voice-sock-1',
                assistantId: 7,
                inputSampleRate: 16000,
                outputSampleRate: 16000,
            },
        });
    });

    it('rejects assistant that belongs to another user', async () => {
        await service.startSession(client, 99, { assistantId: 7 });

        expect(nonRealtimeService.createSession).not.toHaveBeenCalled();
        expect(client.events[0].event).toBe('error');
        expect(client.events[0].payload).toEqual({ message: 'Assistant not found' });
    });

    it('rejects unsupported sample rate', async () => {
        await service.startSession(client, 42, { assistantId: 7, inputSampleRate: 44100 });

        expect(nonRealtimeService.createSession).not.toHaveBeenCalled();
        expect(client.events[0]).toEqual({
            event: 'error',
            payload: { message: expect.stringContaining('Unsupported sample rate') },
        });
    });

    it('resamples incoming audio to 16 kHz for VAD', async () => {
        await service.startSession(client, 42, { assistantId: 7, inputSampleRate: 8000 });
        const pcm = Buffer.from([1, 0, 2, 0]);
        await service.handleAudio(client.id, pcm);

        expect(audioService.resampleLinear).toHaveBeenCalledWith(pcm, 8000, 16000);
        expect(nonRealtimeService.processAudio).toHaveBeenCalledWith(Buffer.from([9, 0]), 'voice-sock-1');
    });

    it('forwards pipeline events and resamples TTS chunks to the client output rate', async () => {
        await service.startSession(client, 42, { assistantId: 7, outputSampleRate: 8000 });

        eventEmitter.emit('voice.event.voice-sock-1', {
            type: 'conversation.item.input_audio_transcription.completed',
            transcript: 'привет',
        });
        eventEmitter.emit('audioDelta.voice-sock-1', Buffer.from([3, 0, 4, 0]), 24000);

        expect(client.events).toContainEqual({
            event: 'transcript.user',
            payload: { text: 'привет' },
        });
        expect(audioService.resampleLinear).toHaveBeenCalledWith(Buffer.from([3, 0, 4, 0]), 24000, 8000);
        expect(client.events).toContainEqual({
            event: 'audio',
            payload: Buffer.from([9, 0]),
        });
    });

    it('closes the pipeline session on end', async () => {
        await service.startSession(client, 42, { assistantId: 7 });
        await service.endSession(client.id);

        expect(nonRealtimeService.closeSession).toHaveBeenCalledWith('voice-sock-1');
        await service.handleAudio(client.id, Buffer.from([1, 0]));
        expect(nonRealtimeService.processAudio).not.toHaveBeenCalled();
    });
});
