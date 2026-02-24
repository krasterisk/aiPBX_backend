import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { SipTrunks } from "./sip-trunks.model";
import { PbxServers } from "../pbx-servers/pbx-servers.model";
import { Assistant } from "../assistants/assistants.model";
import { CreateSipTrunkDto } from "./dto/create-sip-trunk.dto";
import { UpdateSipTrunkDto } from "./dto/update-sip-trunk.dto";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import * as crypto from 'crypto';

@Injectable()
export class SipTrunksService {
    private readonly logger = new Logger(SipTrunksService.name);

    constructor(
        @InjectModel(SipTrunks) private sipTrunksRepository: typeof SipTrunks,
        @InjectModel(PbxServers) private pbxServersRepository: typeof PbxServers,
        @InjectModel(Assistant) private assistantRepository: typeof Assistant,
        private readonly httpService: HttpService,
    ) { }

    async findAll(userId: string) {
        return this.sipTrunksRepository.findAll({
            where: { userId: Number(userId) },
            include: [
                { model: Assistant, attributes: ['id', 'name', 'uniqueId'] },
                { model: PbxServers, attributes: ['id', 'name', 'sip_host', 'location'] },
            ],
        });
    }

    async findOne(id: number, userId: string) {
        const trunk = await this.sipTrunksRepository.findOne({
            where: { id, userId: Number(userId) },
            include: [
                { model: Assistant, attributes: ['id', 'name', 'uniqueId'] },
                { model: PbxServers, attributes: ['id', 'name', 'sip_host', 'location'] },
            ],
        });
        if (!trunk) throw new HttpException('SIP Trunk not found', HttpStatus.NOT_FOUND);
        return trunk;
    }

