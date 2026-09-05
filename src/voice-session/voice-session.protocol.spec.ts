import {
    extractApiKeyToken,
    extractAssistantTranscript,
    mapPipelineEvent,
    resolveSampleRate,
    toPcmBuffer,
} from './voice-session.protocol';

describe('voice-session protocol', () => {
    it('resolves allowed sample rates and rejects others', () => {
        expect(resolveSampleRate(undefined)).toBe(16000);
        expect(resolveSampleRate(8000)).toBe(8000);
        expect(() => resolveSampleRate(44100)).toThrow(/Unsupported sample rate/);
    });

    it('normalizes PCM payloads to Buffer', () => {
        const raw = Buffer.from([1, 0, 2, 0]);
        expect(toPcmBuffer(raw)).toEqual(raw);
        expect(toPcmBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))).toEqual(raw);
        expect(toPcmBuffer({ type: 'Buffer', data: [1, 0, 2, 0] })).toEqual(raw);
        expect(() => toPcmBuffer('nope')).toThrow(/PCM16/);
    });

    it('maps pipeline events to the public protocol', () => {
        expect(mapPipelineEvent({ type: 'input_audio_buffer.speech_started' })).toEqual({ event: 'speech.start' });
        expect(mapPipelineEvent({ type: 'input_audio_buffer.speech_stopped' })).toEqual({ event: 'speech.end' });
        expect(mapPipelineEvent({
            type: 'conversation.item.input_audio_transcription.completed',
            transcript: 'привет',
        })).toEqual({ event: 'transcript.user', payload: { text: 'привет' } });
        expect(mapPipelineEvent({ type: 'audio.interrupted' })).toEqual({ event: 'interrupt' });
        expect(mapPipelineEvent({
            type: 'response.done',
            response: { output: [{ type: 'message', content: [{ transcript: 'ответ' }] }] },
        })).toEqual({ event: 'transcript.assistant', payload: { text: 'ответ' } });
        expect(mapPipelineEvent({ type: 'function_call.completed' })).toBeNull();
    });

    it('extracts API key from handshake auth, header or query', () => {
        expect(extractApiKeyToken({ auth: { token: 'aipbx_abc' } })).toBe('aipbx_abc');
        expect(extractApiKeyToken({ headers: { authorization: 'Bearer aipbx_hdr' } })).toBe('aipbx_hdr');
        expect(extractApiKeyToken({ query: { token: 'aipbx_q' } })).toBe('aipbx_q');
        expect(extractApiKeyToken({})).toBeNull();
    });

    it('reads assistant transcript from response.done shape', () => {
        expect(extractAssistantTranscript({
            response: { output: [{ content: [{ transcript: 'ок' }] }] },
        })).toBe('ок');
    });
});
