/**
 * Unit tests for OpenAiConnection vendor/wire routing.
 * Mocks `ws` so no real network is used.
 */
jest.mock('ws', () => {
    const WebSocketMock: any = jest.fn().mockImplementation(() => {
        const handlers: Record<string, Function> = {};
        return {
            readyState: 1,
            send: jest.fn(),
            close: jest.fn(),
            removeAllListeners: jest.fn(),
            on: jest.fn((event: string, cb: Function) => {
                handlers[event] = cb;
            }),
            __handlers: handlers,
        };
    });
    WebSocketMock.CONNECTING = 0;
    WebSocketMock.OPEN = 1;
    WebSocketMock.CLOSING = 2;
    WebSocketMock.CLOSED = 3;
    return { WebSocket: WebSocketMock };
});

import { WebSocket } from 'ws';
import { OpenAiConnection } from './open-ai.connection';
import { resolveRealtimeRouting } from './realtime-vendor.resolve';

describe('OpenAiConnection routing', () => {
    const MockWs = WebSocket as unknown as jest.Mock;
    const assistant: any = {
        name: 'A',
        uniqueId: 'u1',
        model: 'yandex-catalog-name',
    };
    const ee: any = { emit: jest.fn() };

    beforeEach(() => {
        jest.useRealTimers();
        MockWs.mockClear();
        ee.emit.mockClear();
        delete process.env.YANDEX_MODEL;
        delete process.env.YANDEX_API_URL;
        delete process.env.YANDEX_API_KEY;
        delete process.env.YANDEX_FOLDER;
        process.env.YANDEX_API_URL = 'wss://yandex.example/v1/realtime';
        process.env.YANDEX_API_KEY = 'yc-key-123456';
    });

    it('uses catalog wireModelId when hasCatalogWireModelId=true (ignores YANDEX_MODEL env)', () => {
        process.env.YANDEX_MODEL = 'env-should-not-win';
        process.env.YANDEX_FOLDER = 'b1gfolder';
        const routing = resolveRealtimeRouting('yandex-catalog-name', {
            name: 'yandex-catalog-name',
            realtimeVendor: 'yandex',
            wireModelId: 'speech-realtime-deepseek-v4-flash/latest',
        });

        new OpenAiConnection('sk', 'ch-1', ee, assistant, {
            routing,
            hasCatalogWireModelId: true,
        });

        expect(MockWs).toHaveBeenCalled();
        const url = MockWs.mock.calls[0][0] as string;
        expect(url).toContain(encodeURIComponent('gpt://b1gfolder/speech-realtime-deepseek-v4-flash/latest'));
        expect(url).not.toContain('env-should-not-win');
        const headers = MockWs.mock.calls[0][1].headers;
        expect(headers.Authorization).toMatch(/^Api-Key /);
    });

    it('falls back to YANDEX_MODEL env when no catalog wire id (legacy)', () => {
        process.env.YANDEX_MODEL = 'legacy-env-model';
        process.env.YANDEX_FOLDER = 'b1gfolder';
        const routing = resolveRealtimeRouting('yandex-catalog-name');

        new OpenAiConnection('sk', 'ch-2', ee, assistant, {
            routing,
            hasCatalogWireModelId: false,
        });

        const url = MockWs.mock.calls[0][0] as string;
        expect(url).toContain(encodeURIComponent('gpt://b1gfolder/legacy-env-model'));
    });

    it('keeps full gpt:// URI from catalog without double-prefixing', () => {
        process.env.YANDEX_FOLDER = 'b1gfolder';
        const full = 'gpt://otherfolder/speech-realtime-deepseek-v4-flash/latest';
        const routing = resolveRealtimeRouting('yandex-x', {
            realtimeVendor: 'yandex',
            wireModelId: full,
        });

        new OpenAiConnection('sk', 'ch-4', ee, assistant, {
            routing,
            hasCatalogWireModelId: true,
        });

        const url = MockWs.mock.calls[0][0] as string;
        expect(url).toContain(encodeURIComponent(full));
        expect(url).not.toContain(encodeURIComponent('gpt://b1gfolder/gpt://'));
    });

    it('infers folder from legacy YANDEX_MODEL gpt:// URI when YANDEX_FOLDER unset', () => {
        process.env.YANDEX_MODEL = 'gpt://b1g589tadmp6q5ipt6v4/speech-realtime-250923';
        delete process.env.YANDEX_FOLDER;
        const routing = resolveRealtimeRouting('yandex-x', {
            realtimeVendor: 'yandex',
            wireModelId: 'speech-realtime-deepseek-v4-flash/latest',
        });

        new OpenAiConnection('sk', 'ch-5', ee, assistant, {
            routing,
            hasCatalogWireModelId: true,
        });

        const url = MockWs.mock.calls[0][0] as string;
        expect(url).toContain(
            encodeURIComponent('gpt://b1g589tadmp6q5ipt6v4/speech-realtime-deepseek-v4-flash/latest'),
        );
        const headers = MockWs.mock.calls[0][1].headers;
        expect(headers['OpenAI-Project']).toBe('b1g589tadmp6q5ipt6v4');
    });
});

