import { HttpException, HttpStatus} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Provisioning} from "./provisioning.model";
import {ProvisioningDto} from "./dto/provisioning.dto";
import {GetProvisioningDto} from "./dto/getProvisioning.dto";
import sequelize from "sequelize";

export class ProvisioningService {

    constructor(@InjectModel(Provisioning) private provisioningRepository: typeof Provisioning) {
    }

    async create(dtos: ProvisioningDto[]) {
        try {
            const provisioning = []
            for (const template of dtos) {
                const result = await this.provisioningRepository.create(template)
                provisioning.push(result)
            }
            return provisioning
        } catch (e) {
            throw new HttpException('[provisioning]:  Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Provisioning>) {
        const provisioning = await this.provisioningRepository.findByPk(updates.id)
        if (!provisioning) {
            throw new HttpException('provisioning template not found', HttpStatus.NOT_FOUND)
        }
        await provisioning.update(updates)
        return provisioning
    }

    async getAll(vpbx_user_id: string) {
        try {
            if (!vpbx_user_id) {
                throw new HttpException({message: '[Provisioning]:  vpbx_user_id must be set'}, HttpStatus.BAD_REQUEST)

            }
            const provisioning = await this.provisioningRepository.findAll({where: {vpbx_user_id}})
            if (provisioning) {
                return provisioning
            }

        } catch (e) {
            throw new HttpException({message: '[provisioning]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async get(query: GetProvisioningDto) {
        try {
            const page = Number(query.page)
            const limit = Number(query.limit)
            const vpbx_user_id = query.vpbx_user_id
            const sort = query.sort
            const order = query.order
            const search = query.search
            const offset = (page - 1) * limit

            if (!vpbx_user_id) {
                throw new HttpException({message: '[Provisioning]:  vpbx_user_id must be set'}, HttpStatus.BAD_REQUEST)
            }
            const templates = await this.provisioningRepository.findAndCountAll({
                    offset,
                    limit,
                    order: [
                        [sort, order],
                    ],
                    where:
                        {
                            [sequelize.Op.and]: [
                                {
                                    [sequelize.Op.or]: [
                                        {
                                            name: {
                                                [sequelize.Op.like]: `%${search}%`
                                            }
                                        },
                                        {
                                            description: {
                                                [sequelize.Op.like]: `%${search}%`
                                            }
                                        }
                                    ]
                                },
                            ],
                            vpbx_user_id
                        },
                }
            )
            if (templates) {
                return templates
            }
        } catch (e) {
            throw new HttpException({message: '[Provisioning]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(id: string) {
        try {
            await this.provisioningRepository.destroy({where: { id } })
            return {message: 'Template deleted successfully', statusCode: HttpStatus.OK}

        } catch (e) {
            throw new HttpException('[Provisioning] Template delete error!' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getProvisioningById(id: number) {
        const provisioning = await this.provisioningRepository.findOne({where: {id}})
        if (!provisioning) {
            throw new HttpException('provisioning template not found', HttpStatus.NOT_FOUND)
        } else {
            return provisioning
        }
    }

}
