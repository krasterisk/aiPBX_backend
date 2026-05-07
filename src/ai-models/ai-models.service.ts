import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { aiModel } from "./ai-models.model";
import { AiModelDto } from "./dto/ai-model.dto";

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
export class AiModelsService {

    constructor(
        @InjectModel(aiModel) private aiModelsRepository: typeof aiModel,
        private readonly httpService: HttpService,
    ) { }

    async create(dto: AiModelDto) {
        try {
            const aiModel = await this.aiModelsRepository.create(dto)
            return aiModel
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('AiModel already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[AiModel]:  Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<aiModel>) {
        const aiModel = await this.aiModelsRepository.findByPk(updates.id)
        if (!aiModel) {
            throw new HttpException('AiModel not found', HttpStatus.NOT_FOUND)
        }
        await aiModel.update(updates)
        return aiModel
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
            const aiModel = await this.aiModelsRepository.findAll({ where: whereClause });
            if (aiModel) {
                return aiModel
            }
        } catch (e) {
            throw new HttpException({ message: '[AiModel]:  Request error' } + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const aiModel = await this.aiModelsRepository.findOne({ where: { id } })
        if (!aiModel) {
            throw new HttpException('AiModel not found', HttpStatus.NOT_FOUND)
        } else {
            return aiModel
        }
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
