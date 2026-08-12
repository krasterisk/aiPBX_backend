/**
 * Realtime API errors that will not recover by reconnecting
 * (wrong model, auth, invalid request). Reconnecting only storms logs.
 */
export function isFatalRealtimeError(error: {
    code?: string | null;
    type?: string | null;
    message?: string | null;
} | null | undefined): boolean {
    if (!error) return false;

    const code = String(error.code || '').toLowerCase();
    const type = String(error.type || '').toLowerCase();
    const message = String(error.message || '');

    if (
        code === 'session_expired'
        || code === 'invalid_api_key'
        || code === 'invalid_request_error'
        || code === 'model_not_found'
    ) {
        return true;
    }

    if (type === 'invalid_request_error') {
        return true;
    }

    return /NOT_FOUND|Invalid model|model .* not found|unknown model|unauthorized|authentication|invalid api key/i
        .test(message);
}
