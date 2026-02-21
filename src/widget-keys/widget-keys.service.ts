import { PbxServersService } from '../pbx-servers/pbx-servers.service';
import { FilesService } from '../files/files.service';
import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WidgetKey } from './widget-keys.model';
import { CreateWidgetKeyDto } from './dto/create-widget-key.dto';
import { UpdateWidgetKeyDto } from './dto/update-widget-key.dto';
import { nanoid } from 'nanoid';
import { AssistantsService } from '../assistants/assistants.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WidgetKeysService {
    private readonly logger = new Logger(WidgetKeysService.name);

    constructor(
        @InjectModel(WidgetKey)
        private widgetKeyModel: typeof WidgetKey,
        private assistantsService: AssistantsService,
        private pbxServersService: PbxServersService,
        private filesService: FilesService,
        private jwtService: JwtService,
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

        if (createWidgetKeyDto.pbxServerId) {
            const pbxServer = await this.pbxServersService.getById(createWidgetKeyDto.pbxServerId);
            if (!pbxServer) {
                throw new NotFoundException('PbxServer not found');
            }
            if (!pbxServer.wss_url) {
                throw new BadRequestException(`PbxServer ${pbxServer.name} does not have a WSS URL configured. Please configure it or choose another server.`);
            }
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
            pbxServerId: createWidgetKeyDto.pbxServerId,
            allowedDomains: allowedDomainsJson,
            maxConcurrentSessions: createWidgetKeyDto.maxConcurrentSessions || 10,
            maxSessionDuration: createWidgetKeyDto.maxSessionDuration || 600,
            language: createWidgetKeyDto.language || 'en',
            logo: createWidgetKeyDto.logo,
            appearance: createWidgetKeyDto.appearance,
            isActive: true,
            apiUrl: createWidgetKeyDto.apiUrl,
            token: createWidgetKeyDto.apiUrl
                ? this.generateWidgetToken(publicKey, createWidgetKeyDto.apiUrl)
                : undefined,
        });

        this.logger.log(`Created widget key ${publicKey} for user ${userId}`);
        return widgetKey;
    }

    private generateWidgetToken(publicKey: string, apiUrl: string): string {
        return this.jwtService.sign(
            { sub: publicKey, aud: apiUrl },
            { expiresIn: '36500d' },
        );
    }

    async findAll(userId?: number): Promise<WidgetKey[]> {
        const where: any = {};
        if (userId) {
            where.userId = userId;
        }
        return this.widgetKeyModel.findAll({
            where,
            include: [
                {
                    association: 'assistant',
                    attributes: ['id', 'name', 'uniqueId'],
                },
                {
                    association: 'pbxServer',
                    attributes: ['id', 'name', 'location'],
                },
                {
                    association: 'user',
                    attributes: { exclude: ['password', 'resetPasswordLink', 'activationCode', 'activationExpires', 'googleId', 'telegramId'] },
                }
            ],
            order: [['createdAt', 'DESC']],
        });
    }

    async findOne(id: number, userId: number, isAdmin?: boolean): Promise<WidgetKey> {
        const where: any = { id };
        if (!isAdmin) {
            where.userId = userId;
        }

        const widgetKey = await this.widgetKeyModel.findOne({
            where,
            include: [
                {
                    association: 'assistant',
                    attributes: ['id', 'name', 'uniqueId', 'greeting', 'voice'],
                },
                {
                    association: 'pbxServer',
                }
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
                    include: [{ all: true }],
                },
                {
                    association: 'user',
                    attributes: ['id', 'balance', 'currency'],
                },
                {
                    association: 'pbxServer',
                    attributes: ['id', 'sip_host', 'wss_url'],
                }
            ],
        });
    }

    async update(id: number, userId: number, updateWidgetKeyDto: UpdateWidgetKeyDto, isAdmin?: boolean): Promise<WidgetKey> {
        const widgetKey = await this.findOne(id, userId, isAdmin);

        const updateData: any = { ...updateWidgetKeyDto };
        if (updateData.allowedDomains) {
            updateData.allowedDomains = JSON.stringify(updateData.allowedDomains);
        }

        if (updateData.assistantId) {
            const assistant = await this.assistantsService.getAssistantById(updateData.assistantId);
            if (!assistant) {
                throw new NotFoundException('Assistant not found');
            }
            if (assistant.userId !== userId) {
                throw new ForbiddenException('You can only use your own assistants');
            }
        }

        if (updateData.pbxServerId) {
            const pbxServer = await this.pbxServersService.getById(updateData.pbxServerId);
            if (!pbxServer) {
                throw new NotFoundException('PbxServer not found');
            }
            if (!pbxServer.wss_url) {
                throw new BadRequestException(`PbxServer ${pbxServer.name} does not have a WSS URL configured.`);
            }
        }

        await widgetKey.update(updateData);

        // Regenerate token if apiUrl changed
        if (updateData.apiUrl && updateData.apiUrl !== widgetKey.apiUrl) {
            const token = this.generateWidgetToken(widgetKey.publicKey, updateData.apiUrl);
            await widgetKey.update({ apiUrl: updateData.apiUrl, token });
        }

        this.logger.log(`Updated widget key ${widgetKey.publicKey}`);
        return widgetKey;
    }

    async remove(id: number, userId: number, isAdmin?: boolean): Promise<void> {
        const widgetKey = await this.findOne(id, userId, isAdmin);
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

    async uploadLogo(image: any): Promise<string> {
        return this.filesService.createFile(image);
    }
}
