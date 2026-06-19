import {
    assessTranscriptionQuality,
    combineTranscriptionQuality,
    DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS,
} from './assess-transcription-quality';

describe('assessTranscriptionQuality', () => {
    const thresholds = DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS;

    it('returns ok for healthy transcript with strong STT signals', () => {
        const result = assessTranscriptionQuality({
            text: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen',
            avgLogprob: -0.4,
            noSpeechProb: 0.1,
            compressionRatio: 1.2,
            languageProbability: 0.95,
        }, thresholds);

        expect(result.quality).toBe('ok');
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reasons).toHaveLength(0);
    });

    it('marks unusable when word count is below threshold', () => {
        const result = assessTranscriptionQuality({
            text: 'hello world',
        }, thresholds);

        expect(result.quality).toBe('unusable');
        expect(result.reasons).toContain('INSUFFICIENT_CONTENT');
    });

    it('marks low when avg logprob is weak', () => {
        const result = assessTranscriptionQuality({
            text: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen',
            avgLogprob: -1.1,
        }, thresholds);

        expect(result.quality).toBe('low');
        expect(result.reasons).toContain('LOW_STT_QUALITY');
    });

    it('marks unusable when avg logprob is very weak', () => {
        const result = assessTranscriptionQuality({
            text: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen',
            avgLogprob: -1.4,
        }, thresholds);

        expect(result.quality).toBe('unusable');
    });
});

describe('combineTranscriptionQuality', () => {
    it('downgrades to low when LLM reports insufficient content', () => {
        const combined = combineTranscriptionQuality(
            { quality: 'ok', confidence: 0.9, reasons: [] },
            { insufficient_content: true, analysis_confidence: 0.2 },
        );

        expect(combined.quality).toBe('low');
        expect(combined.reasons).toContain('INSUFFICIENT_CONTENT');
        expect(combined.confidence).toBeLessThanOrEqual(0.35);
    });
});