describe('OpenAiConnection reconnect storm guard', () => {
    const MockWs = WebSocket as unknown as jest.Mock;
    const assistant: any = {
        name: 'A',
        uniqueId: 'u1',
        model: 'yandex-x',
    };
    const ee: any = { emit: jest.fn() };

    beforeEach(() => {
        jest.useFakeTimers();
        MockWs.mockClear();
        ee.emit.mockClear();
        process.env.YANDEX_API_URL = 'wss://yandex.example/v1/realtime';
        process.env.YANDEX_API_KEY = 'yc-key-123456';
        process.env.YANDEX_FOLDER = 'b1gfolder';
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function makeConn() {
        const routing = resolveRealtimeRouting('yandex-x', {
            realtimeVendor: 'yandex',
            wireModelId: 'speech-realtime-260528',
        });
        return new OpenAiConnection('sk', 'ch-storm', ee, assistant, {
            routing,
            hasCatalogWireModelId: true,
        });
    }

    function lastSocket(): any {
        return MockWs.mock.results[MockWs.mock.results.length - 1].value;
    }

    it('does not reconnect after fatal NOT_FOUND error message', () => {
        const conn = makeConn();
        const sock = lastSocket();
        const messageHandler = sock.__handlers.message as Function;

        messageHandler(Buffer.from(JSON.stringify({
            type: 'error',
            error: {
                message: 'Runtime error: NOT_FOUND: Instance with model gpt://x/latest not found',
                type: 'server_error',
            },
        })));

        const connectsAfterFatal = MockWs.mock.calls.length;
        sock.readyState = 3; // CLOSED
        conn.send({ type: 'input_audio_buffer.append', audio: 'xx' });
        conn.send({ type: 'input_audio_buffer.append', audio: 'yy' });
        jest.advanceTimersByTime(30_000);

        expect(MockWs.mock.calls.length).toBe(connectsAfterFatal);
        expect(ee.emit).toHaveBeenCalledWith(
            'openai.fatal.ch-storm',
            expect.objectContaining({ reason: expect.stringContaining('NOT_FOUND') }),
        );
    });

    it('debounces reconnect instead of connecting on every send()', () => {
        const conn = makeConn();
        const sock = lastSocket();
        const initial = MockWs.mock.calls.length;

        sock.readyState = 3; // CLOSED
        conn.send({ type: 'a' });
        conn.send({ type: 'b' });
        conn.send({ type: 'c' });

        // Still waiting for backoff — no immediate reconnect storm
        expect(MockWs.mock.calls.length).toBe(initial);

        jest.advanceTimersByTime(500);
        expect(MockWs.mock.calls.length).toBe(initial + 1);
    });
});
