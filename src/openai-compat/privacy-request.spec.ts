import { ValidationPipe } from '@nestjs/common';
import { ChatCompletionsRequest } from './dto/chat-completions.dto';
import { OpenAiCompatService } from './openai-compat.service';
import { OllamaNativeChat } from './ollama-native-chat';

describe('explicit completion controls through HTTP DTO and native Ollama', () => {
    const schema = {
        type: 'object', additionalProperties: false,
        properties: { reviewedIds: { type: 'array', items: { type: 'string' } } },
        required: ['reviewedIds'],
    };
    const base = { model: 'qwen3.5:9b', messages: [{ role: 'user', content: 'Synthetic data' }] };
    async function send(extra: Record<string, unknown> = {}) {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
            model: base.model, message: { role: 'assistant', content: '{"reviewedIds":[]}' }, done_reason: 'stop',
        }) });
        const native = new OllamaNativeChat({ baseUrl: 'https://example.test/ollama', numCtx: 32768, fetchImpl });
        const service = new OpenAiCompatService(native.asOpenAiClient(), async () => [base.model], base.model, 32768);
        const pipe = new ValidationPipe({ transform: true, whitelist: true });
        const dto = await pipe.transform({ ...base, ...extra }, { type: 'body', metatype: ChatCompletionsRequest });
        await service.complete(dto);
        return JSON.parse(fetchImpl.mock.calls[0][1].body);
    }
    it('preserves explicit false and JSON schema plus supported sampling through all three layers', async () => {
        const sent = await send({ think: false, response_format: { type: 'json_schema', json_schema: { name: 'pii', strict: true, schema } }, top_p: 0.8, presence_penalty: 1.5 });
        expect(sent.think).toBe(false);
        expect(sent.format).toEqual(schema);
        expect(sent.options).toMatchObject({ top_p: 0.8, presence_penalty: 1.5 });
    });
    it('supports JSON object mode and explicit true without changing the model', async () => {
        const sent = await send({ think: true, response_format: { type: 'json_object' } });
        expect(sent.think).toBe(true);
        expect(sent.format).toBe('json');
        expect(sent.model).toBe(base.model);
    });
    it('leaves old requests and tool history defaults unchanged; arbitrary native options stay filtered', async () => {
        const sent = await send({ options: { num_ctx: 99999999, unsafe: true }, arbitrary: 'ignored' });
        expect(sent).toEqual({ model: base.model, messages: base.messages, stream: false, keep_alive: -1, options: { num_ctx: 32768, num_predict: 2048 } });
    });
    it.each([
        { think: 'false' }, { top_p: 2 }, { presence_penalty: 20 },
        { response_format: 'json' }, { response_format: { type: 'text' } },
        { response_format: { type: 'json_schema' } },
        { response_format: { type: 'json_schema', json_schema: { name: 'bad', schema: [] } } },
        { response_format: { type: 'json_schema', json_schema: { name: 'bad', schema: { type: 'object', description: 'x'.repeat(33000) } } } },
    ])('rejects unsupported/malformed options before inference: %j', async (extra) => {
        await expect(send(extra)).rejects.toMatchObject({ status: 400 });
    });
});
