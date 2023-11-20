import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {EndpointGroups} from "./endpoint-groups.model";
import {EndpointGroupsDto} from "./dto/endpoint-groups.dto";


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
            throw new HttpException('[EndpointsGroup: Endpoints group delete error!', HttpStatus.BAD_REQUEST)
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
