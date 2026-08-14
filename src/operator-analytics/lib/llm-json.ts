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
                return tryParseJsonSlice(cleaned.slice(start, i + 1));
            }
        }
    }

    // Local models often hit max tokens mid-object (unclosed string / braces).
    return tryParseJsonSlice(cleaned.slice(start));
}

function tryParseJsonSlice(slice: string): string | null {
    const candidates = [
        slice.replace(/,\s*([\]}])/g, '$1'),
        repairLlmJson(slice),
    ];
    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            JSON.parse(candidate);
            return candidate;
        } catch {
            /* next */
        }
    }
    return null;
}

/** Escape raw control chars in strings, then close a truncated object/array. */
export function repairLlmJson(raw: string): string | null {
    if (!raw.trim()) return null;
    const escaped = escapeControlsInJsonStrings(raw.replace(/,\s*([\]}])/g, '$1'));
    const closed = closeTruncatedJson(escaped);
    try {
        JSON.parse(closed);
        return closed;
    } catch {
        return null;
    }
}

function escapeControlsInJsonStrings(text: string): string {
    let out = '';
    let inString = false;
    let escape = false;
    for (const ch of text) {
        if (inString) {
            if (escape) {
                out += ch;
                escape = false;
                continue;
            }
            if (ch === '\\') {
                out += ch;
                escape = true;
                continue;
            }
            if (ch === '"') {
                out += ch;
                inString = false;
                continue;
            }
            if (ch === '\n') { out += '\\n'; continue; }
            if (ch === '\r') { out += '\\r'; continue; }
            if (ch === '\t') { out += '\\t'; continue; }
            if (ch.charCodeAt(0) < 0x20) continue;
            out += ch;
            continue;
        }
        if (ch === '"') inString = true;
        out += ch;
    }
    return out;
}

function closeTruncatedJson(raw: string): string {
    let inString = false;
    let escape = false;
    let stringStart = -1;
    let lastSig = '';
    const stack: Array<'{' | '['> = [];

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = false; lastSig = '"'; }
            continue;
        }
        if (ch === '"') { inString = true; stringStart = i; continue; }
        if (ch === '{') { stack.push('{'); lastSig = '{'; continue; }
        if (ch === '[') { stack.push('['); lastSig = '['; continue; }
        if (ch === '}' || ch === ']') { stack.pop(); lastSig = ch; continue; }
        if (ch === ':') { lastSig = ':'; continue; }
        if (ch === ',') { lastSig = ','; continue; }
        if (!/\s/.test(ch)) lastSig = ch;
    }

    let out = raw;
    if (inString) {
        if (lastSig === '{' || lastSig === '[' || lastSig === ',') {
            out = out.slice(0, stringStart).replace(/,\s*$/, '');
        } else {
            if (out.endsWith('\\') && !out.endsWith('\\\\')) {
                out = out.slice(0, -1);
            }
            out += '"';
        }
    } else if (lastSig === ':') {
        out += 'null';
    } else if (lastSig === ',') {
        out = out.replace(/,\s*$/, '');
    }

    const remain = bracketStack(out);
    for (let i = remain.length - 1; i >= 0; i--) {
        out += remain[i] === '{' ? '}' : ']';
    }
    return out;
}

function bracketStack(text: string): Array<'{' | '['> {
    const stack: Array<'{' | '['> = [];
    let inString = false;
    let escape = false;
    for (const ch of text) {
        if (inString) {
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{') stack.push('{');
        else if (ch === '[') stack.push('[');
        else if (ch === '}' || ch === ']') stack.pop();
    }
    return stack;
}
