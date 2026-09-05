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

export function isOpenAiChatMessage(value: unknown): value is {
    role: string;
    content?: unknown;
} {
    return !!value && typeof value === 'object' && typeof (value as { role?: unknown }).role === 'string';
}
