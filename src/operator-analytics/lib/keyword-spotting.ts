/**
 * Lightweight keyword spotting for compliance phrases / competitor mentions (R&D).
 * Case-insensitive substring match on normalized transcript text.
 */
export function parseKeywordList(raw?: string | null): string[] {
    if (!raw?.trim()) return [];
    return raw.split(',').map(k => k.trim()).filter(Boolean);
}

export function spotKeywords(transcription: string, keywords: string[]): string[] {
    if (!transcription?.trim() || !keywords.length) return [];
    const haystack = transcription.toLowerCase();
    const hits: string[] = [];
    for (const kw of keywords) {
        if (!kw) continue;
        if (haystack.includes(kw.toLowerCase())) hits.push(kw);
    }
    return hits;
}
