import { resolveDigestReportWindow, zonedParts } from './digest-window';

describe('digest-window', () => {
    it('zonedParts returns ISO weekday Mon=1', () => {
        // 2026-08-03 is a Monday UTC
        const z = zonedParts(new Date('2026-08-03T12:00:00.000Z'), 'UTC');
        expect(z.isoWeekday).toBe(1);
        expect(z.year).toBe(2026);
        expect(z.month).toBe(8);
        expect(z.day).toBe(3);
        expect(z.hour).toBe(12);
    });

    it('last_7_days ends today and spans 7 calendar days', () => {
        const range = resolveDigestReportWindow(
            'last_7_days',
            new Date('2026-08-10T15:00:00.000Z'),
            'UTC',
            false,
        );
        expect(range.endDate).toBe('2026-08-10');
        expect(range.startDate).toBe('2026-08-04');
        expect(range.label).toContain('2026-08-04');
    });

    it('last_30_days spans 30 calendar days', () => {
        const range = resolveDigestReportWindow(
            'last_30_days',
            new Date('2026-08-10T15:00:00.000Z'),
            'UTC',
            false,
        );
        expect(range.endDate).toBe('2026-08-10');
        expect(range.startDate).toBe('2026-07-12');
    });

    it('previous_calendar_month uses prior month bounds', () => {
        const range = resolveDigestReportWindow(
            'previous_calendar_month',
            new Date('2026-08-10T15:00:00.000Z'),
            'UTC',
            false,
        );
        expect(range.startDate).toBe('2026-07-01');
        expect(range.endDate).toBe('2026-07-31');
    });
});
