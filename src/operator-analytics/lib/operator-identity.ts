import { BadRequestException } from '@nestjs/common';

export interface OperatorIdentityInput {
    /** Stable external employee ID, namespaced by the originating system. */
    operatorId?: string | null;
    operatorExtension?: string | null;
}

export function operatorIdentityFields(input: OperatorIdentityInput) {
    const read = (value: unknown, field: string, max: number): string | undefined => {
        if (value == null || value === '') return undefined;
        if (typeof value !== 'string' || !value.trim() || value.length > max ||
            Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
            throw new BadRequestException(`Invalid ${field}`);
        }
        return value.trim();
    };
    const operatorId = read(input.operatorId, 'operatorId', 128);
    const operatorExtension = read(input.operatorExtension, 'operatorExtension', 64);
    return { ...(operatorId ? { operatorId } : {}), ...(operatorExtension ? { operatorExtension } : {}) };
}

/** IDs are scoped to the account; legacy callers retain exact-name grouping. */
export function operatorIdentityKey(record: { operatorId?: string | null; userId?: string; assistantName?: string | null }) {
    if (record.operatorId) return JSON.stringify(['id', record.userId ?? '', record.operatorId]);
    const name = record.assistantName?.trim();
    return JSON.stringify(['name', !name || name === 'Unknown Operator' ? null : name]);
}

export function operatorGroupIdentity<T extends { userId?: string; operatorId?: string | null; assistantName?: string | null; createdAt?: Date | string }>(rows: T[]) {
    const latest = rows.reduce((a, b) => new Date(b.createdAt ?? 0).getTime() > new Date(a.createdAt ?? 0).getTime() ? b : a);
    return { ...(latest.operatorId ? { operatorId: latest.operatorId, ...(latest.userId ? { operatorAccountId: latest.userId } : {}) } : {}), operatorName: latest.assistantName?.trim() || 'Unknown Operator' };
}
