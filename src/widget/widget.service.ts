import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { WidgetSession } from './widget-sessions.model';
import { WidgetKeysService } from '../widget-keys/widget-keys.service';
import { nanoid } from 'nanoid';

@Injectable()
export class WidgetService {
    private readonly logger = new Logger(WidgetService.name);

    constructor(
        @InjectModel(WidgetSession)
        private widgetSessionModel: typeof WidgetSession,
        private widgetKeysService: WidgetKeysService,
    ) { }

    async createSession(
        publicKey: string,
        domain: string,
        peerId: string,
        metadata: { userAgent?: string; ipAddress?: string }
    ): Promise<WidgetSession> {
        // 1-3. Validate key, domain, and session limits using shared logic
        const widgetKey = await this.validateKey(publicKey, domain);

        // 4. Create session
        const sessionId = `sess_${nanoid(21)}`;

        const session = await this.widgetSessionModel.create({
            sessionId,
            widgetKeyId: widgetKey.id,
            peerId,
            domain,
            userAgent: metadata.userAgent || null,
            ipAddress: metadata.ipAddress || null,
            startedAt: new Date(),
            isActive: true,
        });

        this.logger.log(`Created widget session ${sessionId} for key ${publicKey} from domain ${domain}`);
        return session;
    }

    async findSessionById(sessionId: string): Promise<WidgetSession | null> {
        return this.widgetSessionModel.findOne({
            where: { sessionId },
            include: [
                {
                    association: 'widgetKey',
                    include: [
                        {
                            association: 'assistant',
                            include: [{ association: 'user' }] // Load User inside Assistant
                        },
                        { association: 'user' }, // Load User for WidgetKey (owner)
                    ],
                },
            ],
        });
    }

    async endSession(sessionId: string): Promise<void> {
        const session = await this.findSessionById(sessionId);

        if (!session) {
            throw new NotFoundException('Session not found');
        }

        await session.update({
            endedAt: new Date(),
            isActive: false,
        });

        this.logger.log(`Ended widget session ${sessionId}`);
    }

    async cleanupExpiredSessions(): Promise<void> {
        // Find active sessions that have exceeded their WidgetKey's maxSessionDuration
        const expiredSessions = await this.widgetSessionModel.findAll({
            where: {
                isActive: true,
            },
            include: [{
                association: 'widgetKey',
            }],
        });

        const now = new Date();
        let cleanupCount = 0;

        for (const session of expiredSessions) {
            const maxDuration = session.widgetKey?.maxSessionDuration || 600; // default 10 min
            const expireTime = new Date(session.startedAt.getTime() + maxDuration * 1000);

            if (now > expireTime) {
                await session.update({
                    endedAt: now,
                    isActive: false,
                });
                cleanupCount++;
            }
        }

        if (cleanupCount > 0) {
            this.logger.log(`Cleaned up ${cleanupCount} expired widget sessions from database`);
        }
    }

    async validateKey(publicKey: string, domain?: string): Promise<any> {
        const widgetKey = await this.widgetKeysService.findByPublicKey(publicKey);

        if (!widgetKey) {
            throw new NotFoundException('Widget key not found');
        }

        if (!widgetKey.isActive) {
            throw new ForbiddenException('Widget key is not active');
        }

        if (domain) {
            const isDomainValid = await this.widgetKeysService.validateDomain(widgetKey, domain);
            if (!isDomainValid) {
                this.logger.warn(`Blocked widget config/connection attempt from unauthorized domain: ${domain} for key ${publicKey}`);
                throw new ForbiddenException('Domain not allowed for this widget key');
            }
        }

        // Check concurrent session limits
        const activeSessionsCount = await this.widgetSessionModel.count({
            where: {
                widgetKeyId: widgetKey.id,
                isActive: true,
            },
        });

        if (activeSessionsCount >= widgetKey.maxConcurrentSessions) {
            throw new BadRequestException(`Maximum concurrent sessions limit reached (${widgetKey.maxConcurrentSessions})`);
        }

        return widgetKey;
    }
}
