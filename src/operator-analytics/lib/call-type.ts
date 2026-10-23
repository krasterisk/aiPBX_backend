import { BadRequestException } from '@nestjs/common';

export type CallType = 'incoming' | 'outgoing' | 'internal';

/** Shared validation for JSON, multipart and internal ingestion paths. */
export function parseCallType(value: unknown): CallType {
    if (value === undefined || value === null) return 'incoming';
    if (value === 'incoming' || value === 'outgoing' || value === 'internal') return value;
    throw new BadRequestException('callType must be incoming, outgoing or internal');
}
