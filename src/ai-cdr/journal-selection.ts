import { BadRequestException } from '@nestjs/common';
import { Op } from 'sequelize';
import { GetAiCdrDto } from './dto/getAiCdr.dto';
import { analyticsDate } from '../operator-analytics/lib/analytics-date';

export interface JournalQuery extends GetAiCdrDto {
    sources?: string;
    callTypes?: string;
    people?: string;
    tagIds?: string;
}
export interface JournalPerson {
    userId: string;
    operatorId?: string;
    assistantId?: string;
    name?: string;
}
const SOURCES = ['call', 'widget', 'playground', 'external-api', 'external-front'];

function array(raw: unknown): unknown[] {
    if (raw == null || raw === '') return [];
    if (typeof raw !== 'string' || raw.length > 30000) throw new BadRequestException('Invalid journal selection');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new BadRequestException('Invalid journal selection'); }
    if (!Array.isArray(parsed) || parsed.length > 100) throw new BadRequestException('Invalid journal selection');
    return parsed;
}

export function journalValues(raw: unknown, allowed: string[]): string[] {
    const values = array(raw);
    if (values.some(v => typeof v !== 'string' || !allowed.includes(v))) throw new BadRequestException('Invalid journal value');
    return [...new Set(values as string[])];
}

/** Selected topics are a union; caller still ANDs this with the authenticated call scope. */
export function journalTags(raw: unknown): string[] {
    const values = array(raw);
    if (values.some(value => typeof value !== 'string' || !value.trim() || value.length > 200)) throw new BadRequestException('Invalid topic selection');
    return [...new Set(values as string[])];
}

export function journalPeople(raw: unknown): JournalPerson[] {
    return array(raw).map(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Invalid journal person');
        const person = value as JournalPerson;
        const keys = ['operatorId', 'assistantId', 'name'].filter(k => person[k] !== undefined);
        if (keys.length !== 1 || typeof person.userId !== 'string' || !person.userId.trim() || person.userId.length > 200)
            throw new BadRequestException('Invalid journal identity');
        const key = keys[0];
        if (typeof person[key] !== 'string' || !person[key].trim() || person[key].length > 200)
            throw new BadRequestException('Invalid journal identity');
        return { userId: person.userId, [key]: person[key] };
    });
}

/** Appended to authenticated account scope; selections can only narrow access. */
export function applyJournalSelection(where: any, query: JournalQuery): void {
    const clauses: any[] = [];
    const sources = journalValues(query.sources, SOURCES);
    const types = journalValues(query.callTypes, ['incoming', 'outgoing', 'internal']);
    const people = journalPeople(query.people);
    if (sources.length) clauses.push({ source: { [Op.in]: sources } });
    if (types.length) clauses.push({ [Op.or]: types.map(type => type === 'incoming'
        ? { [Op.or]: [{ callType: 'incoming' }, { callType: null }] } : { callType: type }) });
    if (people.length) clauses.push({ [Op.or]: people.map(person => ({
        userId: person.userId,
        ...(person.operatorId ? { operatorId: person.operatorId } : person.assistantId ? { assistantId: person.assistantId } : {
            assistantName: person.name,
            [Op.and]: [
                { [Op.or]: [{ operatorId: null }, { operatorId: '' }] },
                { [Op.or]: [{ assistantId: null }, { assistantId: '' }, { assistantId: '0' }] },
            ],
        }),
    })) });
    if (clauses.length) where[Op.and] = [...(where[Op.and] ?? []), ...clauses];
}

export function journalDateWhere(start?: string, end?: string): Record<symbol, Date> | undefined {
    if (!start && !end) return undefined;
    if ((start && (typeof start !== 'string' || start.length > 50)) || (end && (typeof end !== 'string' || end.length > 50)))
        throw new BadRequestException('Invalid journal dates');
    const from = start ? analyticsDate(start, 'start') : undefined;
    const to = end ? analyticsDate(end, 'end') : undefined;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from > to))
        throw new BadRequestException('Invalid journal dates');
    return { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
}

export function journalOption(row: { userId?: string; operatorId?: string; assistantId?: string; assistantName?: string }) {
    if (!row.userId) return null;
    const person: JournalPerson = { userId: String(row.userId) };
    if (row.operatorId) person.operatorId = row.operatorId;
    else if (row.assistantId && row.assistantId !== '0') person.assistantId = String(row.assistantId);
    else if (row.assistantName?.trim() && row.assistantName !== 'Unknown Operator') person.name = row.assistantName;
    else return null;
    return { value: JSON.stringify(person), label: row.assistantName?.trim() || row.operatorId || row.assistantId };
}
