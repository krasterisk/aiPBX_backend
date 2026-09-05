import { HttpStatus } from '@nestjs/common';
import { OpenAiCompatService } from './openai-compat.service';

describe('OpenAiCompatService', () => {
    let create: jest.Mock;
    let listModels: jest.Mock;
    let service: OpenAiCompatService;

    beforeEach(() => {
        create = jest.fn();
        listModels = jest.fn().mockResolvedValue(['gemma4:e4b']);
        service = new OpenAiCompatService(
            { chat: { completions: { create } } } as never,
            listModels,
            'gemma4:e4b',
        );
    });

    it('rejects a request without messages', async () => {
        await expect(service.complete({ messages: [] })).rejects.toMatchObject({
            status: HttpStatus.BAD_REQUEST,
        });
        expect(create).not.toHaveBeenCalled();
    });

    it('falls back from gpt-4o-mini and returns a non-stream OpenAI completion', async () => {
        create.mockResolvedValue({
            id: 'chatcmpl-ollama',
            object: 'chat.completion',
            created: 1,
            model: 'gemma4:e4b',
            choices: [{
                index: 0,
                message: { role: 'assistant', content: '<think>x</think>Привет' },
                finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        });

        const result = await service.complete({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'hi' }],
            stream: false,
        });

        expect(result.stream).toBe(false);
        if (result.stream !== false) throw new Error('expected non-stream');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gemma4:e4b',
            stream: false,
            messages: [{ role: 'user', content: 'hi' }],
        }), expect.anything());
        expect(result.body.model).toBe('gemma4:e4b');
        expect(result.body.choices[0].message.content).toBe('Привет');
        expect(result.body.object).toBe('chat.completion');
    });

    it('passes tools through without executing them', async () => {
        create.mockResolvedValue({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: 1,
            model: 'gemma4:e4b',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_balance', arguments: '{}' } }],
                },
                finish_reason: 'tool_calls',
            }],
        });

        const tools = [{ type: 'function', function: { name: 'get_balance', parameters: { type: 'object' } } }];
        const result = await service.complete({
            messages: [{ role: 'user', content: 'баланс?' }],
            tools,
            stream: false,
        });

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ tools }), expect.anything());
        if (result.stream !== false) throw new Error('expected non-stream');
        expect(result.body.choices[0].finish_reason).toBe('tool_calls');
        expect((result.body.choices[0].message.tool_calls?.[0] as { function: { name: string } }).function.name)
            .toBe('get_balance');
    });

    it('strips think tokens from a streamed completion', async () => {
        async function* chunks() {
            yield { choices: [{ delta: { content: '<think>abc' } }] };
            yield { choices: [{ delta: { content: '</think>Hi' } }] };
            yield { choices: [{ delta: { content: '!' }, finish_reason: 'stop' }] };
        }

        const out: any[] = [];
        for await (const chunk of service.sanitizeStream(chunks(), 'gemma4:e4b')) {
            out.push(chunk);
        }

        expect(out.map((c) => c.choices[0].delta.content).filter(Boolean)).toEqual(['Hi', '!']);
    });

    it('maps Ollama failures to 502', async () => {
        create.mockRejectedValue(new Error('connect ECONNREFUSED'));
        await expect(service.complete({
            messages: [{ role: 'user', content: 'hi' }],
        })).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY });
    });
});
