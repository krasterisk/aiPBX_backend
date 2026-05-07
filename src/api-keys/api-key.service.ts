import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { createHash, randomBytes } from 'crypto';
import { ApiKey } from './api-key.model';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

/** Supported token scopes */
export const API_KEY_SCOPES = {
    CHAT_MESSAGE: 'chat:message',
    MODELS_READ: 'models:read',
} as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[keyof typeof API_KEY_SCOPES];

@Injectable()
export class ApiKeyService {
    private readonly logger = new Logger(ApiKeyService.name);

    constructor(@InjectModel(ApiKey) private readonly apiKeyModel: typeof ApiKey) {}

    // ── Public API ──────────────────────────────────────────────────────

    /**
     * Generate a new API key.
     * Returns the raw token ONCE — only the hash is persisted.
     */
    async create(
        userId: number,
        dto: CreateApiKeyDto,
    ): Promise<{ apiKey: ApiKey; rawToken: string }> {
        // Generate a cryptographically secure 32-byte token
        const rawToken = `aipbx_${randomBytes(32).toString('hex')}`;
        const tokenHash = this.hash(rawToken);
        const tokenPrefix = rawToken.substring(0, 12); // "aipbx_xxxxxx"

        const apiKey = await this.apiKeyModel.create({
            userId,
            name: dto.name,
            tokenHash,
            tokenPrefix,
            scopes: dto.scopes ?? null,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        } as any);

        this.logger.log(`API key "${dto.name}" created for userId=${userId} (prefix: ${tokenPrefix})`);

        return { apiKey, rawToken };
    }

    /**
     * List all API keys for a user (never exposes tokenHash).
     */
    async getAll(userId: number): Promise<ApiKey[]> {
        return this.apiKeyModel.findAll({
            where: { userId },
            attributes: { exclude: ['tokenHash'] },
            order: [['createdAt', 'DESC']],
        });
    }

    /**
     * Revoke (delete) an API key by ID.
     * Validates ownership unless the caller is admin.
     */
    async revoke(id: number, userId: number, isAdmin = false): Promise<void> {
        const key = await this.apiKeyModel.findByPk(id);
        if (!key || (!isAdmin && key.userId !== userId)) {
            throw new HttpException('API key not found', HttpStatus.NOT_FOUND);
        }
        await key.destroy();
        this.logger.log(`API key #${id} revoked`);
    }

    // ── Guard-level validation ──────────────────────────────────────────

    /**
     * Validate a raw Bearer token against stored hashes.
     *
     * @param rawToken - The raw token from Authorization header
     * @param requiredScope - Optional scope to validate
     * @returns The matching ApiKey with its associated userId, or null if invalid
     */
    async validate(rawToken: string, requiredScope?: ApiKeyScope): Promise<ApiKey | null> {
        const tokenHash = this.hash(rawToken);

        const key = await this.apiKeyModel.findOne({
            where: { tokenHash },
        });

        if (!key) return null;

        // Check expiry
        if (key.expiresAt && key.expiresAt < new Date()) {
            this.logger.warn(`API key #${key.id} is expired`);
            return null;
        }

        // Check scope
        if (requiredScope && key.scopes !== null) {
            if (!key.scopes.includes(requiredScope)) {
                this.logger.warn(`API key #${key.id} lacks scope "${requiredScope}"`);
                return null;
            }
        }

        // Update lastUsedAt asynchronously (don't block the request)
        this.apiKeyModel
            .update({ lastUsedAt: new Date() }, { where: { id: key.id } })
            .catch((e) => this.logger.error('Failed to update lastUsedAt', e));

        return key;
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private hash(raw: string): string {
        return createHash('sha256').update(raw).digest('hex');
    }
}
