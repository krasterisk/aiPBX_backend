import { HttpException, HttpStatus } from '@nestjs/common';

/** Parses a positive integer user id; rejects NaN before hitting the database. */
export function parseUserId(
    raw: string | number | null | undefined,
    label = 'User ID',
): number {
    if (raw === null || raw === undefined || raw === '') {
        throw new HttpException(`${label} is required`, HttpStatus.BAD_REQUEST);
    }
    const id = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
        throw new HttpException(`Invalid ${label}`, HttpStatus.BAD_REQUEST);
    }
    return id;
}
