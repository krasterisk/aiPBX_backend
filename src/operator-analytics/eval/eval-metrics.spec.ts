import {
    meanAbsoluteError,
    proportionAgreement,
    cohensKappa,
    buildEvalReport,
    EvalItem,
} from './eval-metrics';

describe('eval-metrics', () => {
    describe('meanAbsoluteError', () => {
        it('returns null for no pairs', () => {
            expect(meanAbsoluteError([])).toBeNull();
        });

        it('computes MAE', () => {
            expect(meanAbsoluteError([[100, 75], [50, 50], [0, 25]])).toBe(
                Math.round(((25 + 0 + 25) / 3) * 1000) / 1000,
            );
        });

        it('is zero for perfect predictions', () => {
            expect(meanAbsoluteError([[5, 5], [3, 3]])).toBe(0);
        });
    });

    describe('proportionAgreement', () => {
        it('returns null for empty', () => {
            expect(proportionAgreement([])).toBeNull();
        });

        it('computes accuracy', () => {
            expect(proportionAgreement([['a', 'a'], ['b', 'c'], ['c', 'c']])).toBe(0.667);
        });
    });

    describe('cohensKappa', () => {
        it('returns null for mismatched lengths', () => {
            expect(cohensKappa(['a'], ['a', 'b'])).toBeNull();
        });

        it('returns null when chance agreement is 1 (single category)', () => {
            expect(cohensKappa(['a', 'a'], ['a', 'a'])).toBeNull();
        });

        it('is 1 for perfect agreement across categories', () => {
            expect(cohensKappa(['a', 'b', 'a', 'b'], ['a', 'b', 'a', 'b'])).toBe(1);
        });

        it('is 0 for chance-level agreement', () => {
            // predicted all 'a', reference split → po = 0.5, pe = 0.5 → kappa 0
            const k = cohensKappa(['a', 'a', 'a', 'a'], ['a', 'a', 'b', 'b']);
            expect(k).toBe(0);
        });

        it('is negative for systematic disagreement', () => {
            const k = cohensKappa(['a', 'b'], ['b', 'a']);
            expect(k).not.toBeNull();
            expect(k as number).toBeLessThan(0);
        });
    });

    describe('buildEvalReport', () => {
        const items: EvalItem[] = [
            {
                id: 'c1',
                reference: { greeting_quality: 100, csat: 5, customer_sentiment: 'Positive', success: true },
                predicted: { greeting_quality: 75, csat: 5, customer_sentiment: 'Positive', success: true },
            },
            {
                id: 'c2',
                reference: { greeting_quality: 50, csat: 3, customer_sentiment: 'Negative', success: false },
                predicted: { greeting_quality: 50, csat: 2, customer_sentiment: 'Neutral', success: false },
            },
        ];

        it('computes numeric MAE per metric and macro average', () => {
            const report = buildEvalReport(items);
            const greeting = report.numeric.find(m => m.metric === 'greeting_quality');
            const csat = report.numeric.find(m => m.metric === 'csat');
            expect(greeting?.mae).toBe(12.5); // (25 + 0) / 2
            expect(csat?.mae).toBe(0.5); // (0 + 1) / 2
            expect(report.overallMae).not.toBeNull();
        });

        it('computes categorical accuracy and kappa', () => {
            const report = buildEvalReport(items);
            const sentiment = report.categorical.find(m => m.metric === 'customer_sentiment');
            const success = report.categorical.find(m => m.metric === 'success');
            expect(sentiment?.accuracy).toBe(0.5); // 1/2 match
            expect(success?.accuracy).toBe(1); // both match
            expect(report.casesEvaluated).toBe(2);
        });

        it('ignores metrics absent from reference or prediction', () => {
            const sparse: EvalItem[] = [
                { id: 'x', reference: { csat: 4 }, predicted: { greeting_quality: 50 } },
            ];
            const report = buildEvalReport(sparse);
            // No overlapping numeric metric → no numeric rows
            expect(report.numeric.length).toBe(0);
            expect(report.overallMae).toBeNull();
        });
    });
});
