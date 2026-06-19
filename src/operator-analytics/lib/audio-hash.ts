import * as crypto from 'crypto';

/** SHA-256 hex digest of an audio buffer (used for upload deduplication). */
export function computeAudioSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}
