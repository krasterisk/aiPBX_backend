import { encryptTranscript, decryptTranscript, __testing } from './transcript-crypto';

describe('transcript-crypto', () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
        __testing.resetKeyCache();
        process.env.JWT_SECRET = 'test-jwt-secret';
        delete process.env.ENCRYPTION_KEY;
        delete process.env.OPERATOR_ENCRYPT_TRANSCRIPTS;
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    describe('disabled (default)', () => {
        it('stores plaintext unchanged when flag is off', () => {
            expect(encryptTranscript('hello world')).toBe('hello world');
        });

        it('reads plaintext unchanged', () => {
            expect(decryptTranscript('hello world')).toBe('hello world');
        });
    });

    describe('enabled', () => {
        beforeEach(() => {
            process.env.OPERATOR_ENCRYPT_TRANSCRIPTS = 'true';
            __testing.resetKeyCache();
        });

        it('produces a versioned marker and not the plaintext', () => {
            const enc = encryptTranscript('секретный разговор');
            expect(enc).not.toBeNull();
            expect(enc!.startsWith(__testing.MARKER)).toBe(true);
            expect(enc).not.toContain('секретный');
        });

        it('round-trips encrypt → decrypt', () => {
            const text = 'Оператор: Здравствуйте. Клиент: Привет.';
            const enc = encryptTranscript(text);
            expect(decryptTranscript(enc)).toBe(text);
        });

        it('dual-read: still returns legacy plaintext (no marker) as-is', () => {
            expect(decryptTranscript('legacy plaintext row')).toBe('legacy plaintext row');
        });

        it('does not double-encrypt an already-encrypted value', () => {
            const once = encryptTranscript('twice?');
            const twice = encryptTranscript(once);
            expect(twice).toBe(once);
        });

        it('uses ENCRYPTION_KEY when provided (64 hex chars)', () => {
            process.env.ENCRYPTION_KEY = 'a'.repeat(64);
            __testing.resetKeyCache();
            const text = 'key test';
            const enc = encryptTranscript(text);
            expect(decryptTranscript(enc)).toBe(text);
        });
    });

    describe('edge cases', () => {
        it('passes through null/empty', () => {
            expect(encryptTranscript(null)).toBeNull();
            expect(encryptTranscript('')).toBe('');
            expect(decryptTranscript(null)).toBeNull();
            expect(decryptTranscript('')).toBe('');
        });

        it('returns marker form unchanged when decryption fails (bad payload)', () => {
            process.env.OPERATOR_ENCRYPT_TRANSCRIPTS = 'true';
            __testing.resetKeyCache();
            const corrupted = `${__testing.MARKER}not-valid-base64-cipher`;
            expect(decryptTranscript(corrupted)).toBe(corrupted);
        });
    });
});