    async create(dto: CreateSipTrunkDto, userId: string) {
        try {
            const { assistantId, serverId, name, trunkType, sipServerAddress, transport,
                authName, password, domain, callerId, providerIp, active, records } = dto;

            if (!serverId) throw new HttpException('Server ID is required', HttpStatus.BAD_REQUEST);
            if (!assistantId) throw new HttpException('Assistant ID is required', HttpStatus.BAD_REQUEST);
            if (!sipServerAddress) throw new HttpException('SIP server address is required', HttpStatus.BAD_REQUEST);

            const pbx = await this.pbxServersRepository.findOne({ where: { id: Number(serverId) } });
            if (!pbx) throw new HttpException('PBX server not found', HttpStatus.NOT_FOUND);

            const assistant = await this.assistantRepository.findOne({ where: { id: Number(assistantId) } });
            if (!assistant) throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND);

            // Check authName uniqueness for registration trunks
            if (trunkType === 'registration' && authName) {
                const existingTrunk = await this.sipTrunksRepository.findOne({ where: { authName } });
                if (existingTrunk) {
                    throw new HttpException('A SIP trunk with this authName already exists', HttpStatus.BAD_REQUEST);
                }
            }

            const userVal = userId || '1';

            const identifier = authName ?? name ?? assistant.uniqueId ?? '';

            const trunk = await this.sipTrunksRepository.create({
                name,
                trunkType,
                sipServerAddress,
                transport,
                authName: authName || null,
                password: password || null,
                domain: domain || null,
                callerId: callerId || null,
                providerIp: providerIp || null,
                active: active !== undefined ? active : true,
                records: records || false,
                serverId: Number(serverId),
                userId: Number(userVal) || assistant.userId,
                assistantId: Number(assistantId),
            });

            // Call remote PBX server API
            const apiUrl = `https://${pbx.sip_host}/api/?action=createSipTrunk`;
            const token = this.buildToken(identifier, sipServerAddress, serverId, userVal);
            const headers = {
                'Content-Type': 'application/json;charset=utf-8',
                Authorization: `Bearer ${token}`,
            };
            const body = {
                trunkId: trunk.id,
                assistantId: assistant.id,
                assistantUniqueId: assistant.uniqueId,
                trunkType,
                sipTechnology: pbx.sipTechnology || 'pjsip',
                sipServerAddress,
                transport,
                authName: trunk.authName,
                name: trunk.name,
                password: password || null,
                domain: domain || null,
                callerId: callerId || null,
                providerIp: providerIp || null,
                records: records || false,
                active: active !== undefined ? active : true,
                serverId,
                userId: userVal,
                context: pbx.context || '',
                moh: pbx.moh || 'default',
                recordFormat: pbx.recordFormat || 'wav',
            };

            await firstValueFrom(this.httpService.post(apiUrl, body, { headers }));

            return { success: true, trunk };
        } catch (e) {
            this.handleError(e, 'create');
        }
    }

    async update(id: number, dto: UpdateSipTrunkDto, userId: string) {
        try {
            const trunk = await this.sipTrunksRepository.findOne({
                where: { id, userId: Number(userId) },
            });
            if (!trunk) throw new HttpException('SIP Trunk not found', HttpStatus.NOT_FOUND);

            // Check authName uniqueness on update (if changed, registration only)
            if (dto.authName && dto.authName !== trunk.authName) {
                const existingTrunk = await this.sipTrunksRepository.findOne({ where: { authName: dto.authName } });
                if (existingTrunk) {
                    throw new HttpException('A SIP trunk with this authName already exists', HttpStatus.BAD_REQUEST);
                }
            }

            const pbx = await this.pbxServersRepository.findOne({
                where: { id: dto.serverId ? Number(dto.serverId) : trunk.serverId },
            });
            if (!pbx) throw new HttpException('PBX server not found', HttpStatus.NOT_FOUND);

            const assistant = await this.assistantRepository.findOne({
                where: { id: dto.assistantId ? Number(dto.assistantId) : trunk.assistantId },
            });


            const identifier = dto.authName ?? dto.name ?? assistant.uniqueId ?? '';

            await trunk.update({
                ...dto,
                serverId: dto.serverId ? Number(dto.serverId) : trunk.serverId,
                assistantId: dto.assistantId ? Number(dto.assistantId) : trunk.assistantId,
            } as any);

            // Call remote PBX server API
            const apiUrl = `https://${pbx.sip_host}/api/?action=updateSipTrunk`;
            const userVal = userId || '1';
            const token = this.buildToken(identifier, trunk.sipServerAddress, trunk.serverId, userVal);
            const headers = {
                'Content-Type': 'application/json;charset=utf-8',
                Authorization: `Bearer ${token}`,
            };
            const body = {
                trunkId: trunk.id,
                assistantId: trunk.assistantId,
                assistantUniqueId: assistant?.uniqueId || '',
                trunkType: trunk.trunkType,
                sipTechnology: pbx.sipTechnology || 'pjsip',
                sipServerAddress: trunk.sipServerAddress,
                transport: trunk.transport,
                authName: trunk.authName,
                name: trunk.name,
                password: trunk.password,
                domain: trunk.domain,
                callerId: trunk.callerId,
                providerIp: trunk.providerIp,
                records: trunk.records || false,
                active: trunk.active,
                serverId: trunk.serverId,
                userId: userVal,
                context: pbx.context || '',
                moh: pbx.moh || 'default',
                recordFormat: pbx.recordFormat || 'wav',
            };

            await firstValueFrom(this.httpService.post(apiUrl, body, { headers }));

            return { success: true, trunk };
        } catch (e) {
            this.handleError(e, 'update');
        }
    }

    async remove(id: number, userId: string) {
        try {
            const trunk = await this.sipTrunksRepository.findOne({
                where: { id, userId: Number(userId) },
            });
            if (!trunk) throw new HttpException('SIP Trunk not found', HttpStatus.NOT_FOUND);

            const pbx = await this.pbxServersRepository.findOne({ where: { id: trunk.serverId } });
            if (!pbx) throw new HttpException('PBX server not found', HttpStatus.NOT_FOUND);

            const assistant = await this.assistantRepository.findOne({ where: { id: trunk.assistantId } });

            const identifier = trunk.authName || trunk.name || assistant?.uniqueId || '';

            const userVal = userId || '1';
            const apiUrl = `https://${pbx.sip_host}/api/?action=deleteSipTrunk`;
            const token = this.buildToken(identifier, trunk.sipServerAddress, trunk.serverId, userVal);
            const headers = {
                'Content-Type': 'application/json;charset=utf-8',
                Authorization: `Bearer ${token}`,
            };
            const body = {
                trunkId: trunk.id,
                assistantId: trunk.assistantId,
                assistantUniqueId: assistant?.uniqueId || '',
                trunkType: trunk.trunkType,
                authName: trunk.authName,
                name: trunk.name,
                sipTechnology: pbx.sipTechnology || 'pjsip',
                sipServerAddress: trunk.sipServerAddress,
                serverId: trunk.serverId,
                userId: userVal,
            };

            await firstValueFrom(this.httpService.post(apiUrl, body, { headers }));

            await trunk.destroy();

            return { success: true };
        } catch (e) {
            this.handleError(e, 'delete');
        }
    }

    async getStatus(id: number, userId: string) {
        try {
            const trunk = await this.sipTrunksRepository.findOne({
                where: { id, userId: Number(userId) },
            });
            if (!trunk) throw new HttpException('SIP Trunk not found', HttpStatus.NOT_FOUND);

            const pbx = await this.pbxServersRepository.findOne({ where: { id: trunk.serverId } });
            if (!pbx) throw new HttpException('PBX server not found', HttpStatus.NOT_FOUND);

            const assistant = await this.assistantRepository.findOne({ where: { id: trunk.assistantId } });

            const userVal = userId || '1';
            const apiUrl = `https://${pbx.sip_host}/api/?action=statusSipTrunk`;
            const token = this.buildToken(trunk.authName || trunk.name, trunk.sipServerAddress, trunk.serverId, userVal);
            const headers = {
                'Content-Type': 'application/json;charset=utf-8',
                Authorization: `Bearer ${token}`,
            };
            const body = {
                trunkId: trunk.id,
                trunkType: trunk.trunkType,
                sipTechnology: pbx.sipTechnology || 'pjsip',
                authName: trunk.authName,
                assistantUniqueId: assistant?.uniqueId || '',
                sipServerAddress: trunk.sipServerAddress,
                serverId: trunk.serverId,
                userId: userVal,
            };

            const response = await firstValueFrom(this.httpService.post(apiUrl, body, { headers }));
            return response.data;
        } catch (e) {
            this.handleError(e, 'get status of');
        }
    }

    private buildToken(identifier: string, sipServerAddress: any, serverId: any, userId: string): string {
        return crypto.createHash('sha256')
            .update(`${identifier}:${sipServerAddress}:${serverId}:${userId}`)
            .digest('hex');
    }

    private handleError(e: any, action: string) {
        this.logger.error(`Failed to ${action} SIP trunk: ${e.message}`, e.stack);
        if (e instanceof HttpException) throw e;
        if (e?.response?.data) {
            throw new HttpException(
                `Remote PBX error: ${JSON.stringify(e.response.data)}`,
                HttpStatus.BAD_GATEWAY,
            );
        }
        throw new HttpException(
            `Failed to ${action} SIP trunk`,
            HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
}
