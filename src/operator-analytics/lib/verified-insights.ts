import { createHash } from 'crypto';
import type { InsightMetricGroup, InsightPeriodData } from './insight-evidence';
import type { InsightWindow } from './insight-periods';
import type { CriterionRule } from '../quality/quality-score';

export const VERIFIED_INSIGHTS_VERSION = 'verified-insights-2-actionable';
export interface InsightBasis {
    factId: string; metricId: string; origin: string; metric: string;
    value: number; unit: 'points' | 'percent'; assessed: number; applicable: number;
    notApplicable: number; notRecorded: number; distribution: Record<string, number>;
    rule: CriterionRule; channelIds: string[]; previousChannelIds: string[];
    period: InsightWindow; previousPeriod?: InsightWindow; previousValue?: number; delta?: number;
    callQuotes?: Array<{ channelId: string; period: 'current' | 'previous'; quote: string; applicabilityQuote?: string }>;
    scopeRuleQuote?: string;
}
export interface VerifiedInsight {
    priority: 'high' | 'medium' | 'low'; type: 'gap' | 'strength' | 'trend' | 'outlier';
    title: string; observation: string; recommendation: string; evidence: InsightBasis;
}
export const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const round = (v: number) => Number(v.toFixed(2));
const stable = (rule: CriterionRule, definition?: unknown) => JSON.stringify([rule.name, rule.type, rule.normalization, rule.weight, rule.included, rule.critical, definition ?? null]);
interface Metric {
    id: string; origin: string; rule: CriterionRule; policy: string;
    assessed: number; na: number; recorded: number; normalized: number | null;
    distribution: Record<string, number>; lowIds: string[]; highIds: string[];
}
function metrics(data: InsightPeriodData): Metric[] {
    const grouped = new Map<string, InsightMetricGroup[]>();
    for (const g of data.metrics) {
        const key = `${g.origin}:${g.metricId}:${stable(g.rule, g.definition)}`;
        grouped.set(key, [...(grouped.get(key) || []), g]);
    }
    return [...grouped.values()].map(rows => {
        const assessed = rows.filter(r => r.status === 'assessed');
        const n = assessed.reduce((n, r) => n + r.n, 0);
        const normalized = assessed.filter(r => r.normalized != null && Number.isFinite(r.normalized));
        const denom = normalized.reduce((n, r) => n + r.n, 0);
        const distribution: Record<string, number> = {};
        for (const r of assessed) {
            if (r.rule.type === 'boolean') {
                distribution.true = (distribution.true || 0) + r.trueCount;
                distribution.false = (distribution.false || 0) + r.n - r.trueCount;
            } else if (r.category != null) distribution[r.category] = (distribution[r.category] || 0) + r.n;
        }
        const order = [...assessed].sort((a, b) => (a.normalized ?? Infinity) - (b.normalized ?? Infinity));
        return { id: rows[0].metricId, origin: rows[0].origin, rule: rows[0].rule, policy: stable(rows[0].rule, rows[0].definition), assessed: n,
            na: rows.filter(r => r.status === 'not_applicable').reduce((n, r) => n + r.n, 0),
            recorded: rows.reduce((n, r) => n + r.n, 0), normalized: denom ? round(normalized.reduce((n, r) => n + r.normalized! * r.n, 0) / denom) : null,
            distribution, lowIds: [...new Set(order.flatMap(r => r.lowIds))].slice(0, 5),
            highIds: [...new Set(order.reverse().flatMap(r => r.highIds))].slice(0, 5) };
    });
}

