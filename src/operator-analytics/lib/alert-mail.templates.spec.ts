import { buildCriticalAlertMail, buildCriticalAlertTelegramCaption } from './alert-mail.templates';

describe('alert-mail.templates', () => {
    const base = {
        projectName: 'Sales QA',
        dashboardUrl: 'https://app.example/dashboard?projectId=1',
    };

    it('builds anomaly mail with recent/baseline context', () => {
        const { subject, html, text } = buildCriticalAlertMail({
            ...base,
            type: 'anomaly',
            anomaly: {
                windowDays: 7,
                recent: { count: 10, avgCsat: 3, negativeRate: 40 },
                baseline: { count: 12, avgCsat: 4.5, negativeRate: 20 },
                triggers: { csatDrop: 33.33, negativeSpike: 20 },
                thresholds: { dropPct: 20, spikePp: 15 },
            },
        });
        expect(subject).toMatch(/Sales QA/);
        expect(html).toContain('33.33');
        expect(html).toContain(base.dashboardUrl);
        expect(text).toContain('Open dashboard');
    });

    it('builds telegram caption with CTA link', () => {
        const caption = buildCriticalAlertTelegramCaption({
            ...base,
            type: 'budget_exceeded',
            budget: { month: '2026-08', monthlyBudgetUsd: 50, spentUsd: 61.2 },
        });
        expect(caption).toContain('61.20');
        expect(caption).toContain(base.dashboardUrl);
    });
});
