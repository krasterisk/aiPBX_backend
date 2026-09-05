import { chunkHasVisibleText, extractAssistantText, extractOpenAiChunkText, pickOllamaModel, stripThinkIncremental, stripThinkTags } from './openai-compat.util';

describe('openai-compat utils', () => {
    const available = ['gemma4:e4b', 'nomic-embed-text:latest'];

    it('uses fallback when model is missing or unknown', () => {
        expect(pickOllamaModel(undefined, available, 'gemma4:e4b')).toBe('gemma4:e4b');
        expect(pickOllamaModel('gpt-4o-mini', available, 'gemma4:e4b')).toBe('gemma4:e4b');
        expect(pickOllamaModel('  ', available, 'gemma4:e4b')).toBe('gemma4:e4b');
    });

    it('keeps an Ollama model and expands a bare name', () => {
        expect(pickOllamaModel('gemma4:e4b', available, 'other')).toBe('gemma4:e4b');
        expect(pickOllamaModel('gemma4', available, 'other')).toBe('gemma4:e4b');
    });

    it('strips Gemma/Qwen think blocks', () => {
        expect(stripThinkTags('hello <think>secret</think> world')).toBe('hello  world');
        expect(stripThinkIncremental('<think>план</think>Да', false)).toEqual({
            text: 'Да',
            insideThink: false,
        });
        expect(stripThinkIncremental('abc', true)).toEqual({ text: '', insideThink: true });
        expect(stripThinkIncremental('</think>Hi', true)).toEqual({ text: 'Hi', insideThink: false });
    });

    it('reads stream text from delta or message.content', () => {
        expect(extractOpenAiChunkText({ choices: [{ delta: { content: 'Hi' } }] })).toBe('Hi');
        expect(extractOpenAiChunkText({ choices: [{ message: { content: 'слышу' } }] })).toBe('слышу');
        expect(extractOpenAiChunkText({ choices: [{ delta: {} }] })).toBe('');
    });

    it('extracts assistant text from content parts, reasoning, or think-only replies', () => {
        expect(extractAssistantText({ content: '<think>x</think>Да' })).toBe('Да');
        expect(extractAssistantText({ content: [{ type: 'text', text: 'слышу' }] })).toBe('слышу');
        expect(extractAssistantText({ content: '', reasoning: 'Ответ: да' })).toBe('Ответ: да');
        expect(extractAssistantText({ content: '<think>только мысль</think>' })).toBe('только мысль');
    });

    it('treats tool_calls as visible stream output', () => {
        expect(chunkHasVisibleText({ choices: [{ delta: { tool_calls: [{ id: 'c1' }] } }] })).toBe(true);
        expect(chunkHasVisibleText({ choices: [{ delta: {} }] })).toBe(false);
    });
});
