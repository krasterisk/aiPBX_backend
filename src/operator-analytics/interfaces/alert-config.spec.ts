import {
    defaultAlertConfigFromEnv,
    normalizeAlertConfig,
    resolveAlertRecipients,
} from './alert-config.interface';

describe('normalizeAlertConfig', () => {
    it('returns env-backed defaults for null input', () => {
        const cfg = normalizeAlertConfig(null);
        expect(cfg.enabled).toBe(false);
        expect(cfg.inheritRecipientsFromDigest).toBe(true);
        expect(cfg.csatDrop.enabled).toBe(true);
        expect(cfg.budgetExceeded.enabled).toBe(true);
        expect(cfg.lastTestSentAt).toBeNull();
    });

    it('clamps rule knobs and chat ids', () => {
        const cfg = normalizeAlertConfig({
            enabled: true,
            inheritRecipientsFromDigest: false,
            emails: ['a@b.com', ...Array.from({ length: 20 }, (_, i) => `u${i}@x.com`)],
            telegramChatIds: ['123', '-1001', 'nope'],
            csatDrop: { enabled: false, dropPct: 200, windowDays: 0, minCalls: 9999 },
            negativeSpike: { spikePp: -1, windowDays: 91, minCalls: 0 },
            budgetExceeded: { enabled: false },
            lastTestSentAt: '2026-08-01T00:00:00.000Z',
        });
        expect(cfg.emails).toHaveLength(10);
        expect(cfg.telegramChatIds).toEqual(['123', '-1001']);
        expect(cfg.csatDrop.enabled).toBe(false);
        expect(cfg.csatDrop.dropPct).toBe(100);
        expect(cfg.csatDrop.windowDays).toBe(1);
        expect(cfg.csatDrop.minCalls).toBe(1000);
        expect(cfg.negativeSpike.spikePp).toBe(1);
        expect(cfg.negativeSpike.windowDays).toBe(90);
        expect(cfg.budgetExceeded.enabled).toBe(false);
        expect(cfg.lastTestSentAt).toBe('2026-08-01T00:00:00.000Z');
    });
});

describe('resolveAlertRecipients', () => {
    const base = defaultAlertConfigFromEnv();

    it('inherits digest recipients by default', () => {
        const r = resolveAlertRecipients(
            { ...base, inheritRecipientsFromDigest: true, emails: ['own@x.com'], telegramChatIds: ['9'] },
            ['d@x.com'],
            ['100'],
        );
        expect(r.emails).toEqual(['d@x.com']);
        expect(r.telegramChatIds).toEqual(['100']);
    });

    it('uses own lists when inherit is false', () => {
        const r = resolveAlertRecipients(
            { ...base, inheritRecipientsFromDigest: false, emails: ['own@x.com'], telegramChatIds: ['9'] },
            ['d@x.com'],
            ['100'],
        );
        expect(r.emails).toEqual(['own@x.com']);
        expect(r.telegramChatIds).toEqual(['9']);
    });

    it('merges legacy budgetAlertEmails', () => {
        const r = resolveAlertRecipients(
            { ...base, inheritRecipientsFromDigest: false, emails: ['a@x.com'] },
            [],
            [],
            ['legacy@x.com', 'a@x.com'],
        );
        expect(r.emails).toEqual(['a@x.com', 'legacy@x.com']);
    });
});
