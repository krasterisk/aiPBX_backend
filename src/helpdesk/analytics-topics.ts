import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

export const TOPICS_CONTRACT = 'analytics-topics-v1';
export type TopicEdit = { expected_hash: string; mode: 'create' | 'update'; topic_id: string; changes: Record<string, unknown> };
// Serialize keys directly: JSON.stringify reorders numeric object keys even
// after insertion sorting. UTF-8 order matches Python's Unicode key order.
const canonical = (v: any): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v)
        .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
        .map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
export const topicHash = (topics: unknown) => createHash('sha256').update(canonical(topics)).digest('hex');
const fail = (message: string): never => { throw new BadRequestException(message); };
const text = (value: unknown, limit: number): string => typeof value === 'string' && value.trim()
    && [...value].length <= limit && !/[\u0000-\u001f]/u.test(value) ? value.trim() : fail('Invalid topic text');
const normal = (value: string) => value.normalize('NFKC').toLowerCase().trim();

/** Partial edits preserve every unrelated/opaque field. No project selection here. */
export function compileTopicEdit(topics: any[], edit: TopicEdit): any[] {
    if (!Array.isArray(topics) || topics.length > 20) fail('Invalid current taxonomy');
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)
        || Object.keys(edit).sort().join(',') !== 'changes,expected_hash,mode,topic_id') fail('Invalid topic edit fields');
    if (topicHash(topics) !== edit.expected_hash) throw new ConflictException('Stale taxonomy; read settings and prepare a new plan');
    if (!['create', 'update'].includes(edit.mode) || typeof edit.topic_id !== 'string'
        || !/^[A-Za-z0-9_-]{1,50}$/.test(edit.topic_id)) fail('Invalid topic identity or mode');
    const changes = JSON.parse(JSON.stringify(edit.changes ?? null));
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length
        || Object.keys(changes).some(k => !['name', 'description', 'aliases', 'color'].includes(k))) fail('Invalid topic changes');
    for (const [field, limit] of [['name', 100], ['description', 1000]] as const) {
        if (field in changes) changes[field] = text(changes[field], limit);
    }
    if ('color' in changes && (typeof changes.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(changes.color))) fail('Invalid topic color');
    if ('aliases' in changes) {
        if (!Array.isArray(changes.aliases) || changes.aliases.length > 30) fail('Invalid topic examples');
        changes.aliases = changes.aliases.map((a: unknown) => text(a, 100));
        if (new Set(changes.aliases.map(normal)).size !== changes.aliases.length) fail('Duplicate examples');
    }
    if (topics.some(t => !t || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.name !== 'string')
        || new Set(topics.map(t => t.id)).size !== topics.length) fail('Malformed existing taxonomy');
    const result = JSON.parse(JSON.stringify(topics));
    let index = result.findIndex((t: any) => t.id === edit.topic_id);
    if (edit.mode === 'create') {
        if (index !== -1 || topics.length >= 20 || !('name' in changes) || !('description' in changes)) fail('Topic exists or creation criteria missing');
        index = result.length;
        result.push({ id: edit.topic_id, aliases: [], ...changes });
    } else {
        if (index === -1) fail('Topic to update missing');
        result[index] = { ...result[index], ...changes };
    }
    if (result.some((t: any, i: number) => i !== index && normal(t.name) === normal(result[index].name))) fail('Duplicate topic name');
    return result;
}
