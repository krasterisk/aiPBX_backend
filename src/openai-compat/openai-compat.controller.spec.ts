import { EventEmitter } from 'node:events';
import { OpenAiCompatController } from './openai-compat.controller';

describe('chat request cancellation', () => {
    function setup() {
        let finish: (value: unknown) => void;
        const complete = jest.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const controller = new OpenAiCompatController({ complete } as never);
        const request = new EventEmitter();
        const response = Object.assign(new EventEmitter(), { json: jest.fn(value => value) });
        const pending = controller.completions({ messages: [{ role: 'user', content: 'Synthetic' }] }, request, response as never);
        return { complete, request, response, pending, finish: () => finish({ stream: false, body: { choices: [{ message: { content: '{}' } }] } }) };
    }
    it('propagates disconnect cancellation to the upstream operation', async () => {
        const run = setup();
        try {
            const signal = run.complete.mock.calls[0][1];
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal.aborted).toBe(false);
            run.response.emit('close');
            expect(signal.aborted).toBe(true);
        } finally { run.finish(); await run.pending; }
    });
    it('does not cancel merely because Express has consumed the request body', async () => {
        const run = setup();
        try {
            run.request.emit('close');
            expect(run.complete.mock.calls[0][1].aborted).toBe(false);
        } finally { run.finish(); await run.pending; }
        expect(run.response.json).toHaveBeenCalledTimes(1);
    });
});
