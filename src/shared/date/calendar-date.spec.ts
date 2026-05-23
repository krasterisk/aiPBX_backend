import { formatCalendarDateLocal, previousCalendarMonthPeriod } from './calendar-date';

describe('calendar-date', () => {
    it('formatCalendarDateLocal uses local calendar day', () => {
        const d = new Date(2026, 3, 1, 12, 0, 0);
        expect(formatCalendarDateLocal(d)).toBe('2026-04-01');
    });

    it('previousCalendarMonthPeriod is 1st through last day of previous month', () => {
        const ref = new Date(2026, 4, 22);
        expect(previousCalendarMonthPeriod(ref)).toEqual({
            periodFrom: '2026-04-01',
            periodTo: '2026-04-30',
        });
    });
});
