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
        'type MUST be one of: strength, gap, trend, outlier, quality (English only).',
        'title, observation, recommendation MUST be in Russian.',
        'evidence object MUST always include keys: metric (string, use "" if N/A), value (number or null), operators (string array, [] if N/A), periodLabel (string, use "" if N/A).',
        'When citing a metric, set evidence.metric and evidence.value from facts.',
        'Do not give generic advice without a number from the facts.',
        'Separate observation (what the data shows) from recommendation (concrete action).',
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
