import { BadRequestException } from '@nestjs/common';

/** Date-only requests retain their legacy local-day boundaries; ISO requests stay exact. */
export function analyticsDate(value: string, edge: 'start' | 'end'): Date {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(day ? `${value}T${edge === 'start' ? '00:00:00' : '23:59:59'}` : value);
    if ((!day && !/^\d{4}-\d{2}-\d{2}T/.test(value)) || !Number.isFinite(date.getTime())) {
        throw new BadRequestException('Invalid analytics date');
    }
    return date;
}
