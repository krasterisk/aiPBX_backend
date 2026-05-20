import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { LegalAcceptance, LegalAcceptanceSource, LegalDocumentKind } from './legal-acceptance.model';
import { LegalAcceptanceItemDto } from './dto/legal-acceptance.dto';

export interface RecordAcceptanceContext {
    ip?: string | null;
    userAgent?: string | null;
    source?: LegalAcceptanceSource;
}

const KNOWN_KINDS: ReadonlySet<LegalDocumentKind> = new Set([
    'public_offer',
    'personal_data_policy',
]);

@Injectable()
export class LegalAcceptanceService {
    private readonly logger = new Logger(LegalAcceptanceService.name);

    constructor(
        @InjectModel(LegalAcceptance)
        private readonly acceptanceRepo: typeof LegalAcceptance,
    ) {}

    /**
     * Идемпотентно сохраняет согласия для пользователя.
     * Дубликат (userId, documentKind, documentVersion) перезаписывает только
     * ip/userAgent/source/updatedAt; первичная acceptedAt не меняется (Sequelize
     * timestamps controlled: acceptedAt = createdAt, updatedAt = upsert update).
     */
    async recordBatch(
        userId: string | number,
        items: LegalAcceptanceItemDto[],
        ctx: RecordAcceptanceContext = {},
    ): Promise<void> {
        if (!userId || !items?.length) return;
        const safeUserId = String(userId);
        const source: LegalAcceptanceSource = ctx.source || 'login';

        for (const item of items) {
            if (!KNOWN_KINDS.has(item.kind)) {
                this.logger.warn(`Unknown legal document kind: ${item.kind}`);
                continue;
            }
            try {
                const [row, created] = await this.acceptanceRepo.findOrCreate({
                    where: {
                        userId: safeUserId,
                        documentKind: item.kind,
                        documentVersion: item.version,
                    },
                    defaults: {
                        userId: safeUserId,
                        documentKind: item.kind,
                        documentVersion: item.version,
                        contentHash: item.contentHash,
                        ip: ctx.ip ?? null,
                        userAgent: ctx.userAgent ?? null,
                        source,
                    } as Partial<LegalAcceptance> as LegalAcceptance,
                });
                if (!created) {
                    await row.update({
                        contentHash: item.contentHash,
                        ip: ctx.ip ?? row.ip,
                        userAgent: ctx.userAgent ?? row.userAgent,
                        source,
                    });
                }
            } catch (e) {
                this.logger.error(
                    `Failed to record legal acceptance for user=${safeUserId} kind=${item.kind} version=${item.version}: ${(e as Error)?.message}`,
                );
            }
        }
    }

    async listForUser(userId: string | number): Promise<LegalAcceptance[]> {
        return this.acceptanceRepo.findAll({
            where: { userId: String(userId) },
            order: [['acceptedAt', 'DESC']],
        });
    }
}
