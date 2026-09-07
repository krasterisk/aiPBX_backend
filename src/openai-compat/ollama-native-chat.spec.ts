import { OllamaNativeChat, toOllamaMessages, toOpenAiChunk, toOpenAiCompletion } from './ollama-native-chat';

describe('OllamaNativeChat', () => {
    it('converts OpenAI tool history into Ollama messages', () => {
        expect(toOllamaMessages([
            {
                role: 'assistant',
                content: '',
                tool_calls: [{ id: 'call_1', function: { name: 'create_ivr', arguments: '{"name":"Продажи"}' } }],
            },
            { role: 'tool', name: 'create_ivr', tool_call_id: 'call_1', content: '{"ok":true}' },
        ])).toEqual([
            {
                role: 'assistant',
                content: '',
                tool_calls: [{ function: { name: 'create_ivr', arguments: { name: 'Продажи' } } }],
            },
            { role: 'tool', content: '{"ok":true}', tool_name: 'create_ivr' },
        ]);
    });

    it('maps a native completion onto OpenAI tool_calls + usage', () => {
        const body = toOpenAiCompletion({
            model: 'qwen3.5:9b',
            message: {
                role: 'assistant',
                content: '',
                tool_calls: [{ function: { name: 'create_ivr', arguments: { name: 'Продажи' } } }],
            },
            done_reason: 'stop',
            prompt_eval_count: 11237,
            eval_count: 40,
        }, 'qwen3.5:9b');

        expect(body.choices[0].finish_reason).toBe('tool_calls');
        expect(body.choices[0].message.tool_calls?.[0].function).toEqual({
            name: 'create_ivr',
            arguments: '{"name":"Продажи"}',
        });
        expect(body.usage).toEqual({
            prompt_tokens: 11237,
            completion_tokens: 40,
            total_tokens: 11277,
        });
    });

    it('maps a native stream token onto an OpenAI delta', () => {
        const chunk = toOpenAiChunk({
            model: 'qwen3.5:9b',
            message: { role: 'assistant', content: 'The' },
            done: false,
        }, 'qwen3.5:9b', 'chatcmpl-1');
        expect(chunk.choices[0].delta.content).toBe('The');
        expect(chunk.choices[0].finish_reason).toBeNull();
    });

    it('POSTs /api/chat with num_ctx instead of /v1/chat/completions', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                model: 'qwen3.5:9b',
                message: { role: 'assistant', content: 'Да' },
                prompt_eval_count: 200,
                eval_count: 1,
            }),
        });
        const client = new OllamaNativeChat({
            baseUrl: 'http://ollama:11434/v1',
            numCtx: 32768,
            fetchImpl: fetchImpl as never,
        });

        const body = await client.create({
            model: 'qwen3.5:9b',
            messages: [{ role: 'user', content: 'hi' }],
            stream: false,
            max_tokens: 4096,
            options: { num_ctx: 32768 },
        });

        expect(fetchImpl).toHaveBeenCalledWith('http://ollama:11434/api/chat', expect.objectContaining({
            method: 'POST',
        }));
        const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(sent.options).toEqual({ num_ctx: 32768, num_predict: 4096 });
        expect(sent.keep_alive).toBe(-1);
        expect(sent.stream).toBe(false);
        if (!body || typeof (body as { choices?: unknown }).choices === 'undefined') {
            throw new Error('expected a non-stream completion');
        }
        expect((body as { choices: Array<{ message: { content: string } }> }).choices[0].message.content).toBe('Да');
    });

    it('forwards OpenAI tools and tool_choice to native /api/chat', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                model: 'qwen3.5:9b',
                message: { role: 'assistant', content: '' },
                done_reason: 'stop',
            }),
        });
        const client = new OllamaNativeChat({
            baseUrl: 'http://ollama:11434/v1',
            numCtx: 32768,
            fetchImpl: fetchImpl as never,
        });

        await client.create({
            model: 'qwen3.5:9b',
            messages: [{ role: 'user', content: 'создай IVR' }],
            stream: false,
            tools: [{ type: 'function', function: { name: 'create_ivr' } }],
            tool_choice: 'auto',
        });

        const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(sent.tools).toHaveLength(1);
        expect(sent.tool_choice).toBe('auto');
    });
});
