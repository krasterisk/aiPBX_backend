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

    it('repairs truncated Ollama JSON cut mid-string', () => {
        const raw = '{ "assessments": { "greeting_quality": { "rationale": "Оператор представилась.", "quote": "Добрый день, администратор Наталь';
        const parsed = JSON.parse(extractLlmJsonContent(raw));
        expect(parsed.assessments.greeting_quality.rationale).toBe('Оператор представилась.');
        expect(parsed.assessments.greeting_quality.quote).toMatch(/^Добрый день/);
    });

    it('repairs truncated JSON cut mid-key by dropping the incomplete key', () => {
        const raw = '{"summary":"ok","success":true,"analy';
        expect(JSON.parse(extractLlmJsonContent(raw))).toEqual({ summary: 'ok', success: true });
    });

    it('escapes raw newlines inside JSON strings', () => {
        const raw = '{"summary":"line1\nline2","success":true}';
        expect(JSON.parse(extractLlmJsonContent(raw))).toEqual({
            summary: 'line1\nline2',
            success: true,
        });
    });
});
