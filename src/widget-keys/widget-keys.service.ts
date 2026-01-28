import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WidgetKey } from './widget-keys.model';
import { CreateWidgetKeyDto } from './dto/create-widget-key.dto';
import { UpdateWidgetKeyDto } from './dto/update-widget-key.dto';
import { nanoid } from 'nanoid';
import { AssistantsService } from '../assistants/assistants.service';

@Injectable()
export class WidgetKeysService {
    private readonly logger = new Logger(WidgetKeysService.name);

    constructor(
        @InjectModel(WidgetKey)
        private widgetKeyModel: typeof WidgetKey,
        private assistantsService: AssistantsService,
    ) { }

    async create(userId: number, createWidgetKeyDto: CreateWidgetKeyDto): Promise<WidgetKey> {
        // Verify that assistant exists and belongs to user
        const assistant = await this.assistantsService.getAssistantById(createWidgetKeyDto.assistantId);

        if (!assistant) {
            throw new NotFoundException('Assistant not found');
        }

        if (assistant.userId !== userId) {
            throw new ForbiddenException('You can only create widget keys for your own assistants');
        }

        // Generate unique public key
        const publicKey = `wk_${nanoid(21)}`;

        // Convert allowedDomains array to JSON string
        const allowedDomainsJson = JSON.stringify(createWidgetKeyDto.allowedDomains);

        const widgetKey = await this.widgetKeyModel.create({
            publicKey,
            name: createWidgetKeyDto.name,
            userId,
            assistantId: createWidgetKeyDto.assistantId,
            allowedDomains: allowedDomainsJson,
            maxConcurrentSessions: createWidgetKeyDto.maxConcurrentSessions || 10,
            isActive: true,
        });

        this.logger.log(`Created widget key ${publicKey} for user ${userId}`);
        return widgetKey;
    }

    async findAll(userId: number): Promise<WidgetKey[]> {
        return this.widgetKeyModel.findAll({
            where: { userId },
            include: [
                {
                    association: 'assistant',
                    attributes: ['id', 'name', 'uniqueId'],
                },
            ],
            order: [['createdAt', 'DESC']],
        });
    }

    async findOne(id: number, userId: number): Promise<WidgetKey> {
        const widgetKey = await this.widgetKeyModel.findOne({
            where: { id, userId },
            include: [
                {
                    association: 'assistant',
                    attributes: ['id', 'name', 'uniqueId', 'greeting', 'voice'],
                },
            ],
        });

        if (!widgetKey) {
            throw new NotFoundException('Widget key not found');
        }

        return widgetKey;
    }

    async findByPublicKey(publicKey: string): Promise<WidgetKey | null> {
        return this.widgetKeyModel.findOne({
            where: { publicKey },
            include: [
                {
                    association: 'assistant',
                },
                {
                    association: 'user',
                    attributes: ['id', 'balance', 'currency'],
                },
            ],
        });
    }

    async update(id: number, userId: number, updateWidgetKeyDto: UpdateWidgetKeyDto): Promise<WidgetKey> {
        const widgetKey = await this.findOne(id, userId);

        const updateData: any = { ...updateWidgetKeyDto };
        if (updateData.allowedDomains) {
            updateData.allowedDomains = JSON.stringify(updateData.allowedDomains);
        }

        await widgetKey.update(updateData);

        this.logger.log(`Updated widget key ${widgetKey.publicKey}`);
        return widgetKey;
    }

    async remove(id: number, userId: number): Promise<void> {
        const widgetKey = await this.findOne(id, userId);
        await widgetKey.destroy();
        this.logger.log(`Deleted widget key ${widgetKey.publicKey}`);
    }

    async validateDomain(widgetKey: WidgetKey, domain: string): Promise<boolean> {
        if (!widgetKey.isActive) {
            return false;
        }

        try {
            const allowedDomains = JSON.parse(widgetKey.allowedDomains) as string[];

            // Check if domain matches any allowed domain (exact match or subdomain)
            return allowedDomains.some(allowed => {
                const domainWithoutProtocol = domain.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
                return domainWithoutProtocol === allowed || domainWithoutProtocol.endsWith(`.${allowed}`);
            });
        } catch (error) {
            this.logger.error(`Failed to parse allowedDomains for key ${widgetKey.publicKey}: ${error.message}`);
            return false;
        }
    }
}
