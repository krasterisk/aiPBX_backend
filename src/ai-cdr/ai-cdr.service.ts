import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {AiCdrDto} from "./dto/ai-cdr.dto";
import sequelize from "sequelize";
import {GetAiCdrDto} from "./dto/getAiCdr.dto";
import {AiCdr} from "./ai-cdr.model";

@Injectable()
export class AiCdrService {

    constructor(@InjectModel(AiCdr) private aiCdrRepository: typeof AiCdr) {}

    async create(dto: AiCdrDto) {
        try {
            const aiCdr = await this.aiCdrRepository.create(dto)
            return aiCdr
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('AiCdr already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[AiCdr]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }


    async get(query: GetAiCdrDto, isAdmin: boolean) {
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

            const aiCdr = await this.aiCdrRepository.findAndCountAll({
                offset,
                limit,
                include: [
                    {
                        all: true,
                        attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
                    }
                ],
                where: whereClause
            });
            return aiCdr;
        } catch (e) {
            throw new HttpException({ message: "[AiCdr]: Request error" } + e, HttpStatus.BAD_REQUEST);
        }
    }


}
