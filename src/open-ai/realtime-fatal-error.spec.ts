import { isFatalRealtimeError } from './realtime-fatal-error';

describe('isFatalRealtimeError', () => {
    it('detects Yandex NOT_FOUND model errors', () => {
        expect(
            isFatalRealtimeError({
                message:
                    "Runtime error: NOT_FOUND: Instance with model gpt://yandex-speech-realtime-260528/latest not found",
                type: 'server_error',
                code: null,
            }),
        ).toBe(true);
    });

    it('detects Invalid model URI', () => {
        expect(
            isFatalRealtimeError({
                message: "Invalid model URI 'speech-realtime-x/latest'",
                type: 'server_error',
            }),
        ).toBe(true);
    });

    it('detects session_expired by code', () => {
        expect(isFatalRealtimeError({ code: 'session_expired' })).toBe(true);
    });

    it('ignores transient cancel errors', () => {
        expect(
            isFatalRealtimeError({ code: 'response_cancel_not_active' }),
        ).toBe(false);
    });

    it('ignores empty errors', () => {
        expect(isFatalRealtimeError(null)).toBe(false);
        expect(isFatalRealtimeError({})).toBe(false);
    });
});
