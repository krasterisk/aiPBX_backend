import { extractLlmJsonContent } from './llm-json';

describe('extractLlmJsonContent', () => {
    const sample = {
        greeting_quality: 75,
        customer_sentiment: 'Neutral',
        csat: 3,
        summary: 'ok',
        success: true,
        analysis_confidence: 0.8,
        insufficient_content: false,
        diarized_text: [],
    };

    it('returns empty string for empty / whitespace input', () => {
        expect(extractLlmJsonContent('')).toBe('');
        expect(extractLlmJsonContent('   ')).toBe('');
    });

    it('extracts JSON that appears after a closed <think> block (gemma/qwen)', () => {
        const raw = `<think>
I will score the greeting carefully.
</think>
${JSON.stringify(sample)}`;
        expect(JSON.parse(extractLlmJsonContent(raw))).toEqual(sample);
    });

    it('recovers JSON that was placed inside <think> when outside is empty', () => {
        // Regression: strip-only left "" → sanitize became "{}" → all Zod fields undefined
        const raw = `<think>
Reasoning...
${JSON.stringify(sample)}
</think>`;
        expect(JSON.parse(extractLlmJsonContent(raw))).toEqual(sample);
    });

    it('extracts JSON from markdown fences and leading prose', () => {
        const raw = `Here is the analysis:\n\`\`\`json\n${JSON.stringify(sample)}\n\`\`\`\nThanks.`;
        expect(JSON.parse(extractLlmJsonContent(raw))).toEqual(sample);
    });

    it('strips trailing commas so JSON.parse succeeds', () => {
        const raw = '{"summary":"x","success":true,}';
        expect(JSON.parse(extractLlmJsonContent(raw))).toEqual({ summary: 'x', success: true });
    });

    it('returns empty when there is no JSON object', () => {
        expect(extractLlmJsonContent('<think>no json here</think>')).toBe('');
        expect(extractLlmJsonContent('not json at all')).toBe('');
    });
});
