import * as crypto from 'crypto';

/**
 * At-rest encryption for operator-analytics transcripts (PII).
 *
 * Design goals (production-safe, backward compatible):
 *  - Opt-in via `OPERATOR_ENCRYPT_TRANSCRIPTS=true` (default OFF — prod behaviour unchanged until enabled).
 *  - Versioned marker `enc:v1:` so we can evolve the scheme later.
 *  - Dual-read: legacy plaintext rows (no marker) are returned as-is, so enabling
 *    the flag never breaks reads of existing data. A backfill script can migrate lazily.
 *  - AES-256-GCM (authenticated). Key from `ENCRYPTION_KEY` (64 hex chars) or derived
 *    from `JWT_SECRET` as a fallback (same convention as McpCryptoService).
 */

const MARKER = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;
let keyResolved = false;

function isEnabled(): boolean {
    return String(process.env.OPERATOR_ENCRYPT_TRANSCRIPTS || '').toLowerCase() === 'true';
}

function resolveKey(): Buffer | null {
    if (keyResolved) return cachedKey;
    keyResolved = true;

    const envKey = process.env.ENCRYPTION_KEY;
    if (envKey) {
        const buf = Buffer.from(envKey, 'hex');
        if (buf.length === KEY_LENGTH) {
            cachedKey = buf;
            return cachedKey;
        }
        // Invalid length — fall through to JWT-derived key
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
        cachedKey = crypto.scryptSync(jwtSecret, 'operator-transcript-salt', KEY_LENGTH);
        return cachedKey;
    }

    cachedKey = null;
    return cachedKey;
}

/** Encrypt a transcript for storage. Returns plaintext unchanged when disabled or empty. */
export function encryptTranscript(plain: string | null | undefined): string | null {
    if (plain == null || plain === '') return (plain ?? null) as string | null;
    if (!isEnabled()) return plain;
    if (plain.startsWith(MARKER)) return plain; // already encrypted

    const key = resolveKey();
    if (!key) return plain; // no key available → store plaintext (fail-open, never lose data)

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return MARKER + combined.toString('base64');
}

/** Decrypt a stored transcript. Legacy plaintext (no marker) is returned unchanged (dual-read). */
export function decryptTranscript(stored: string | null | undefined): string | null {
    if (stored == null || stored === '') return (stored ?? null) as string | null;
    if (!stored.startsWith(MARKER)) return stored; // legacy plaintext

    const key = resolveKey();
    if (!key) return stored;

    try {
        const combined = Buffer.from(stored.slice(MARKER.length), 'base64');
        const iv = combined.subarray(0, IV_LENGTH);
        const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString('utf8');
    } catch {
        // Wrong key / corrupted payload — return marker form rather than throwing,
        // so a single bad row never breaks list endpoints.
        return stored;
    }
}

export const __testing = { MARKER, resetKeyCache: () => { cachedKey = null; keyResolved = false; } };
