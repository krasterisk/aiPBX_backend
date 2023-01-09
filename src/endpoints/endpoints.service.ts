import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Endpoint} from "./endpoints.model";
import {EndpointsDto} from "./dto/endpoints.dto";
import {Sequelize} from "sequelize-typescript";

@Injectable()
export class EndpointsService {

    constructor(@InjectModel(Endpoint) private endpointRepository: typeof Endpoint,
                private directRepository: Sequelize) {}

    async create(endpointDto: EndpointsDto) {
        try {
            const endpoint = await this.endpointRepository.create(endpointDto)
            if (endpoint) {
                await this.directRepository.query(`INSERT INTO ps_endpoints (id,transport,aors,auth,context,disallow,allow) VALUES ('${endpoint.endpoint_id}', 'transport-udp', '${endpoint.endpoint_id}', '${endpoint.endpoint_id}', 'sip-out0', 'all', 'alaw')`)
                await this.directRepository.query(`INSERT INTO ps_aors (id,max_contacts) VALUES ('${endpoint.endpoint_id}', '2')`)
                await this.directRepository.query(`INSERT INTO ps_auths (id,auth_type,username,password) VALUES ('${endpoint.endpoint_id}', 'userpass', '${endpoint.username}', '${endpoint.password}')`)
            }
            return endpoint
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Устройство с таким именем уже существует '+e, HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('Ошибка ввода данных в модуле endpoints' +e, HttpStatus.BAD_REQUEST)
        }
    }
    async update(updates: Partial<EndpointsDto>) {
        try {
            const endpoint = await this.endpointRepository.findOne({where: {endpoint_id: updates.endpoint_id, vpbx_user_id: updates.vpbx_user_id}})
            if (!endpoint) {
                throw new HttpException('Устройство не найдено', HttpStatus.NOT_FOUND)
            }
            await this.directRepository.query(`UPDATE ps_endpoints  SET id='${updates.endpoint_id}',transport='${updates.transport}',aors='${updates.endpoint_id}',auth='${updates.endpoint_id}',context='${updates.context}',disallow='all',allow='${updates.allow}' WHERE id='${endpoint.endpoint_id}'`)
            await this.directRepository.query(`UPDATE ps_aors SET id='${updates.endpoint_id}', max_contacts='${updates.max_contacts}' WHERE id='${endpoint.endpoint_id}'`)
            await this.directRepository.query(`UPDATE ps_auths SET id='${updates.endpoint_id}',auth_type='${updates.auth_type}',username='${updates.username}',password='${updates.password}' WHERE id='${endpoint.endpoint_id}'`)
            await endpoint.update(updates, {where: {vpbx_user_id: endpoint.vpbx_user_id}})
            return endpoint
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Устройство с таким именем уже существует', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('Ошибка ввода данных в модуле endpoints' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(endpoint_id: string) {
        const deleted = await this.endpointRepository.destroy({where: { endpoint_id: endpoint_id } })
        if(deleted === 0) {
            throw new HttpException('Устройство не найдено', HttpStatus.NOT_FOUND)
        } else {
            await this.directRepository.query(`DELETE FROM ps_endpoints WHERE id='${endpoint_id}'`)
            await this.directRepository.query(`DELETE FROM ps_aors WHERE id='${endpoint_id}'`)
            await this.directRepository.query(`DELETE FROM ps_auths WHERE id='${endpoint_id}'`)
            return {message: 'Пользователь удалён успешно', statusCode: HttpStatus.OK}
        }
    }

}
