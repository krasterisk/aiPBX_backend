import { extractOpenAiChunkText, pickOllamaModel, stripThinkTags } from './openai-compat.util';

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
    });

    it('reads stream text from delta or message.content', () => {
        expect(extractOpenAiChunkText({ choices: [{ delta: { content: 'Hi' } }] })).toBe('Hi');
        expect(extractOpenAiChunkText({ choices: [{ message: { content: 'слышу' } }] })).toBe('слышу');
        expect(extractOpenAiChunkText({ choices: [{ delta: {} }] })).toBe('');
    });
});
