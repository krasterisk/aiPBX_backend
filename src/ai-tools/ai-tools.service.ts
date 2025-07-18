import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {AiTool} from "./ai-tool.model";
import {ToolDto} from "./dto/tool.dto";
import {GetToolsDto} from "./dto/getToolsDto";
import sequelize from "sequelize";

@Injectable()
export class AiToolsService {

    constructor(@InjectModel(AiTool) private toolsRepository: typeof AiTool) {}

    async create(dto: ToolDto[]) {
        try {
            const tools = [];
            for (const tool of dto) {
                const result = await this.toolsRepository.create(tool)
                tools.push(result)
            }
            return tools
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Tool already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Tool]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<AiTool>) {
        const tool = await this.toolsRepository.findByPk(updates.id)
        if (!tool) {
            throw new HttpException('Tool not found', HttpStatus.NOT_FOUND)
        }
        await tool.update(updates)
        return tool
    }

    async delete(ids: number) {
        const deleted = await this.toolsRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Tool not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Tool deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async get(query: GetToolsDto, isAdmin: boolean) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const offset = (page - 1) * limit;
            const search = query.search;

            const userId = !query.userId && isAdmin ? undefined : Number(query.userId);

            // Prepare the where clause
            let whereClause: any = {
                [sequelize.Op.or]: [
                    {
                        name: {
                            [sequelize.Op.like]: `%${search}%`
                        }
                    }
                ]
            };
            // Conditionally add the userId condition if userId is provided and isAdmin is false
            if (userId !== undefined) {
                whereClause.userId = userId;
            }

            const tools = await this.toolsRepository.findAndCountAll({
                offset,
                limit,
                distinct: true,
                include: [
                    {
                        all: true,
                        attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
                    }
                ],
                where: whereClause
            });
            return tools;
        } catch (e) {
            throw new HttpException({ message: "[Tools]: Request error" } + e, HttpStatus.BAD_REQUEST);
        }
    }

    async getAll(realUserId: string, isAdmin: boolean) {
        try {
            if (!realUserId && !isAdmin) {
                throw new HttpException({ message: "[Tools]:  userId must be set" }, HttpStatus.BAD_REQUEST);
            }

            const userId = isAdmin ? undefined : Number(realUserId);

            const whereClause: any = userId ? { userId } : {}

            const tool = await this.toolsRepository.findAll({
                where: whereClause,
                include: [
                    {
                        all: true,
                        attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
                    }
                ]
            })

            if (tool) {
                return tool
            }

        } catch (e) {
            throw new HttpException({message: '[Tool]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const tool = await this.toolsRepository.findOne({where: {id}})
        if(!tool) {
            throw new HttpException('Tool not found', HttpStatus.NOT_FOUND)
        } else {
            return tool
        }
    }

    async getToolByName(name: string, userId: number) {
        const tool = await this.toolsRepository.findOne({where: {name, userId}})
        if(!tool) {
            throw new HttpException('Tool not found', HttpStatus.NOT_FOUND)
        } else {
            return tool
        }
    }

}
