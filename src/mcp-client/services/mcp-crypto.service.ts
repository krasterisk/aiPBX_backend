import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * AES-256-GCM encryption for MCP server credentials.
 * Uses ENCRYPTION_KEY env variable or falls back to a derived key from JWT_SECRET.
 */
@Injectable()
export class McpCryptoService {
    private readonly logger = new Logger(McpCryptoService.name);
    private readonly algorithm = 'aes-256-gcm';
    private readonly keyLength = 32; // 256 bits
    private readonly ivLength = 16;
    private readonly tagLength = 16;
    private readonly key: Buffer;

    constructor(private readonly configService: ConfigService) {
        const envKey = this.configService.get<string>('ENCRYPTION_KEY');
        if (envKey) {
            // Use raw 32-byte hex key from env
            this.key = Buffer.from(envKey, 'hex');
            if (this.key.length !== this.keyLength) {
                throw new Error(
                    `ENCRYPTION_KEY must be ${this.keyLength * 2} hex characters (${this.keyLength} bytes). Got ${envKey.length} characters.`,
                );
            }
        } else {
            // Derive from JWT secret as fallback
            const jwtSecret = this.configService.get<string>('JWT_SECRET') || 'default-fallback-key';
            this.key = crypto.scryptSync(jwtSecret, 'mcp-credentials-salt', this.keyLength);
            this.logger.warn('Using JWT_SECRET-derived key for MCP credential encryption. Set ENCRYPTION_KEY for better security.');
        }
    }

    /**
     * Encrypt a JSON-serializable value.
     * Returns base64-encoded string: iv + authTag + ciphertext
     */
    encrypt(plainData: any): string | null {
        if (plainData === null || plainData === undefined) return null;

        const plaintext = typeof plainData === 'string' ? plainData : JSON.stringify(plainData);
        const iv = crypto.randomBytes(this.ivLength);

        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv, {
            authTagLength: this.tagLength,
        });

        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Format: iv (16 bytes) + authTag (16 bytes) + ciphertext
        const combined = Buffer.concat([iv, authTag, encrypted]);
        return combined.toString('base64');
    }

    /**
     * Decrypt a base64-encoded encrypted string back to original value.
     */
    decrypt(encryptedBase64: string): any | null {
        if (!encryptedBase64) return null;

        try {
            const combined = Buffer.from(encryptedBase64, 'base64');

            const iv = combined.subarray(0, this.ivLength);
            const authTag = combined.subarray(this.ivLength, this.ivLength + this.tagLength);
            const ciphertext = combined.subarray(this.ivLength + this.tagLength);

            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv, {
                authTagLength: this.tagLength,
            });
            decipher.setAuthTag(authTag);

            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            const plaintext = decrypted.toString('utf8');

            // Try to parse as JSON, return string if not JSON
            try {
                return JSON.parse(plaintext);
            } catch {
                return plaintext;
            }
        } catch (error) {
            this.logger.error('Decryption failed:', error.message);
            // Return raw value if decryption fails (backwards compat with unencrypted data)
            try {
                return JSON.parse(encryptedBase64);
            } catch {
                return encryptedBase64;
            }
        }
    }
}
