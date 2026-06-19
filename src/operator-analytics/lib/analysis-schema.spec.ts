import {
    AnalysisSchemaValidationError,
    buildAnalysisContext,
    buildAnalysisPrompt,
    buildCustomMetricMeta,
    buildOpenAiJsonSchema,
    buildZodAnalysisSchema,
    inferNumberRange,
    METRIC_RUBRIC_DESCRIPTIONS,
    parseAndValidateAnalysisResponse,
    PROMPT_VERSION,
    resolveVisibleDefaultMetrics,
    sanitizeCustomMetricValues,
} from './analysis-schema';
import { ALL_DEFAULT_METRIC_KEYS } from '../interfaces/operator-metrics.interface';

describe('analysis-schema', () => {
    const ctx = buildAnalysisContext({
        visibleDefaultMetrics: ['greeting_quality', 'script_compliance'],
        customMetricsSchema: [
            { id: 'upsell_attempt', name: 'Upsell', type: 'boolean', description: 'Tried upsell' },
        ],
    } as any);

    it('limits visible default metrics to project configuration', () => {
        expect(resolveVisibleDefaultMetrics({
            visibleDefaultMetrics: ['greeting_quality'],
        } as any)).toEqual(['greeting_quality']);
        expect(resolveVisibleDefaultMetrics(undefined)).toEqual(ALL_DEFAULT_METRIC_KEYS);
    });

    it('builds OpenAI schema only for visible metrics', () => {
        const schema = buildOpenAiJsonSchema(ctx) as any;
        expect(schema.properties.greeting_quality).toBeDefined();
        expect(schema.properties.script_compliance).toBeDefined();
        expect(schema.properties.politeness_empathy).toBeUndefined();
        expect(schema.properties.custom_metrics).toBeDefined();
        expect(schema.properties.assessments.properties.upsell_attempt).toBeDefined();
        expect(schema.properties.assessments.properties.greeting_quality.properties.rationale)
            .toBeDefined();
    });

    it('orders assessments before numeric scores (reason-before-score)', () => {
        const schema = buildOpenAiJsonSchema(ctx) as any;
        const keys = Object.keys(schema.properties);
        expect(keys.indexOf('assessments')).toBeLessThan(keys.indexOf('greeting_quality'));
    });

    it('includes summary-level assessments (csat / sentiment / success)', () => {
        const schema = buildOpenAiJsonSchema(ctx) as any;
        expect(schema.properties.assessments.properties.csat).toBeDefined();
        expect(schema.properties.assessments.properties.customer_sentiment).toBeDefined();
        expect(schema.properties.assessments.properties.success).toBeDefined();
    });

    it('prompts full score when all greeting rubric elements are present', () => {
        const greetingCtx = buildAnalysisContext({
            visibleDefaultMetrics: ['greeting_quality'],
        } as any);
        const prompt = buildAnalysisPrompt('Оператор: Добрый день, клиника X, меня зовут Татьяна, слушаю вас.', greetingCtx);

        expect(PROMPT_VERSION).toBe('2026-06-18.3');
        expect(prompt).toContain('100 = all 4 elements present');
        expect(prompt).toContain('Do not withhold 100');
        expect(prompt).toContain('Добрый день');
    });

    it('includes checklist rubrics for every default metric', () => {
        for (const key of ALL_DEFAULT_METRIC_KEYS) {
            expect(METRIC_RUBRIC_DESCRIPTIONS[key]).toContain('100 = all 4 elements present');
            expect(METRIC_RUBRIC_DESCRIPTIONS[key]).toContain('Do not withhold 100');
        }

        const fullCtx = buildAnalysisContext({ visibleDefaultMetrics: [...ALL_DEFAULT_METRIC_KEYS] } as any);
        const prompt = buildAnalysisPrompt('sample transcript', fullCtx);
        expect(prompt).toContain('objection_handling');
        expect(prompt).toContain('If the customer raised no objection or complaint in this call, assign 100');
        expect(prompt).toContain('Call closing and next steps');
    });

    it('validates a correct analysis payload', () => {
        const payload = {
            assessments: {
                greeting_quality: { rationale: 'Поздоровался и представился — уровень 75', quote: 'Здравствуйте, меня зовут Иван' },
                script_compliance: { rationale: 'Частично следовал скрипту', quote: 'Следовал скрипту' },
                upsell_attempt: { rationale: 'Предложил доп. услугу', quote: 'Хотите подключить опцию?' },
                csat: { rationale: 'Клиент остался доволен', quote: 'Спасибо большое' },
                customer_sentiment: { rationale: 'Позитивный тон в конце', quote: 'Отлично' },
                success: { rationale: 'Вопрос решён', quote: 'Всё работает' },
            },
            greeting_quality: 75,
            script_compliance: 50,
            customer_sentiment: 'Positive',
            csat: 4,
            summary: 'Test summary',
            success: true,
            analysis_confidence: 0.9,
            insufficient_content: false,
            diarized_text: [{ speaker: 'operator', text: 'Hello' }],
            custom_metrics: { upsell_attempt: true },
        };

        const schema = buildZodAnalysisSchema(ctx);
        expect(schema.safeParse(payload).success).toBe(true);

        const parsed = parseAndValidateAnalysisResponse(JSON.stringify(payload), ctx, raw => raw);
        expect(parsed.metrics.greeting_quality).toBe(75);
        expect(parsed.customMetricsResult).toEqual({ upsell_attempt: true });
        expect(parsed.assessments?.greeting_quality.rationale).toContain('75');
        expect(parsed.assessments?.greeting_quality.quote).toContain('Иван');
    });

    it('infers numeric range from free-text description', () => {
        expect(inferNumberRange('Поставь оценку от 0 до 10')).toEqual({ min: 0, max: 10 });
        expect(inferNumberRange('Scale 1 to 5')).toEqual({ min: 1, max: 5 });
        expect(inferNumberRange('Шкала 0-100')).toEqual({ min: 0, max: 100 });
        expect(inferNumberRange('no range here')).toEqual({});
    });

    it('builds custom metric meta with explicit range and polarity defaults', () => {
        const metaCtx = buildAnalysisContext({
            visibleDefaultMetrics: ['greeting_quality'],
            customMetricsSchema: [
                { id: 'satisfaction', name: 'Удовлетворённость', type: 'number', description: 'оценка от 0 до 10' },
                { id: 'profanity', name: 'Нецензурные слова', type: 'boolean', description: 'Были ли?', polarity: 'negative' },
                { id: 'csat10', name: 'CSAT', type: 'number', description: 'score', min: 1, max: 10, unit: '/10' },
            ],
        } as any);

        const meta = buildCustomMetricMeta(metaCtx);
        // number polarity defaults to positive; range inferred from description
        expect(meta.satisfaction).toMatchObject({ type: 'number', min: 0, max: 10, polarity: 'positive' });
        // explicit range + unit preserved
        expect(meta.csat10).toMatchObject({ min: 1, max: 10, unit: '/10' });
        // boolean keeps explicit polarity
        expect(meta.profanity).toMatchObject({ type: 'boolean', polarity: 'negative' });
    });

    it('rejects invalid enum and out-of-range score', () => {
        const payload = {
            assessments: {},
            greeting_quality: 120,
            script_compliance: 50,
            customer_sentiment: 'Happy',
            csat: 4,
            summary: 'Test',
            success: true,
            analysis_confidence: 0.9,
            insufficient_content: false,
            diarized_text: [],
        };

        expect(() => parseAndValidateAnalysisResponse(JSON.stringify(payload), ctx, raw => raw))
            .toThrow(AnalysisSchemaValidationError);
    });

    describe('sanitizeCustomMetricValues', () => {
        const semCtx = buildAnalysisContext({
            visibleDefaultMetrics: ['greeting_quality'],
            customMetricsSchema: [
                { id: 'score10', name: 'Score', type: 'number', description: 'x', min: 0, max: 10 },
                { id: 'flag', name: 'Flag', type: 'boolean', description: 'x' },
                { id: 'tier', name: 'Tier', type: 'enum', description: 'x', enumValues: ['low', 'high'] },
                { id: 'note', name: 'Note', type: 'string', description: 'x' },
            ],
        } as any);

        it('keeps valid values untouched', () => {
            const { values, invalid } = sanitizeCustomMetricValues(
                { score10: 7, flag: true, tier: 'high', note: 'ok' }, semCtx,
            );
            expect(values).toEqual({ score10: 7, flag: true, tier: 'high', note: 'ok' });
            expect(invalid).toEqual([]);
        });

        it('nulls + flags numbers outside the configured range', () => {
            const { values, invalid } = sanitizeCustomMetricValues({ score10: 99 }, semCtx);
            expect(values).toEqual({ score10: null });
            expect(invalid).toContain('score10');
        });

        it('nulls + flags enum values not in the list', () => {
            const { values, invalid } = sanitizeCustomMetricValues({ tier: 'medium' }, semCtx);
            expect(values).toEqual({ tier: null });
            expect(invalid).toContain('tier');
        });

        it('coerces numeric strings and stringified booleans', () => {
            const { values, invalid } = sanitizeCustomMetricValues(
                { score10: '5', flag: 'false' }, semCtx,
            );
            expect(values).toMatchObject({ score10: 5, flag: false });
            expect(invalid).toEqual([]);
        });

        it('ignores keys not in the project schema', () => {
            const { values } = sanitizeCustomMetricValues({ unknown: 1, flag: true }, semCtx);
            expect(values).toEqual({ flag: true });
        });

        it('returns null values for empty/absent input', () => {
            expect(sanitizeCustomMetricValues(null, semCtx)).toEqual({ values: null, invalid: [] });
        });
    });

    it('sanitizes custom metric values via parseAndValidateAnalysisResponse (no hard fail)', () => {
        const rangeCtx = buildAnalysisContext({
            visibleDefaultMetrics: ['greeting_quality'],
            customMetricsSchema: [
                { id: 'score10', name: 'Score', type: 'number', description: 'x', min: 0, max: 10 },
            ],
        } as any);
        const payload = {
            assessments: {},
            greeting_quality: 75,
            customer_sentiment: 'Positive',
            csat: 4,
            summary: 'Test',
            success: true,
            analysis_confidence: 0.9,
            insufficient_content: false,
            diarized_text: [],
            custom_metrics: { score10: 999 },
        };
        const result = parseAndValidateAnalysisResponse(JSON.stringify(payload), rangeCtx, raw => raw);
        expect(result.customMetricsResult).toEqual({ score10: null });
        expect(result.customMetricsInvalid).toContain('score10');
    });
});
