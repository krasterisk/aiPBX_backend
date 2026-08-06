import { canSendManualDigest, isDigestDue } from './digest-eligibility';
import type { DigestConfig } from '../interfaces/digest-config.interface';

function baseConfig(over: Partial<DigestConfig> = {}): DigestConfig {
    return {
        enabled: true,
        emails: ['ops@example.com'],
        telegramChatIds: [],
        schedule: 'daily',
        reportWindow: 'last_7_days',
        weeklyDay: 1,
        monthlyDay: 1,
        sendHour: 9,
        lastSentAt: null,
        lastManualSentAt: null,
        ...over,
    };
}

describe('digest-eligibility', () => {
    it('isDigestDue false when disabled or no recipients', () => {
        expect(isDigestDue(baseConfig({ enabled: false }), new Date('2026-08-04T09:00:00Z'), 'UTC')).toBe(false);
        expect(isDigestDue(baseConfig({ emails: [], telegramChatIds: [] }), new Date('2026-08-04T09:00:00Z'), 'UTC')).toBe(false);
    });

    it('isDigestDue true for daily at sendHour when not yet sent today', () => {
        expect(isDigestDue(baseConfig({ schedule: 'daily', sendHour: 9 }), new Date('2026-08-04T09:30:00Z'), 'UTC')).toBe(true);
    });

    it('isDigestDue false outside sendHour', () => {
        expect(isDigestDue(baseConfig({ schedule: 'daily', sendHour: 9 }), new Date('2026-08-04T10:00:00Z'), 'UTC')).toBe(false);
    });

    it('isDigestDue dedupes same calendar day via lastSentAt', () => {
        expect(isDigestDue(
            baseConfig({ schedule: 'daily', sendHour: 9, lastSentAt: '2026-08-04T09:05:00.000Z' }),
            new Date('2026-08-04T09:30:00Z'),
            'UTC',
        )).toBe(false);
    });

    it('isDigestDue weekly matches ISO weekday', () => {
        // 2026-08-03 Monday
        expect(isDigestDue(
            baseConfig({ schedule: 'weekly', weeklyDay: 1, sendHour: 9 }),
            new Date('2026-08-03T09:00:00Z'),
            'UTC',
        )).toBe(true);
        expect(isDigestDue(
            baseConfig({ schedule: 'weekly', weeklyDay: 1, sendHour: 9 }),
            new Date('2026-08-04T09:00:00Z'),
            'UTC',
        )).toBe(false);
    });

    it('isDigestDue monthly matches day of month', () => {
        expect(isDigestDue(
            baseConfig({ schedule: 'monthly', monthlyDay: 1, sendHour: 9 }),
            new Date('2026-08-01T09:00:00Z'),
            'UTC',
        )).toBe(true);
        expect(isDigestDue(
            baseConfig({ schedule: 'monthly', monthlyDay: 1, sendHour: 9 }),
            new Date('2026-08-02T09:00:00Z'),
            'UTC',
        )).toBe(false);
    });

    it('canSendManualDigest enforces recipients and 5-minute cooldown', () => {
        expect(canSendManualDigest(baseConfig({ emails: [], telegramChatIds: [] })).ok).toBe(false);
        expect(canSendManualDigest(baseConfig()).ok).toBe(true);

        const now = new Date('2026-08-04T12:00:00Z');
        const gated = canSendManualDigest(
            baseConfig({ lastManualSentAt: '2026-08-04T11:57:00.000Z' }),
            now,
        );
        expect(gated.ok).toBe(false);

        const ok = canSendManualDigest(
            baseConfig({ lastManualSentAt: '2026-08-04T11:50:00.000Z' }),
            now,
        );
        expect(ok.ok).toBe(true);
    });
});
