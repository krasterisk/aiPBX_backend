export const VOICE_ALLOWED_SAMPLE_RATES = [8000, 16000, 24000] as const;
export const VOICE_VAD_SAMPLE_RATE = 16000;
export const VOICE_DEFAULT_SAMPLE_RATE = 16000;

export type VoiceSampleRate = (typeof VOICE_ALLOWED_SAMPLE_RATES)[number];

export interface VoiceSessionStartDto {
    assistantId: number | string;
    inputSampleRate?: number;
    outputSampleRate?: number;
    callerId?: string;
}

export interface VoiceClient {
    id: string;
    emit(event: string, payload?: unknown): void;
}

export function isAllowedSampleRate(rate: number | undefined): rate is VoiceSampleRate {
    return rate != null && (VOICE_ALLOWED_SAMPLE_RATES as readonly number[]).includes(rate);
}

export function resolveSampleRate(
    rate: number | undefined,
    fallback: VoiceSampleRate = VOICE_DEFAULT_SAMPLE_RATE,
): VoiceSampleRate {
    if (rate == null) return fallback;
    if (!isAllowedSampleRate(rate)) {
        throw new Error(`Unsupported sample rate ${rate}. Allowed: ${VOICE_ALLOWED_SAMPLE_RATES.join(', ')}`);
    }
    return rate;
}

export function toPcmBuffer(audio: unknown): Buffer {
    if (Buffer.isBuffer(audio)) return audio;
    if (audio instanceof ArrayBuffer) return Buffer.from(audio);
    if (audio instanceof Uint8Array) return Buffer.from(audio);
    if (audio && typeof audio === 'object' && Array.isArray((audio as { data?: unknown }).data)) {
        return Buffer.from((audio as { data: number[] }).data);
    }
    throw new Error('audio must be PCM16 LE binary');
}

export function extractAssistantTranscript(event: any): string | undefined {
    return event?.response?.output?.[0]?.content?.[0]?.transcript
        || event?.transcript;
}

export function mapPipelineEvent(event: { type?: string; transcript?: string; [key: string]: unknown }):
    { event: string; payload?: unknown } | null {
    switch (event?.type) {
        case 'input_audio_buffer.speech_started':
            return { event: 'speech.start' };
        case 'input_audio_buffer.speech_stopped':
            return { event: 'speech.end' };
        case 'conversation.item.input_audio_transcription.completed':
            return { event: 'transcript.user', payload: { text: event.transcript || '' } };
        case 'response.done': {
            const text = extractAssistantTranscript(event);
            return text ? { event: 'transcript.assistant', payload: { text } } : null;
        }
        case 'audio.interrupted':
            return { event: 'interrupt' };
        default:
            return null;
    }
}

export function extractApiKeyToken(handshake: {
    auth?: { token?: string };
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
}): string | null {
    const fromAuth = handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();

    const header = handshake.headers?.authorization;
    const headerValue = Array.isArray(header) ? header[0] : header;
    if (headerValue?.startsWith('Bearer ')) return headerValue.slice('Bearer '.length).trim();

    const query = handshake.query?.token;
    const queryValue = Array.isArray(query) ? query[0] : query;
    if (typeof queryValue === 'string' && queryValue.trim()) return queryValue.trim();

    return null;
}
