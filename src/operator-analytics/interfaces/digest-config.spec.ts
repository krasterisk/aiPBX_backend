import { normalizeDigestConfig } from './digest-config.interface';

describe('normalizeDigestConfig', () => {
    it('returns defaults for null/invalid input', () => {
        const cfg = normalizeDigestConfig(null);
        expect(cfg.enabled).toBe(false);
        expect(cfg.schedule).toBe('weekly');
        expect(cfg.reportWindow).toBe('last_7_days');
        expect(cfg.emails).toEqual([]);
    });

    it('clamps lists and numeric fields', () => {
        const cfg = normalizeDigestConfig({
            enabled: true,
            emails: ['a@b.com', '  c@d.com  ', ...Array.from({ length: 20 }, (_, i) => `u${i}@x.com`)],
            telegramChatIds: ['1', '2', 'bad'],
            schedule: 'daily',
            reportWindow: 'last_30_days',
            weeklyDay: 99,
            monthlyDay: 0,
            sendHour: 25,
        });
        expect(cfg.emails).toHaveLength(10);
        expect(cfg.emails[0]).toBe('a@b.com');
        expect(cfg.telegramChatIds).toEqual(['1', '2']);
        expect(cfg.weeklyDay).toBe(7);
        expect(cfg.monthlyDay).toBe(1);
        expect(cfg.sendHour).toBe(23);
    });
});
