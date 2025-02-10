import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {EndpointGroups} from "./endpoint-groups.model";
import {EndpointGroupsDto} from "./dto/endpoint-groups.dto";
import {GetEndpointGroupsDto} from "./dto/getEndpointGroups.dto";
import sequelize from "sequelize";


@Injectable()
export class EndpointGroupsService {

    constructor(@InjectModel(EndpointGroups) private endpointGroupsRepository: typeof EndpointGroups) {}

    async getAll() {
        try {
            const endpointsGroup = await this.endpointGroupsRepository.findAll()
            if (endpointsGroup) {
                return endpointsGroup
            }

        } catch (e) {
            throw new HttpException({message: '[endpointsGroup]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getPage(query: GetEndpointGroupsDto) {
        try {
            const page = Number(query.page)
            const limit = Number(query.limit)
            const vpbx_user_id = query.vpbx_user_id
            const sort = query.sort
            const order = query.order
            const search = query.search
            const offset = (page - 1) * limit

            if(!vpbx_user_id) {
                throw new HttpException({message: '[EndpointGroups]:  vpbx_user_id must be set'}, HttpStatus.BAD_REQUEST)
            }
            const endpointsGroup = await this.endpointGroupsRepository.findAndCountAll({
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
            if (endpointsGroup) {
                return endpointsGroup
            }

        } catch (e) {
            throw new HttpException({message: '[endpointsGroup]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: string) {
        const endpoint = await this.endpointGroupsRepository.findOne({where: {id}})
        if(!endpoint) {
            throw new HttpException('Endpoint not found', HttpStatus.NOT_FOUND)
        } else {
            return endpoint
        }
    }

    async create(endpointsGroup: EndpointGroupsDto[]) {
        try {
            const endpointGroups = []
            for (const point of endpointsGroup) {
                const group = await this.endpointGroupsRepository.create(point)
                endpointGroups.push(group)
            }
            return endpointGroups
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException({ message: 'Endpoints group already exist' }, HttpStatus.BAD_REQUEST)
            }
            throw new HttpException({message: '[endpointsGroup]:  Create failed' }, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<EndpointGroupsDto>) {
        try {
            const group = await this.endpointGroupsRepository.findByPk(updates.id)
            if(!group) {
                throw new HttpException('Endpoint group not found', HttpStatus.BAD_REQUEST)
            }
            await group.update(updates)
            return group
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Endpoint group already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[EndpointsGroup]: Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(id: string) {
        try {
            await this.endpointGroupsRepository.destroy({where: {id}})
            return {message: '[Endpoints]: Endpoints group deleted successfully', statusCode: HttpStatus.OK}
        } catch (e) {
            throw new HttpException('[EndpointsGroup: Endpoints group delete error!'+e, HttpStatus.BAD_REQUEST)
        }
    }

    async deleteAll() {
        try {
            await this.endpointGroupsRepository.destroy({truncate: true})
            return {message: 'Endpoints group deleted successfully', statusCode: HttpStatus.OK}
        } catch (e) {
            throw new HttpException({message: '[EndpointsGroup]: Request error', error: e, statusCode: HttpStatus.BAD_REQUEST }, HttpStatus.BAD_REQUEST)
        }
    }


}
