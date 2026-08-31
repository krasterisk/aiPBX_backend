import {
    buildAnalysisCompletedWebhookData,
    buildAnalysisCompletedWebhookDataFromStored,
    parseWebhookTranscript,
} from './webhook-payload';

describe('webhook-payload', () => {
    describe('parseWebhookTranscript', () => {
        it('returns nulls for empty input', () => {
            expect(parseWebhookTranscript(null)).toEqual({ transcription: null, turns: null });
            expect(parseWebhookTranscript('   ')).toEqual({ transcription: null, turns: null });
        });

        it('keeps plain text as transcription', () => {
            expect(parseWebhookTranscript('оператор: здравствуйте')).toEqual({
                transcription: 'оператор: здравствуйте',
                turns: null,
            });
        });

        it('parses diarized JSON into turns and labeled text', () => {
            const raw = JSON.stringify([
                { speaker: 'operator', text: 'Добрый день', start: 0.1, end: 1.2 },
                { speaker: 'customer', text: 'Здравствуйте' },
            ]);
            expect(parseWebhookTranscript(raw)).toEqual({
                transcription: 'operator: Добрый день\ncustomer: Здравствуйте',
                turns: [
                    { speaker: 'operator', text: 'Добрый день', start: 0.1, end: 1.2 },
                    { speaker: 'customer', text: 'Здравствуйте' },
                ],
            });
        });

        it('falls back to plain text when JSON is not a turn list', () => {
            expect(parseWebhookTranscript('["not", "turns"]')).toEqual({
                transcription: '["not", "turns"]',
                turns: null,
            });
        });
    });

    describe('buildAnalysisCompletedWebhookData', () => {
        it('keeps legacy keys and adds full analysis fields', () => {
            const data = buildAnalysisCompletedWebhookData({
                recordId: 42,
                filename: 'call.wav',
                metrics: {
                    greeting_quality: 80,
                    customer_sentiment: 'Positive',
                    csat: 4,
                    summary: 'Клиент согласился',
                    success: true,
                },
                customMetrics: { upsell_attempt: true },
                transcription: JSON.stringify([
                    { speaker: 'operator', text: 'Алло' },
                    { speaker: 'customer', text: 'Да' },
                ]),
                duration: 95.4,
                operatorName: 'Иван',
                clientPhone: '+79001234567',
                language: 'ru',
                detectedLanguage: 'ru',
                recordUrl: 'https://files.example/call.wav',
                sttProvider: 'openai',
                quality: { quality: 'ok', confidence: 0.91, reasons: [] },
                assessments: {
                    greeting_quality: { rationale: 'Поздоровался', quote: 'Добрый день' },
                },
                customMetricsMeta: { upsell_attempt: { name: 'Апселл', type: 'boolean' } },
                topics: { tags: ['billing'], tag_names: { billing: 'Оплата' } },
                analysisConfidence: 0.88,
                insufficientContent: false,
                schemaVersion: 2,
                promptVersion: '2026-08-12.1',
                model: 'gpt-4.1-mini',
                diarizationSource: 'channel',
                customMetricsInvalid: [],
            });

            expect(data.recordId).toBe(42);
            expect(data.filename).toBe('call.wav');
            expect(data.metrics).toEqual(expect.objectContaining({
                greeting_quality: 80,
                csat: 4,
                success: true,
            }));
            expect(data.customMetrics).toEqual({ upsell_attempt: true });
            expect(data.transcription).toBe('operator: Алло\ncustomer: Да');
            expect(data.turns).toEqual([
                { speaker: 'operator', text: 'Алло' },
                { speaker: 'customer', text: 'Да' },
            ]);
            expect(data.assessments).toEqual({
                greeting_quality: { rationale: 'Поздоровался', quote: 'Добрый день' },
            });
            expect(data.topics).toEqual({ tags: ['billing'], tag_names: { billing: 'Оплата' } });
            expect(data.regenerated).toBeUndefined();
            expect(data.deduplicatedFrom).toBeUndefined();
        });

        it('adds regenerated / deduplicatedFrom flags only when set', () => {
            const data = buildAnalysisCompletedWebhookData({
                recordId: 1,
                filename: 'a.wav',
                metrics: {},
                regenerated: true,
                deduplicatedFrom: 9,
            });
            expect(data.regenerated).toBe(true);
            expect(data.deduplicatedFrom).toBe(9);
        });
    });

    describe('buildAnalysisCompletedWebhookDataFromStored', () => {
        it('unpacks stored metrics JSON into the public webhook shape', () => {
            const data = buildAnalysisCompletedWebhookDataFromStored({
                record: {
                    id: 7,
                    filename: 'dup.wav',
                    transcription: 'plain text',
                    duration: 30,
                    operatorName: 'Анна',
                    clientPhone: '+7999',
                    language: 'ru',
                    sttProvider: 'external',
                    schemaVersion: 3,
                    promptVersion: '2026-08-12.1',
                },
                storedMetrics: {
                    greeting_quality: 70,
                    csat: 3,
                    summary: 'Короткий звонок',
                    success: false,
                    customer_sentiment: 'Neutral',
                    custom_metrics: { flag: true },
                    _assessments: { csat: { rationale: 'Средне', quote: 'ладно' } },
                    _custom_meta: { flag: { type: 'boolean', name: 'Флаг' } },
                    _topics: { tags: ['other'] },
                    _quality: { quality: 'ok', confidence: 0.7, reasons: [] },
                    _model: { name: 'qwen', promptVersion: '2026-08-12.1' },
                    _schema_version: 3,
                    _diarization: { source: 'llm' },
                    _custom_invalid: ['broken'],
                },
                deduplicatedFrom: 2,
            });

            expect(data.recordId).toBe(7);
            expect(data.metrics).toEqual({
                greeting_quality: 70,
                csat: 3,
                summary: 'Короткий звонок',
                success: false,
                customer_sentiment: 'Neutral',
            });
            expect(data.customMetrics).toEqual({ flag: true });
            expect(data.transcription).toBe('plain text');
            expect(data.assessments).toEqual({ csat: { rationale: 'Средне', quote: 'ладно' } });
            expect(data.model).toBe('qwen');
            expect(data.diarizationSource).toBe('llm');
            expect(data.customMetricsInvalid).toEqual(['broken']);
            expect(data.deduplicatedFrom).toBe(2);
        });
    });
});
