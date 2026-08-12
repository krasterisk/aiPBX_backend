/**
 * Normalize LLM chat content into a JSON string suitable for JSON.parse.
 * Handles BOM, markdown fences, Gemma/Qwen `<think>` blocks, and leading prose.
 *
 * Returns '' when no parseable JSON object/array is found (callers should not
 * treat that as a successful structured response).
 */
export function extractLlmJsonContent(raw: string): string {
    if (!raw || !raw.trim()) return '';

    let text = raw.replace(/^\uFEFF/, '');

    // Prefer content outside closed think blocks; also drop an unclosed trailing think.
    const withoutThink = text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .trim();

    // Try outside-think first; fall back to full text so JSON buried inside
    // <think>...</think> is still recovered (gemma4 often puts the payload there).
    for (const candidate of [withoutThink, text]) {
        if (!candidate) continue;
        const extracted = extractFirstJsonValue(candidate);
        if (extracted) return extracted;
    }

    return '';
}

function extractFirstJsonValue(text: string): string | null {
    let cleaned = text;
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    cleaned = cleaned.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    cleaned = cleaned.trim();

    // If fenced block sat in the middle of prose, strip remaining fence markers loosely.
    const fenceMatch = cleaned.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
        cleaned = fenceMatch[1].trim();
    }

    const startObj = cleaned.indexOf('{');
    const startArr = cleaned.indexOf('[');
    let start = -1;
    let openChar: '{' | '[' | null = null;
    let closeChar: '}' | ']' | null = null;

    if (startObj >= 0 && (startArr < 0 || startObj < startArr)) {
        start = startObj;
        openChar = '{';
        closeChar = '}';
    } else if (startArr >= 0) {
        start = startArr;
        openChar = '[';
        closeChar = ']';
    }

    if (start < 0 || !openChar || !closeChar) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === openChar) depth++;
        else if (ch === closeChar) {
            depth--;
            if (depth === 0) {
                let slice = cleaned.slice(start, i + 1);
                // Trailing commas common in local-model output
                slice = slice.replace(/,\s*([\]}])/g, '$1');
                try {
                    JSON.parse(slice);
                    return slice;
                } catch {
                    return null;
                }
            }
        }
    }

    return null;
}
