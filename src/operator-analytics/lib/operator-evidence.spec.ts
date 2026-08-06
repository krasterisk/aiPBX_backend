import {
    buildOperatorEvidence,
    readAssessment,
    resolveEvidenceMaxCalls,
    EVIDENCE_PER_METRIC,
} from './operator-evidence';

describe('operator-evidence', () => {
    describe('readAssessment', () => {
        it('returns rationale and quote when both are present and distinct', () => {
            const result = readAssessment({
                _assessments: {
                    greeting_quality: {
                        rationale: 'Оператор поприветствовал клиента.',
                        quote: 'Добрый день!',
                    },
                },
            }, 'greeting_quality');
            expect(result).toEqual({
                rationale: 'Оператор поприветствовал клиента.',
                quote: 'Добрый день!',
            });
        });

        it('suppresses quote when rationale already contains the same text', () => {
            const result = readAssessment({
                _assessments: {
                    greeting_quality: {
                        rationale: 'Цитата: «Здравствуйте» — формальное приветствие.',
                        quote: 'Здравствуйте',
                    },
                },
            }, 'greeting_quality');
            expect(result?.quote).toBeUndefined();
            expect(result?.rationale).toContain('Здравствуйте');
        });

        it('falls back to legacy bare-quote map', () => {
            const result = readAssessment({
                _evidence: { greeting_quality: 'Алло, слушаю вас.' },
            }, 'greeting_quality');
            expect(result).toEqual({ quote: 'Алло, слушаю вас.' });
        });

        it('returns nothing when neither assessment nor legacy quote exists', () => {
            expect(readAssessment({}, 'greeting_quality')).toBeUndefined();
        });
    });

    describe('buildOperatorEvidence', () => {
        const baseRecord = (overrides: Partial<{
            channelId: string;
            createdAt: string;
            metrics: Record<string, unknown>;
        }> = {}) => ({
            channelId: overrides.channelId ?? 'ch-1',
            createdAt: overrides.createdAt ?? '2026-07-01T12:00:00.000Z',
            analytics: { metrics: overrides.metrics },
        });

        it('omits a metric with zero evidence items', () => {
            const records = [baseRecord({
                metrics: {
                    greeting_quality: 80,
                    _assessments: {
                        script_compliance: { rationale: 'Есть обоснование.' },
                    },
                },
            })];

            const result = buildOperatorEvidence(records, { operatorName: 'Иван' });
            expect(result.metrics.map(m => m.metricId)).toEqual(['script_compliance']);
        });

        it('keeps a metric with a single evidence item', () => {
            const records = [baseRecord({
                metrics: {
                    greeting_quality: 55,
                    _assessments: {
                        greeting_quality: { quote: 'Здравствуйте.' },
                    },
                },
            })];

            const result = buildOperatorEvidence(records, { operatorName: 'Иван' });
            expect(result.metrics).toHaveLength(1);
            expect(result.metrics[0].evidence).toHaveLength(1);
        });

        it('caps each metric evidence at 5 and orders worst-scoring calls first by default', () => {
            const records = Array.from({ length: 6 }, (_, i) => baseRecord({
                channelId: `ch-${i}`,
                createdAt: `2026-07-0${i + 1}T12:00:00.000Z`,
                metrics: {
                    greeting_quality: 10 + i * 10,
                    _assessments: {
                        greeting_quality: { quote: `Цитата ${i}` },
                    },
                },
            }));

            const result = buildOperatorEvidence(records, { operatorName: 'Иван', order: 'worst' });
            expect(result.metrics[0].evidence).toHaveLength(EVIDENCE_PER_METRIC);
            expect(result.metrics[0].evidence[0].value).toBe(10);
            expect(result.metrics[0].evidence[4].value).toBe(50);
        });

        it('labels a project-defined metric from snapshot metadata', () => {
            const records = [baseRecord({
                metrics: {
                    upsell_attempt: true,
                    _custom_meta: {
                        upsell_attempt: { name: 'Попытка апселла', type: 'boolean' },
                    },
                    _assessments: {
                        upsell_attempt: { rationale: 'Апселл не предложен.' },
                    },
                },
            })];

            const result = buildOperatorEvidence(records, {
                operatorName: 'Иван',
                customMetricIds: ['upsell_attempt'],
            });
            expect(result.metrics[0]).toMatchObject({
                metricId: 'upsell_attempt',
                origin: 'custom',
                label: 'Попытка апселла',
            });
        });

        it('reads custom boolean values from custom_metrics and averages them as a rate', () => {
            const records = [
                baseRecord({
                    channelId: '1',
                    metrics: {
                        custom_metrics: { service_booking: true },
                        _custom_meta: {
                            service_booking: { name: 'Запись на сервис', type: 'boolean' },
                        },
                        _assessments: {
                            service_booking: {
                                rationale: 'Запись клиента на услугу была оформлена.',
                                quote: 'Завтра в 14 часов',
                            },
                        },
                    },
                }),
                baseRecord({
                    channelId: '2',
                    createdAt: '2026-07-01T11:00:00.000Z',
                    metrics: {
                        custom_metrics: { service_booking: false },
                        _assessments: {
                            service_booking: {
                                rationale: 'Запись клиента на сервис не была оформлена.',
                            },
                        },
                    },
                }),
            ];

            const result = buildOperatorEvidence(records, {
                operatorName: 'all',
                customMetricIds: ['service_booking'],
            });
            const metric = result.metrics.find(m => m.metricId === 'service_booking');
            expect(metric).toMatchObject({
                origin: 'custom',
                sampleSize: 2,
                average: 50,
            });
            expect(metric?.evidence).toHaveLength(2);
            expect(metric?.evidence.map(e => e.value)).toEqual([false, true]);
        });

        it('marks built-in keys as default origin', () => {
            const records = [baseRecord({
                metrics: {
                    greeting_quality: 70,
                    _assessments: {
                        greeting_quality: { quote: 'Добрый день.' },
                    },
                },
            })];

            const result = buildOperatorEvidence(records, { operatorName: 'Иван' });
            expect(result.metrics[0].origin).toBe('default');
        });

        it('returns a zero-shaped result for an empty record list', () => {
            const result = buildOperatorEvidence([], { operatorName: 'Иван' });
            expect(result).toEqual({
                operatorName: 'Иван',
                callsCount: 0,
                scoredCalls: 0,
                averageScore: 0,
                sampleCapped: false,
                metrics: [],
            });
        });

        it('averages summary metrics on meaningful scales (csat 1–5, success %, sentiment 0–100)', () => {
            const records = [
                baseRecord({
                    channelId: '1',
                    metrics: {
                        csat: 5,
                        success: true,
                        customer_sentiment: 'Positive',
                        _assessments: {
                            csat: { rationale: 'High CSAT' },
                            success: { rationale: 'Resolved' },
                            customer_sentiment: { rationale: 'Happy' },
                        },
                    },
                }),
                baseRecord({
                    channelId: '2',
                    metrics: {
                        csat: 3,
                        success: false,
                        customer_sentiment: 'Negative',
                        _assessments: {
                            csat: { rationale: 'Mid CSAT' },
                            success: { rationale: 'Not resolved' },
                            customer_sentiment: { rationale: 'Upset' },
                        },
                    },
                }),
            ];

            const result = buildOperatorEvidence(records, { operatorName: 'Иван' });
            const byId = Object.fromEntries(result.metrics.map(m => [m.metricId, m]));

            expect(byId.csat.average).toBe(4);
            expect(byId.success.average).toBe(50);
            expect(byId.customer_sentiment.average).toBe(50);
        });
    });

    describe('resolveEvidenceMaxCalls', () => {
        const original = process.env.OPERATOR_EVIDENCE_MAX_CALLS;

        afterEach(() => {
            if (original === undefined) {
                delete process.env.OPERATOR_EVIDENCE_MAX_CALLS;
            } else {
                process.env.OPERATOR_EVIDENCE_MAX_CALLS = original;
            }
        });

        it('defaults to 300 and allows client limit to lower it', () => {
            delete process.env.OPERATOR_EVIDENCE_MAX_CALLS;
            expect(resolveEvidenceMaxCalls()).toBe(300);
            expect(resolveEvidenceMaxCalls(50)).toBe(50);
        });
    });
});
