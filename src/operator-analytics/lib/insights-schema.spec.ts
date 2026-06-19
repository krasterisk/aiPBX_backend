import {
    buildInsightsJsonSchema,
    INSIGHTS_PROMPT_VERSION,
    InsightsSchemaValidationError,
    parseAndValidateInsightsResponse,
} from './insights-schema';

describe('insights-schema', () => {
    const validInsight = {
        priority: 'high',
        type: 'gap',
        title: 'Низкое качество приветствия',
        observation: 'greeting_quality = 58 при среднем 72',
        recommendation: 'Провести тренинг по скрипту приветствия',
        evidence: { metric: 'greeting_quality', value: 58 },
    };

    it('valid structured payload passes parseAndValidateInsightsResponse', () => {
        const result = parseAndValidateInsightsResponse({ insights: [validInsight] });
        expect(result).toHaveLength(1);
        expect(result[0].priority).toBe('high');
        expect(result[0].evidence.metric).toBe('greeting_quality');
    });

    it('missing priority defaults to medium after normalization', () => {
        const result = parseAndValidateInsightsResponse({
            insights: [{ ...validInsight, priority: undefined }],
        });
        expect(result[0].priority).toBe('medium');
    });

    it('missing title throws', () => {
        const bad = { insights: [{ ...validInsight, title: '' }] };
        expect(() => parseAndValidateInsightsResponse(bad)).toThrow(InsightsSchemaValidationError);
    });

    it('legacy string[] wraps into minimal OperatorInsight', () => {
        const result = parseAndValidateInsightsResponse({
            insights: ['Проверьте качество приветствия'],
        });
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('quality');
        expect(result[0].priority).toBe('low');
        expect(result[0].observation).toBe('Проверьте качество приветствия');
    });

    it('accepts null evidence.value when metric is N/A (outlier/quality insights)', () => {
        const result = parseAndValidateInsightsResponse({
            insights: [{
                priority: 'high',
                type: 'outlier',
                title: 'Операторы с низкими оценками',
                observation: 'Оператор имеет среднюю оценку 38.89',
                recommendation: 'Провести обратную связь',
                evidence: { metric: '', value: null, operators: ['Оператор А'], periodLabel: '' },
            }, {
                priority: 'low',
                type: 'quality',
                title: 'Общее качество',
                observation: 'Средний балл 70.73',
                recommendation: 'Разработать план улучшения',
                evidence: { metric: '', value: null, operators: [], periodLabel: '' },
            }],
        });
        expect(result).toHaveLength(2);
        expect(result[0].evidence.value).toBeUndefined();
        expect(result[0].evidence.operators).toEqual(['Оператор А']);
        expect(result[1].evidence.metric).toBeUndefined();
    });

    it('INSIGHTS_PROMPT_VERSION equals 2026-06-18.2', () => {
        expect(INSIGHTS_PROMPT_VERSION).toBe('2026-06-18.2');
    });

    it('buildInsightsJsonSchema evidence has all keys in required (OpenAI strict)', () => {
        const schema = buildInsightsJsonSchema() as {
            properties: { insights: { items: { properties: { evidence: { required: string[] } } } } };
        };
        const evidenceRequired = schema.properties.insights.items.properties.evidence.required;
        expect(evidenceRequired).toEqual(expect.arrayContaining(['metric', 'value', 'operators', 'periodLabel']));
    });

    it('normalizes Russian priority/type aliases from Ollama-like output', () => {
        const result = parseAndValidateInsightsResponse({
            insights: [{
                priority: 'Высокий',
                type: 'пробел',
                title: 'Тест',
                observation: 'Наблюдение',
                recommendation: 'Рекомендация',
                evidence: { metric: 'greeting_quality', value: 58, operators: [], periodLabel: '' },
            }],
        });
        expect(result[0].priority).toBe('high');
        expect(result[0].type).toBe('gap');
    });
});
