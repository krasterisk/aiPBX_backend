import { BadRequestException } from '@nestjs/common';

type Controls = {
    think?: boolean;
    top_p?: number;
    presence_penalty?: number;
    response_format?: { type: 'json_object' } | {
        type: 'json_schema';
        json_schema: { name?: string; strict?: boolean; schema: Record<string, unknown> };
    };
};
const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid(): never { throw new BadRequestException('Invalid completion controls'); }

/** Explicit allowlist only. An absent option must preserve the existing model defaults. */
export function completionControls(input: Record<string, unknown>): Controls {
    const result: Controls = {};
    if (input.think != null) {
        if (typeof input.think !== 'boolean') invalid();
        result.think = input.think as boolean;
    }
    for (const [key, min, max] of [['top_p', 0, 1], ['presence_penalty', -2, 2]] as const) {
        const value = input[key];
        if (value == null) continue;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid();
        result[key] = value as number;
    }
    const format = input.response_format;
    if (format == null) return result;
    if (!object(format)) invalid();
    if (format.type === 'json_object') {
        if (Object.keys(format).some(key => key !== 'type')) invalid();
        result.response_format = { type: 'json_object' };
        return result;
    }
    if (format.type !== 'json_schema' || Object.keys(format).some(key => !['type', 'json_schema'].includes(key))) invalid();
    const spec = format.json_schema;
    if (!object(spec) || !object(spec.schema)) invalid();
    if (Object.keys(spec).some(key => !['name', 'strict', 'schema'].includes(key))) invalid();
    if (spec.name != null && (typeof spec.name !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(spec.name))) invalid();
    if (spec.strict != null && typeof spec.strict !== 'boolean') invalid();
    // Bound untrusted schema traversal before serializing; do not accept arbitrary native options.
    let nodes = 0;
    const visit = (value: unknown, depth: number) => {
        if (++nodes > 4096 || depth > 24) invalid();
        if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child, depth + 1);
    };
    visit(spec.schema, 0);
    const serialized = JSON.stringify(spec.schema);
    if (serialized.length > 32768) invalid();
    result.response_format = {
        type: 'json_schema',
        json_schema: { ...(spec.name != null ? { name: spec.name as string } : {}), ...(spec.strict != null ? { strict: spec.strict as boolean } : {}), schema: JSON.parse(serialized) },
    };
    return result;
}

export function nativeResponseFormat(controls: Controls): 'json' | Record<string, unknown> | undefined {
    const format = controls.response_format;
    if (!format) return undefined;
    return format.type === 'json_object' ? 'json' : format.json_schema.schema;
}
