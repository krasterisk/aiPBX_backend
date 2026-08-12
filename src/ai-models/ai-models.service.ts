import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DataType } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { aiModel } from "./ai-models.model";
import { AiModelDto } from "./dto/ai-model.dto";
import { inferVendorFromModelName } from '../open-ai/realtime-vendor.resolve';

export interface OllamaModel {
    name: string;
    model: string;
    size: number;
    digest: string;
    family: string;
    parameterSize: string;
    quantizationLevel: string;
    modifiedAt: string;
}

@Injectable()
export class AiModelsService implements OnModuleInit {
    private readonly logger = new Logger(AiModelsService.name);

    constructor(
        @InjectModel(aiModel) private aiModelsRepository: typeof aiModel,
        private readonly httpService: HttpService,
    ) { }

    async onModuleInit() {
        try {
            await this.ensureSchema();
            await this.backfillRealtimeVendors();
        } catch (e) {
            this.logger.warn(`aiModels schema ensure/backfill skipped: ${e.message}`);
        }
    }

    /** Add new columns when sequelize sync.alter is off (common in production). */
    private async ensureSchema() {
        const sequelize = this.aiModelsRepository.sequelize;
        if (!sequelize) return;

        const qi = sequelize.getQueryInterface();
        const table = this.aiModelsRepository.tableName;
        const desc = await qi.describeTable(table);

        if (!desc.realtimeVendor) {
            await qi.addColumn(table, 'realtimeVendor', {
                type: DataType.STRING,
                allowNull: true,
            });
            this.logger.log('Added aiModels.realtimeVendor column');
        }
        if (!desc.wireModelId) {
            await qi.addColumn(table, 'wireModelId', {
                type: DataType.STRING,
                allowNull: true,
            });
            this.logger.log('Added aiModels.wireModelId column');
        }
    }

    /** Fill realtimeVendor from legacy name prefixes for existing rows. */
    private async backfillRealtimeVendors() {
        const rows = await this.aiModelsRepository.findAll({
            where: {
                [Op.or]: [
                    { realtimeVendor: null },
                    { realtimeVendor: '' },
                ],
            },
        });
        for (const row of rows) {
            const vendor = inferVendorFromModelName(row.name);
            // Leave yandex wireModelId empty so legacy YANDEX_MODEL env still applies
            // until an admin sets an explicit wire id in the catalog.
            const wireModelId = row.wireModelId?.trim()
                ? row.wireModelId
                : (vendor === 'yandex' ? null : row.name);
            await row.update({
                realtimeVendor: vendor,
                wireModelId,
            });
        }
        if (rows.length) {
            this.logger.log(`Backfilled realtimeVendor for ${rows.length} aiModels row(s)`);
        }
    }

    async create(dto: AiModelDto) {
        try {
            const realtimeVendor = dto.realtimeVendor || inferVendorFromModelName(dto.name);
            const wireModelId = dto.wireModelId?.trim()
                || (realtimeVendor === 'yandex' ? null : dto.name);
            const aiModelRow = await this.aiModelsRepository.create({
                ...dto,
                realtimeVendor,
                wireModelId,
            } as any);
            return aiModelRow;
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('AiModel already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[AiModel]:  Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<aiModel> & { id: number }) {
        const aiModelRow = await this.aiModelsRepository.findByPk(updates.id)
        if (!aiModelRow) {
            throw new HttpException('AiModel not found', HttpStatus.NOT_FOUND)
        }
        const patch: Partial<aiModel> = { ...updates };
        if (patch.name && !patch.realtimeVendor && !aiModelRow.realtimeVendor) {
            patch.realtimeVendor = inferVendorFromModelName(patch.name);
        }
        if (patch.name && patch.wireModelId === undefined && !aiModelRow.wireModelId) {
            patch.wireModelId = patch.name;
        }
        await aiModelRow.update(patch)
        return aiModelRow
    }

    async delete(ids: number[]) {
        const deleted = await this.aiModelsRepository.destroy({ where: { id: ids } })
        if (deleted === 0) {
            throw new HttpException('AiModel not found', HttpStatus.NOT_FOUND)
        } else {
            return { message: 'AiModel deleted successfully', statusCode: HttpStatus.OK }
        }
    }

    async getAll(isAdmin: boolean = false) {
        try {
            const whereClause = isAdmin ? {} : { publish: true };
            const rows = await this.aiModelsRepository.findAll({ where: whereClause });
            if (rows) {
                return rows
            }
        } catch (e) {
            throw new HttpException({ message: '[AiModel]:  Request error' } + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const row = await this.aiModelsRepository.findOne({ where: { id } })
        if (!row) {
            throw new HttpException('AiModel not found', HttpStatus.NOT_FOUND)
        } else {
            return row
        }
    }

    async findByName(name: string): Promise<aiModel | null> {
        if (!name) return null;
        return this.aiModelsRepository.findOne({ where: { name } });
    }

    /**
     * Fetch the live list of models available in Ollama.
     * Calls GET {OLLAMA_URL}/api/tags and returns a normalised list.
     */
    async getOllamaModels(): Promise<OllamaModel[]> {
        const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';

        try {
            const response = await firstValueFrom(
                this.httpService.get(`${ollamaUrl}/api/tags`, { timeout: 5000 }),
            );

            const models: any[] = response.data?.models || [];

            return models.map((m) => ({
                name: m.name,
                model: m.model || m.name,
                size: m.size,
                digest: m.digest,
                family: m.details?.family || '',
                parameterSize: m.details?.parameter_size || '',
                quantizationLevel: m.details?.quantization_level || '',
                modifiedAt: m.modified_at,
            }));
        } catch (e) {
            throw new HttpException(
                `Ollama unavailable: ${e.message}`,
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }
}
