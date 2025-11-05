import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import sequelize from "sequelize";
import {PbxServers} from "./pbx-servers.model";
import {PbxDto} from "./dto/pbx.dto";
import {GetPbxDto} from "./dto/getPbx.dto";
import {SipAccountDto} from "./dto/sip-account.dto";
import {firstValueFrom} from "rxjs";
import {SipAccounts} from "./sip-accounts.model";
import {HttpService} from "@nestjs/axios";
import * as crypto from 'crypto';

@Injectable()
export class PbxServersService {
    private readonly logger = new Logger(PbxServersService.name);

    constructor(
        @InjectModel(PbxServers) private pbxServersRepository: typeof PbxServers,
        @InjectModel(SipAccounts) private SipAccountsRepository: typeof SipAccounts,
        private readonly httpService: HttpService
    ) {}

    async create(dto: PbxDto) {
        try {
                const pbx = await this.pbxServersRepository.create(dto)

            return pbx
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                this.logger.error("Pbx server already exists")
                throw new HttpException('Pbx server already exists', HttpStatus.BAD_REQUEST)
            }
            this.logger.error("Pbx server create error", e)
            throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<PbxServers>) {
        try {
            const pbx = await this.pbxServersRepository.findByPk(updates.id)
            if (!pbx) {
                this.logger.error('Update error: pbx not found')
                throw new HttpException('Pbx not found', HttpStatus.NOT_FOUND)
            }
            await pbx.update(updates)

            return pbx
        } catch (e) {
            this.logger.error('Update pbx error', e)
            throw new HttpException('Update pbx error', HttpStatus.BAD_REQUEST)

        }
    }

    async delete(id: string) {
        try {
            await this.pbxServersRepository.destroy({where: {id: id}})
            return {message: 'Pbx server deleted successfully', statusCode: HttpStatus.OK}
        } catch (e) {
            this.logger.error('Delete pbx error', e)
            throw new HttpException('Pbx server delete error', HttpStatus.NOT_FOUND)
        }
    }

    async get(query: GetPbxDto) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const offset = (page - 1) * limit;
            const search = query.search;

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


            const pbxServers = await this.pbxServersRepository.findAndCountAll({
                offset,
                limit,
                distinct: true,
                where: whereClause
            });
            return pbxServers;
        } catch (e) {
            this.logger.error("Get pbx servers error: ", e.name, e.message)
            throw new HttpException('Get pbx servers error', HttpStatus.BAD_REQUEST);
        }
    }

    async getAll() {
        try {
            const pbxServers = await this.pbxServersRepository.findAll()
            if (pbxServers) {
                return pbxServers
            }
        } catch (e) {
            this.logger.error("Get pbx servers error: ", e.name, e.message)
            new HttpException({message: 'Get pbx servers error'}, HttpStatus.BAD_REQUEST)
        }
    }

    async getForAll() {
        try {
            const pbxServers = await this.pbxServersRepository.findAll({
                include: [
                    {
                        attributes: {
                            exclude: [
                                "password",
                                "ari_url",
                                "ari_user",
                                "password"
                            ]
                        }
                    }
                ]
            })
            if (pbxServers) {
                return pbxServers
            }
        } catch (e) {
            this.logger.error("Get pbx servers error: ", e.name, e.message)
            new HttpException({message: 'Get pbx servers error'}, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const pbx = await this.pbxServersRepository.findOne({
            where: {id},
        })
        if(!pbx) {
            this.logger.error("Pbx server not found")
            throw new HttpException('Pbx server not found', HttpStatus.NOT_FOUND)
        } else {
            return pbx
        }
    }

    async createSipAccount(dto: SipAccountDto, userId: string) {
        try {

            const { id: pbxId, extension } = dto;

            if(!pbxId) {
                this.logger.error("Pbx server is empty")
                throw new HttpException('Pbx server not found', HttpStatus.NOT_FOUND)
            }
            if(!extension) {
                this.logger.error("Extension is empty")
                throw new HttpException('Extension is empty', HttpStatus.NOT_FOUND)
            }

            // if(!userId) {
            //     this.logger.error("UserId is empty")
            //     throw new HttpException('Account creation error', HttpStatus.NOT_FOUND)
            // }

            const pbx = await this.pbxServersRepository.findOne({
                where: {id: pbxId},
            })

            if(!pbx) {
                this.logger.error("Pbx server not found")
                throw new HttpException('Pbx server not found', HttpStatus.NOT_FOUND)
            }

            const apiUrl = `https://${pbx.sip_host}/api/?action=createTrunk`;

            const token = crypto
                .createHash('sha256')
                .update(`${pbx.name}:${extension}:${pbx.id}`)
                .digest('hex');

            const headers = {
                'Content-Type': 'application/json;charset=utf-8',
                Authorization: `Bearer ${token}`
            };

            const body = { ...dto, userId };

            const response = await firstValueFrom(
                this.httpService.post(apiUrl, body, { headers })
            );

            return response.data

        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                this.logger.error("SIP account already exists")
                throw new HttpException('SIP account already exists', HttpStatus.BAD_REQUEST)
            }
            this.logger.error("SIP account create error", e.response.data)
            throw new HttpException(e.response.data || e.message, Number(e.response.data.statusCode) || HttpStatus.BAD_REQUEST)
        }
    }


}
