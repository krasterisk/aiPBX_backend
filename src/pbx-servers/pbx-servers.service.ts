import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import sequelize from "sequelize";
import { PbxServers } from "./pbx-servers.model";
import { PbxDto } from "./dto/pbx.dto";
import { GetPbxDto } from "./dto/getPbx.dto";
import { SipAccountDto } from "./dto/sip-account.dto";
import { firstValueFrom } from "rxjs";
import { SipAccounts } from "./sip-accounts.model";
import { HttpService } from "@nestjs/axios";
import * as crypto from 'crypto';
import { Assistant } from '../assistants/assistants.model';
import { nanoid } from 'nanoid';


@Injectable()
export class PbxServersService {
    private readonly logger = new Logger(PbxServersService.name);

    constructor(
        @InjectModel(PbxServers) private pbxServersRepository: typeof PbxServers,
        @InjectModel(SipAccounts) private SipAccountsRepository: typeof SipAccounts,
        @InjectModel(Assistant) private AssistantRepository: typeof Assistant,
        private readonly httpService: HttpService
    ) { }

    async create(dto: PbxDto) {
        try {
            const uniqueId = `${nanoid(10)}`;
            const pbx = await this.pbxServersRepository.create({ ...dto as any, uniqueId })

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
            await this.pbxServersRepository.destroy({ where: { id: id } })
            return { message: 'Pbx server deleted successfully', statusCode: HttpStatus.OK }
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
            new HttpException({ message: 'Get pbx servers error' }, HttpStatus.BAD_REQUEST)
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
            new HttpException({ message: 'Get pbx servers error' }, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const pbx = await this.pbxServersRepository.findOne({
            where: { id },
        })
        if (!pbx) {
            this.logger.error("Pbx server not found")
            throw new HttpException('Pbx server not found', HttpStatus.NOT_FOUND)
        } else {
            return pbx
        }
    }

    async createSipUri(dto: SipAccountDto, userId: string) {
        try {

            const { assistantId, serverId, ipAddress } = dto;

            if (!serverId) {
                this.logger.error("Pbx server is empty")
                throw new HttpException('Pbx server not found', HttpStatus.NOT_FOUND)
            }

            if (!assistantId) {
                this.logger.error("Assistant ID is empty")
                throw new HttpException('Assistant ID is empty', HttpStatus.NOT_FOUND)
            }

            if (!ipAddress) {
                this.logger.error("IP address is empty")
                throw new HttpException('Assistant ID is empty', HttpStatus.NOT_FOUND)
            }

            // if(!userId) {
            //     this.logger.error("UserId is empty")
            //     throw new HttpException('Account creation error', HttpStatus.NOT_FOUND)
            // }

            const pbx = await this.pbxServersRepository.findOne({
                where: { id: serverId },
            })

            if (!pbx) {
                this.logger.error("Pbx server not found")
                throw new HttpException('Pbx server not found', HttpStatus.NOT_FOUND)
            }

            const assistant = await this.AssistantRepository.findOne({
                where: { id: Number(assistantId) },
            })

            if (!assistant) {
                this.logger.error("Assistant not found")
                throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
            }

            const sipUri = `${assistant.uniqueId}@${pbx.sip_host}`;

            const userVal = userId || 1

            // Upsert SipAccount record
            const [sipAccount, created] = await this.SipAccountsRepository.findOrCreate({
                where: { assistantId: assistant.id },
                defaults: {
                    sipUri,
                    ipAddress,
                    pbxId: serverId,
                    userId: Number(userVal) || assistant.userId,
                    assistantId: assistant.id
                }
            });

            if (!created) {
                await sipAccount.update({
                    sipUri,
                    ipAddress,
                    pbxId: serverId,
                    userId: Number(userVal) || assistant.userId
                });
            }

            const apiUrl = `https://${pbx.sip_host}/api/?action=createSipUri`;

            const token = crypto
                .createHash('sha256')
                .update(`${assistant.uniqueId}:${ipAddress}:${serverId}:${userVal}`)
                .digest('hex');
            const headers = {
                'Content-Type': 'application/json;charset=utf-8',
                Authorization: `Bearer ${token}`
            };

            const body = { assistantId: assistant.uniqueId, ipAddress, serverId, userId: userVal };

            const response = await firstValueFrom(
                this.httpService.post(apiUrl, body, { headers })
            );

            // return response.data
            return { success: true, sipUri }

        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                this.logger.error("SIP URI already exists")
                throw new HttpException('SIP URI already exists', HttpStatus.BAD_REQUEST)
            }
            this.logger.error("SIP URI create error", e.response.data)
            throw new HttpException(e.response.data || e.message, Number(e.response.data.statusCode) || HttpStatus.BAD_REQUEST)
        }
    }

    async deleteSipUri(dto: SipAccountDto, userId: string) {
        try {
            const { assistantId } = dto;

            if (!assistantId) {
                this.logger.error("assistantId is empty");
                throw new HttpException('Assistant ID is empty', HttpStatus.NOT_FOUND);
            }

            const sipAccount = await this.SipAccountsRepository.findOne({
                where: { assistantId: Number(assistantId) },
            });



            if (!sipAccount) {
                this.logger.error("SIP URI not found");
                throw new HttpException('SIP URI not found', HttpStatus.NOT_FOUND);
            }

            const pbx = await this.pbxServersRepository.findOne({
                where: { id: sipAccount.pbxId },
            });

            if (!pbx) {
                this.logger.error("ServerId not found");
                throw new HttpException('ServerId not found', HttpStatus.NOT_FOUND);
            }

            const assistantUniqueId = sipAccount.sipUri.split('@')[0];


            const apiUrl = `https://${pbx.sip_host}/api/?action=deleteSipUri`;

            const token = crypto
                .createHash('sha256')
                .update(`${assistantUniqueId}:${sipAccount.ipAddress}:${pbx.id}:${userId}`)
                .digest('hex');

            const headers = {
                'Content-Type': 'application/json;charset=utf-8',
                Authorization: `Bearer ${token}`
            };

            const body = { assistantId: assistantUniqueId, ipAddress: sipAccount.ipAddress, serverId: pbx.id, userId };

            const response = await firstValueFrom(
                this.httpService.post(apiUrl, body, { headers })
            );

            // Remove SipAccount record
            await this.SipAccountsRepository.destroy({
                where: { assistantId: sipAccount.assistantId }
            });

            return { success: true, message: 'SIP URI deleted successfully' };

        } catch (e) {
            this.logger.error("SIP URI delete error", e.response?.data || e.message);
            throw new HttpException(e.response?.data || e.message, Number(e.response?.data?.statusCode) || HttpStatus.BAD_REQUEST);
        }
    }
}
