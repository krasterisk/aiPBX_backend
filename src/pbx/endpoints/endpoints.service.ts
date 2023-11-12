import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Endpoint} from "./endpoints.model";
import {EndpointsDto} from "./dto/endpoints.dto";
import {Sequelize} from "sequelize-typescript";

@Injectable()
export class EndpointsService {

    constructor(@InjectModel(Endpoint) private endpointRepository: typeof Endpoint,
                private directRepository: Sequelize) {
    }

    async getAll() {
        try {
            const endpoints = await this.endpointRepository.findAll()
            if (endpoints) {
                return endpoints
            }

        } catch (e) {
            throw new HttpException({message: '[Endpoints]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: string) {
        const endpoint = await this.endpointRepository.findOne({where: {id}})
        if(!endpoint) {
            throw new HttpException('Endpoint not found', HttpStatus.NOT_FOUND)
        } else {
            return endpoint
        }
    }

    async create(dtos: EndpointsDto[]) {
        try {
            const endpoints = []
            for (const endpoint of dtos) {
                    const point = await this.endpointRepository.create(endpoint)
                    if (point) {
                        await this.directRepository.query(`INSERT INTO ps_endpoints (id,transport,aors,auth,context,disallow,allow) VALUES ('${endpoint.endpoint_id}', 'transport-udp', '${endpoint.endpoint_id}', '${endpoint.endpoint_id}', 'sip-out0', 'all', 'alaw')`)
                        await this.directRepository.query(`INSERT INTO ps_aors (id,max_contacts) VALUES ('${endpoint.endpoint_id}', '2')`)
                        await this.directRepository.query(`INSERT INTO ps_auths (id,auth_type,username,password) VALUES ('${endpoint.endpoint_id}', 'userpass', '${endpoint.username}', '${endpoint.password}')`)
                    }
                    endpoints.push(endpoint)
                }
            console.log(endpoints)
            return endpoints
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException({ message: 'Endpoint already exist' }, HttpStatus.BAD_REQUEST)
            }
            throw new HttpException({message: '[Endpoints]:  Create failed' }, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<EndpointsDto>) {
        try {
            const endpoint = await this.endpointRepository.findOne({
                where: {
                    endpoint_id: updates.endpoint_id,
                    vpbx_user_id: updates.vpbx_user_id
                }
            })

            if (!endpoint) {
                throw new HttpException('Endpoint not found', HttpStatus.NOT_FOUND)
            }
            await this.directRepository.query(`UPDATE ps_endpoints  SET id='${updates.endpoint_id}',transport='${updates.transport}',aors='${updates.endpoint_id}',auth='${updates.endpoint_id}',context='${updates.context}',disallow='all',allow='${updates.allow}' WHERE id='${endpoint.endpoint_id}'`)
            await this.directRepository.query(`UPDATE ps_aors SET id='${updates.endpoint_id}', max_contacts='${updates.max_contacts}' WHERE id='${endpoint.endpoint_id}'`)
            await this.directRepository.query(`UPDATE ps_auths SET id='${updates.endpoint_id}',auth_type='${updates.auth_type}',username='${updates.username}',password='${updates.password}' WHERE id='${endpoint.endpoint_id}'`)
            await endpoint.update(updates, {where: {vpbx_user_id: endpoint.vpbx_user_id}})
            return endpoint
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Endpoint already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Endpoint]: Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(endpoint_id: string) {
        const deleted = await this.endpointRepository.destroy({where: {endpoint_id: endpoint_id}})
        if (deleted === 0) {
            throw new HttpException('Endpoint not found', HttpStatus.NOT_FOUND)
        } else {
            await this.directRepository.query(`DELETE FROM ps_endpoints WHERE id='${endpoint_id}'`)
            await this.directRepository.query(`DELETE FROM ps_aors WHERE id='${endpoint_id}'`)
            await this.directRepository.query(`DELETE FROM ps_auths WHERE id='${endpoint_id}'`)
            return {message: 'Endpoint deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async deleteAll() {
        try {
            const deleted = await this.endpointRepository.destroy({truncate: true})
            await this.directRepository.query(`DELETE FROM ps_endpoints`)
            await this.directRepository.query(`DELETE FROM ps_aors`)
            await this.directRepository.query(`DELETE FROM ps_auths`)
            return {message: 'Endpoints deleted successfully', statusCode: HttpStatus.OK}
        } catch (e) {
            throw new HttpException({message: '[Endpoint]: Request error', error: e, statusCode: HttpStatus.BAD_REQUEST }, HttpStatus.BAD_REQUEST)
        }
    }
}
