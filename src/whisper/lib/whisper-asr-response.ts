/**
 * Helpers for onerahmet/openai-whisper-asr-webservice.
 * The container returns Content-Type: text/plain for every `output` format.
 */

export interface WhisperAsrSegment {
    start: number;
    end: number;
    text: string;
    avg_logprob?: number;
    no_speech_prob?: number;
    compression_ratio?: number;
}

export interface ParsedWhisperAsr {
    text: string;
    duration?: number;
    language?: string;
    languageProbability?: number;
    segments: WhisperAsrSegment[];
    /** True when the body was valid JSON / VTT / SRT / TSV (not raw transcript). */
    structured: boolean;
}

export function buildWhisperAsrUrl(
    baseUrl: string,
    options?: { language?: string; vadFilter?: boolean },
): string {
    const url = new URL(baseUrl);
    // Replace — WHISPER_API_URL may already contain output=txt (FastAPI keeps the first value).
    url.searchParams.set('task', 'transcribe');
    url.searchParams.set('output', 'json');
    if (options?.vadFilter !== false) {
        url.searchParams.set('vad_filter', 'true');
    }
    if (options?.language && options.language !== 'auto') {
        url.searchParams.set('language', options.language);
    }
    return url.toString();
}

/** Python json.dump(allow_nan=True) emits NaN / Infinity — invalid in JSON.parse. */
export function sanitizePythonJson(raw: string): string {
    return raw
        .replace(/-Infinity\b/g, 'null')
        .replace(/\bInfinity\b/g, 'null')
        .replace(/\bNaN\b/g, 'null');
}

export function parseWhisperAsrResponse(body: unknown): ParsedWhisperAsr {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        return fromJsonObject(body as Record<string, unknown>);
    }

    const raw = typeof body === 'string' ? body : String(body ?? '');
    const trimmed = raw.trim();
    if (!trimmed) {
        return { text: '', segments: [], structured: false };
    }

    const jsonParsed = tryParseJson(trimmed);
    if (jsonParsed) return jsonParsed;

    if (/^WEBVTT\b/i.test(trimmed) || /^\d{1,2}:\d{2}[:.]\d/.test(trimmed)) {
        const vtt = parseVtt(trimmed);
        if (vtt.segments.length) return vtt;
    }

    if (/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/m.test(trimmed)) {
        const srt = parseSrt(trimmed);
        if (srt.segments.length) return srt;
    }

    if (/^start\tend\ttext\b/i.test(trimmed)) {
        const tsv = parseTsv(trimmed);
        if (tsv.segments.length) return tsv;
    }

    return { text: raw, segments: [], structured: false };
}

function tryParseJson(raw: string): ParsedWhisperAsr | null {
    for (const candidate of [raw, sanitizePythonJson(raw)]) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') {
                return fromJsonObject(parsed as Record<string, unknown>);
            }
        } catch {
            /* try next */
        }
    }
    return null;
}

function fromJsonObject(parsed: Record<string, unknown>): ParsedWhisperAsr {
    const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
    const segments = rawSegments
        .map((seg: any) => ({
            start: Number(seg?.start) || 0,
            end: Number(seg?.end) || 0,
            text: String(seg?.text || '').trim(),
            ...(typeof seg?.avg_logprob === 'number' ? { avg_logprob: seg.avg_logprob } : {}),
            ...(typeof seg?.no_speech_prob === 'number' ? { no_speech_prob: seg.no_speech_prob } : {}),
            ...(typeof seg?.compression_ratio === 'number' ? { compression_ratio: seg.compression_ratio } : {}),
        }))
        .filter((seg: WhisperAsrSegment) => seg.text.length > 0);

    const text = String(parsed.text || '').trim()
        || segments.map(s => s.text).join(' ').trim();

    const duration = Number(parsed.duration ?? parsed.duration_seconds)
        || (segments.length ? Number(segments[segments.length - 1].end) || 0 : 0);

    return {
        text,
        duration: duration || undefined,
        language: typeof parsed.language === 'string' ? parsed.language : undefined,
        languageProbability: numberOrUndef(parsed.language_probability ?? parsed.languageProbability),
        segments,
        structured: true,
    };
}

function numberOrUndef(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function parseTimestamp(raw: string): number {
    const t = raw.trim().replace(',', '.');
    const parts = t.split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

function parseVtt(raw: string): ParsedWhisperAsr {
    const segments: WhisperAsrSegment[] = [];
    const cueRe = /(?:^|\n)(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}).*\n([\s\S]*?)(?=\n\d{1,2}:\d{2}|\n*$)/g;
    let m: RegExpExecArray | null;
    while ((m = cueRe.exec(raw)) !== null) {
        const text = m[3].replace(/<[^>]+>/g, '').trim();
        if (!text) continue;
        segments.push({ start: parseTimestamp(m[1]), end: parseTimestamp(m[2]), text });
    }
    return {
        text: segments.map(s => s.text).join(' '),
        duration: segments.length ? segments[segments.length - 1].end : undefined,
        segments,
        structured: segments.length > 0,
    };
}

function parseSrt(raw: string): ParsedWhisperAsr {
    const segments: WhisperAsrSegment[] = [];
    const blocks = raw.split(/\n\s*\n/);
    for (const block of blocks) {
        const m = block.match(
            /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\s*\n([\s\S]+)/,
        );
        if (!m) continue;
        const text = m[3].replace(/<[^>]+>/g, '').trim();
        if (!text) continue;
        segments.push({ start: parseTimestamp(m[1]), end: parseTimestamp(m[2]), text });
    }
    return {
        text: segments.map(s => s.text).join(' '),
        duration: segments.length ? segments[segments.length - 1].end : undefined,
        segments,
        structured: segments.length > 0,
    };
}

function parseTsv(raw: string): ParsedWhisperAsr {
    const segments: WhisperAsrSegment[] = [];
    const lines = raw.split(/\r?\n/).slice(1);
    for (const line of lines) {
        if (!line.trim()) continue;
        const [startMs, endMs, ...rest] = line.split('\t');
        const text = rest.join('\t').trim();
        if (!text) continue;
        segments.push({
            start: (Number(startMs) || 0) / 1000,
            end: (Number(endMs) || 0) / 1000,
            text,
        });
    }
    return {
        text: segments.map(s => s.text).join(' '),
        duration: segments.length ? segments[segments.length - 1].end : undefined,
        segments,
        structured: segments.length > 0,
    };
}