/** Numbers and observations are produced by code, never accepted from generated prose. */
export function verifiedInsights(current: InsightPeriodData, previous: InsightPeriodData | null, periods: { current: InsightWindow; previous: InsightWindow | null }, names: Record<string, string>, minimum = 10): VerifiedInsight[] {
    const before = previous ? metrics(previous) : [];
    const facts: VerifiedInsight[] = [];
    const sufficient = (m: Metric, data: InsightPeriodData) => m.assessed >= minimum && m.assessed / Math.max(1, data.total - m.na) >= .6;
    const add = (m: Metric, value: number, type: VerifiedInsight['type'], title: string, observation: string, ids: string[], extra: Partial<InsightBasis> = {}) => {
        if (!ids.length) return;
        const name = names[m.id] || m.rule.name || m.id;
        facts.push({ priority: type === 'gap' ? 'high' : type === 'strength' ? 'low' : 'medium', type, title: `${name}: ${title}`, observation,
            recommendation: '', // A statistical candidate is not a publishable supervisor recommendation.
            evidence: { factId: digest([m.origin, m.id, m.policy, type, value, observation, periods]).slice(0, 24), metricId: m.id, origin: m.origin, metric: name,
                value: round(value), unit: 'points', assessed: m.assessed, applicable: current.total - m.na,
                notApplicable: m.na, notRecorded: Math.max(0, current.total - m.recorded), distribution: m.distribution, rule: m.rule,
                channelIds: ids, previousChannelIds: [], period: periods.current, ...extra } });
    };
    for (const m of metrics(current)) {
        if (!sufficient(m, current)) continue;
        const name = names[m.id] || m.rule.name || m.id;
        // Numeric values with opposite direction are already normalized by the frozen rule.
        if (m.rule.included && m.normalized != null && (m.normalized <= 70 || m.normalized >= 90)) {
            const low = m.normalized <= 70;
            add(m, m.normalized, low ? 'gap' : 'strength', low ? 'зона внимания' : 'сильная сторона',
                `По сохранённым оценкам критерий «${name}» — ${round(m.normalized)} из 100. Оценено ${m.assessed} из ${current.total - m.na} звонков без отметки «неприменимо».`, low ? m.lowIds : m.highIds);
        } else if (Object.keys(m.distribution).length) {
            const [category, n] = Object.entries(m.distribution).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
            // Exact category exemplars, not arbitrary recent calls.
            const matching = current.metrics.filter(g => g.metricId === m.id && g.origin === m.origin && stable(g.rule, g.definition) === m.policy && g.status === 'assessed' && g.category === category);
            if (n / m.assessed >= .5) add(m, n * 100 / m.assessed, 'outlier', 'распределение ответов',
                `Ответ «${category}»: ${n} из ${m.assessed} оценённых звонков (${round(n * 100 / m.assessed)}%).`, matching.flatMap(g => g.lowIds).slice(0, 5), { unit: 'percent' });
        }
        const old = before.find(p => p.id === m.id && p.origin === m.origin && p.policy === m.policy);
        if (old && previous && periods.previous && sufficient(old, previous) && m.normalized == null && old.normalized == null) {
            for (const [category, n] of Object.entries(m.distribution)) {
                const prior = old.distribution[category] || 0, delta = round(100 * n / m.assessed - 100 * prior / old.assessed);
                if (Math.abs(delta) < 10 || !prior) continue;
                const matching = (data: InsightPeriodData) => data.metrics.filter(g => g.metricId === m.id && g.origin === m.origin && stable(g.rule, g.definition) === m.policy && g.status === 'assessed' && g.category === category).flatMap(g => g.lowIds).slice(0, 5);
                add(m, 100 * n / m.assessed, 'trend', 'изменилось распределение ответов',
                    `Доля ответа «${category}»: ${round(100 * prior / old.assessed)}% → ${round(100 * n / m.assessed)}% (${delta > 0 ? '+' : ''}${delta} п.п.). Оценено ${old.assessed} и ${m.assessed} звонков.`, matching(current),
                    { unit: 'percent', previousValue: round(100 * prior / old.assessed), delta, previousPeriod: periods.previous, previousChannelIds: matching(previous) });
            }
        }
        if (old && previous && periods.previous && sufficient(old, previous) && m.normalized != null && old.normalized != null && Math.abs(m.normalized - old.normalized) >= 5) {
            const delta = round(m.normalized - old.normalized);
            add(m, m.normalized, 'trend', delta > 0 ? 'оценка выросла' : 'оценка снизилась',
                `Оценка: ${round(old.normalized)} → ${round(m.normalized)} из 100 (${delta > 0 ? '+' : ''}${delta} балла). Оценено ${old.assessed} и ${m.assessed} звонков в предыдущем и текущем периодах.`, delta > 0 ? m.highIds : m.lowIds,
                { previousValue: round(old.normalized), delta, previousPeriod: periods.previous, previousChannelIds: delta > 0 ? old.lowIds : old.highIds });
        }
    }
    const policySet = (data: InsightPeriodData) => [...new Set(metrics(data).map(m => `${m.origin}:${m.id}:${m.policy}`))].sort().join('|');
    if (previous && periods.previous && current.scored >= minimum && previous.scored >= minimum &&
        current.scored / Math.max(1, current.total) >= .6 && previous.scored / Math.max(1, previous.total) >= .6 &&
        current.score != null && previous.score != null && policySet(current) === policySet(previous) &&
        Math.abs(current.score - previous.score) >= 5 && current.lowIds?.length && previous.lowIds?.length) {
        const delta = round(current.score - previous.score);
        const summary: Metric = { id: 'averageScore', origin: 'summary', rule: { id: 'averageScore', origin: 'default', name: 'Средняя оценка качества', type: 'number', normalization: { kind: 'linear', min: 0, max: 100 }, included: true, weight: 1, critical: 'none' }, policy: policySet(current), assessed: current.scored, na: 0, recorded: current.scored, distribution: {}, normalized: current.score, lowIds: current.lowIds, highIds: current.highIds || [] };
        add(summary, current.score, 'trend', delta > 0 ? 'оценка выросла' : 'оценка снизилась',
            `Средняя оценка: ${round(previous.score)} → ${round(current.score)} из 100 (${delta > 0 ? '+' : ''}${delta} балла). Оценено ${previous.scored} и ${current.scored} звонков.`, delta > 0 ? current.highIds || [] : current.lowIds,
            { previousValue: round(previous.score), delta, previousPeriod: periods.previous, previousChannelIds: delta > 0 ? previous.lowIds : previous.highIds || [] });
    }
    // No forced minimum. Stable order puts actionable gaps before strengths.
    const rank = { high: 0, medium: 1, low: 2 };
    return facts.sort((a, b) => rank[a.priority] - rank[b.priority] ||
        (a.type === 'gap' && b.type === 'gap' ? a.evidence.value - b.evidence.value : 0) ||
        `${a.evidence.origin}:${a.evidence.metricId}:${a.type}:${a.observation}`.localeCompare(`${b.evidence.origin}:${b.evidence.metricId}:${b.type}:${b.observation}`));
}
