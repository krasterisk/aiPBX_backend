export const DEFAULT_COMPAT_MODEL = 'gemma4:e4b';

export function pickOllamaModel(
    requested: string | undefined,
    available: string[],
    fallback: string,
): string {
    const name = requested?.trim();
    if (!name) return fallback;
    if (available.includes(name)) return name;
    const prefixed = available.find((m) => m.startsWith(`${name}:`));
    if (prefixed) return prefixed;
    return fallback;
}

export function stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '');
}

/** Incremental <think> filter for streamed tokens that may split a tag across chunks. */
export function stripThinkIncremental(
    text: string,
    insideThink: boolean,
): { text: string; insideThink: boolean } {
    let out = '';
    let i = 0;
    let inside = insideThink;
    while (i < text.length) {
        if (!inside) {
            const start = text.indexOf('<think>', i);
            if (start === -1) {
                out += text.slice(i);
                break;
            }
            out += text.slice(i, start);
            inside = true;
            i = start + '<think>'.length;
        } else {
            const end = text.indexOf('</think>', i);
            if (end === -1) {
                break;
            }
            inside = false;
            i = end + '</think>'.length;
        }
    }
    return { text: out, insideThink: inside };
}

export function textFromContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object') {
                    const rec = part as { text?: unknown; content?: unknown };
                    if (typeof rec.text === 'string') return rec.text;
                    if (typeof rec.content === 'string') return rec.content;
                }
                return '';
            })
            .join('');
    }
    return '';
}

/** Final assistant text from an Ollama / OpenAI message object. */
export function extractAssistantText(message: any): string {
    const direct = textFromContent(message?.content);
    const stripped = stripThinkTags(direct).trim();
    if (stripped) return stripped;

    const extras = [message?.reasoning, message?.thinking, message?.reasoning_content];
    for (const extra of extras) {
        const text = textFromContent(extra).trim();
        if (text) return stripThinkTags(text).trim() || text;
    }

    // Whole reply was wrapped in <think>…</think> — keep the inner text.
    const inner = direct.match(/<think>([\s\S]*?)<\/think>/);
    if (inner?.[1]?.trim()) return inner[1].trim();

    return '';
}

export function isOpenAiChatMessage(value: unknown): value is {
    role: string;
    content?: unknown;
} {
    return !!value && typeof value === 'object' && typeof (value as { role?: unknown }).role === 'string';
}

/** Ollama may put text on delta.content or on the final message.content. */
export function extractOpenAiChunkText(chunk: any): string {
    const choice = chunk?.choices?.[0];
    const fromDelta = textFromContent(choice?.delta?.content);
    if (fromDelta) return fromDelta;
    return textFromContent(choice?.message?.content);
}

export function chunkHasVisibleText(chunk: any): boolean {
    if (extractOpenAiChunkText(chunk).trim().length > 0) return true;
    const choice = chunk?.choices?.[0];
    return !!(choice?.delta?.tool_calls?.length || choice?.message?.tool_calls?.length);
}
