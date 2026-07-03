import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
    const secret = process.env.HELPDESK_ENCRYPTION_KEY || process.env.JWT_SECRET || 'helpdesk-dev-key';
    return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
    const key = deriveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
        throw new Error('Invalid encrypted payload');
    }
    const key = deriveKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}
