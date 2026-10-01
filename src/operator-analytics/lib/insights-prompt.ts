import type { InsightsFacts } from './insights-facts';

export interface InsightsProjectContext {
    name?: string;
    systemPrompt?: string | null;
}

export function buildInsightsPrompt(
    facts: InsightsFacts,
    projectContext?: InsightsProjectContext,
    options?: { periodLabel?: string; operatorFocus?: string },
): { system: string; user: string } {
    const system = [
        'You are a call center analytics AI.',
        'Respond only in JSON matching the required schema.',
        'Use ONLY provided facts — do not invent numbers, operators, or metrics.',
        'Write title, observation, and recommendation in Russian.',
    ].join(' ');

    const projectBlock = projectContext?.name
        ? `Project: ${projectContext.name}${projectContext.systemPrompt ? `\nBusiness context: ${projectContext.systemPrompt}` : ''}`
        : '';

    const periodBlock = options?.periodLabel
        ? `Period: ${options.periodLabel}`
        : '';

    const operatorBlock = options?.operatorFocus
        ? `Focus operator: ${options.operatorFocus}`
        : '';

    const rules = [
        'Generate 3-6 insights.',
        'priority MUST be one of: high, medium, low (English only).',
        'priority means importance for the supervisor (high = notice/act first), NOT good vs bad.',
        'type MUST be one of: strength, gap, trend, outlier, quality (English only).',
        'Use type for polarity: strength = positive finding; gap/outlier/quality = problem or risk; trend = change over time.',
        'A high-priority strength is still type "strength" (not gap). A low-priority gap is still type "gap".',
        'title, observation, recommendation MUST be in Russian.',
        'evidence object MUST always include keys: metric (string, use "" if N/A), value (number or null), operators (string array, [] if N/A), periodLabel (string, use "" if N/A).',
        'When citing a metric, set evidence.metric and evidence.value from facts.',
        'Do not give generic advice without a number from the facts.',
        'Separate observation (what the data shows) from recommendation (concrete action).',
        'facts.trends is movement inside the selected period only. Do not treat it as a comparison with the previous period.',
        facts.unsuccessful.reasons.length
            ? 'Include one insight with type "gap" about unsuccessful calls. Name the first facts.unsuccessful.reasons item, its count, and shareOfUnsuccessful. Recommendation must be one concrete operator action. Do not invent reasons.'
            : facts.unsuccessful.count > 0
                ? 'Unsuccessful calls have no stored reasons. Do not invent a cause. You may cite facts.unsuccessful.count only.'
                : '',
        facts.comparison.empty
            ? 'facts.comparison.empty is true. Do not say this period is better or worse than a previous period.'
            : 'Include one insight with type "trend" using facts.comparison.deltas only. State which of calls, successRatePp, avgScore, or unsuccessfulCount rose or fell versus the previous period, and one action. Do not claim a change that is absent from deltas.',
        facts.lowConfidence
            ? 'Include at least one insight with type "quality" noting the small sample size caveat.'
            : '',
    ].filter(Boolean).join('\n');

    const user = [
        projectBlock,
        periodBlock,
        operatorBlock,
        '',
        'FACTS (use only these):',
        JSON.stringify(facts, null, 2),
        '',
        'RULES:',
        rules,
        '',
        'Return JSON: { "insights": [ { priority, type, title, observation, recommendation, evidence } ] }',
    ].filter(line => line !== undefined).join('\n');

    return { system, user };
}
