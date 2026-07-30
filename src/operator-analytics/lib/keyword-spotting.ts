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

/** Minimal taxonomy shape for keyword matching (mirrors TagDefinition). */
export interface TaxonomyTagDefinition {
    id: string;
    name: string;
    aliases?: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cyrillic + Latin letters and digits — ES6-safe (no \\p{L} property escapes). */
const WORD_CHARS = 'a-zA-Z\u0400-\u04FF0-9';
const NOT_WORD = `[^${WORD_CHARS}]`;

/**
 * Word-boundary-ish match that works for Cyrillic (\\b is ASCII-only in JS RegExp).
 * Multi-word phrases use plain substring matching; single tokens use boundary regex.
 */
function matchesAlias(haystack: string, alias: string): boolean {
    const a = alias.trim().toLowerCase();
    if (!a) return false;
    if (/\s/.test(a)) return haystack.includes(a);
    const re = new RegExp(`(^|${NOT_WORD})${escapeRe(a)}(${NOT_WORD}|$)`);
    return re.test(haystack);
}

/** Match project taxonomy themes against transcript text; deterministic order, capped. */
export function spotTaxonomyTags(
    transcription: string,
    taxonomy: TaxonomyTagDefinition[],
    maxTags = 10,
): string[] {
    if (!transcription?.trim() || !taxonomy?.length) return [];
    const haystack = transcription.toLowerCase();
    const hits: string[] = [];
    for (const tag of taxonomy) {
        if (!tag?.id) continue;
        const aliases = tag.aliases?.length ? tag.aliases : [tag.name];
        const matched = aliases.some(a => matchesAlias(haystack, a));
        if (matched && !hits.includes(tag.id)) {
            hits.push(tag.id);
            if (hits.length >= maxTags) break;
        }
    }
    return hits;
}
