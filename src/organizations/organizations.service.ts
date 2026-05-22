import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { Organization } from "./organizations.model";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { User } from '../users/users.model';
import { OrganizationEdoService } from './organization-edo.service';
import { CreateOrganizationResult } from './organization-create.types';

@Injectable()
export class OrganizationsService {

    constructor(
        @InjectModel(Organization) private organizationRepository: typeof Organization,
        @InjectModel(User) private readonly userModel: typeof User,
        private readonly organizationEdo: OrganizationEdoService,
    ) { }

    /** Tenant owner: sub-users inherit organizations of vpbx_user_id parent. */
    async resolveOwnerUserId(userId: number): Promise<number> {
        const user = await this.userModel.findByPk(userId, {
            attributes: ['id', 'vpbx_user_id'],
        });
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        return user.vpbx_user_id ?? user.id;
    }

    private normalizeDto(dto: CreateOrganizationDto): Partial<CreateOrganizationDto> {
        const { ownerUserId: _drop, ...d } = dto as CreateOrganizationDto & { ownerUserId?: number };
        const trim = (v: string | null | undefined) => (v === undefined || v === null ? v : String(v).trim());
        const base: Record<string, unknown> = {
            name: trim(d.name) as string,
            tin: trim(d.tin) as string,
            address: trim(d.address) as string,
            kpp: trim(d.kpp as any) || null,
            ogrn: trim(d.ogrn as any) || null,
            legalForm: (d.legalForm as any) || null,
            director: trim(d.director as any) || null,
            email: trim(d.email as any) || null,
            phone: trim(d.phone as any) || null,
            bankAccount: trim(d.bankAccount as any) || null,
            bankBic: trim(d.bankBic as any) || null,
            bankName: trim(d.bankName as any) || null,
        };
        if (Object.prototype.hasOwnProperty.call(d, 'subject')) {
            base.subject = trim(d.subject as any) || null;
        }
        if (Object.prototype.hasOwnProperty.call(d, 'edoParticipantId')) {
            base.edoParticipantId = trim(d.edoParticipantId as any) || null;
        }
        return base as any;
    }

    assertRuRequisites(dto: CreateOrganizationDto) {
        const lf = dto.legalForm || 'ul';
        if (lf === 'ul') {
            if (dto.tin.length !== 10) {
                throw new HttpException('INN must be 10 digits for legal entities (UL)', HttpStatus.BAD_REQUEST);
            }
            if (!dto.kpp || !/^\d{9}$/.test(dto.kpp)) {
                throw new HttpException('KPP is required (9 digits) for legal entities (UL)', HttpStatus.BAD_REQUEST);
            }
        }
        if (lf === 'ip' && dto.tin.length !== 12) {
            throw new HttpException('INN must be 12 digits for individual entrepreneurs (IP)', HttpStatus.BAD_REQUEST);
        }
        if (dto.ogrn && !/^(\d{13}|\d{15})$/.test(dto.ogrn)) {
            throw new HttpException('OGRN must be 13 or 15 digits', HttpStatus.BAD_REQUEST);
        }
        if (dto.bankBic && !/^\d{9}$/.test(dto.bankBic)) {
            throw new HttpException('BIC must be 9 digits', HttpStatus.BAD_REQUEST);
        }
        if (dto.bankAccount && !/^\d{20}$/.test(dto.bankAccount)) {
            throw new HttpException('Bank account must be 20 digits', HttpStatus.BAD_REQUEST);
        }
    }

    private assertEdoParticipantForInvitation(
        dto: CreateOrganizationDto,
        sendEdoInvitation: boolean,
    ) {
        if (!sendEdoInvitation) return;
        const edoId = (dto.edoParticipantId ?? '').trim();
        if (!edoId) {
            throw new HttpException(
                'EDO participant id is required when connecting EDO',
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    private extractErrorMessage(err: unknown): string {
        if (err instanceof HttpException) {
            const res = err.getResponse();
            if (typeof res === 'string') return res;
            if (res && typeof res === 'object') {
                const o = res as Record<string, unknown>;
                if (typeof o.message === 'string') return o.message;
                if (Array.isArray(o.message)) return o.message.map(String).join('; ');
                const sbis = o.sbis as Record<string, unknown> | undefined;
                if (sbis && typeof sbis.message === 'string') return sbis.message;
            }
        }
        return err instanceof Error ? err.message : 'EDO invitation failed';
    }

    async create(ownerUserId: number, dto: CreateOrganizationDto): Promise<CreateOrganizationResult> {
        try {
            const tenantOwnerId = await this.resolveOwnerUserId(ownerUserId);
            const sendEdoInvitation = !!dto.sendEdoInvitation;
            const clean = this.normalizeDto(dto) as CreateOrganizationDto;
            this.assertRuRequisites(clean);
            this.assertEdoParticipantForInvitation(clean, sendEdoInvitation);
            const organization = await this.organizationRepository.create({
                ...clean,
                userId: tenantOwnerId,
            } as any);

            let edo: CreateOrganizationResult['edo'];
            if (sendEdoInvitation) {
                try {
                    const invitation = await this.organizationEdo.sendInvitation(
                        organization,
                        tenantOwnerId,
                        organization.edoParticipantId,
                    );
                    edo = { success: true, edo: invitation.edo };
                } catch (inviteErr) {
                    edo = { success: false, error: this.extractErrorMessage(inviteErr) };
                }
            }

            const reloaded = await organization.reload();
            return { organization: reloaded, ...(edo ? { edo } : {}) };
        } catch (e) {
            if (e instanceof HttpException) throw e;
            throw new HttpException('Error creating organization', HttpStatus.BAD_REQUEST);
        }
    }

    async getAll(userId: number) {
        try {
            const tenantOwnerId = await this.resolveOwnerUserId(userId);
            const organizations = await this.organizationRepository.findAndCountAll({
                where: { userId: tenantOwnerId },
                order: [['createdAt', 'DESC']],
            });
            return organizations;
        } catch (e) {
            throw new HttpException("Error fetching organizations", HttpStatus.BAD_REQUEST);
        }
    }

    async getAllForAdmin() {
        try {
            return await this.organizationRepository.findAndCountAll({
                order: [['createdAt', 'DESC']],
            });
        } catch (e) {
            throw new HttpException('Error fetching organizations', HttpStatus.BAD_REQUEST);
        }
    }

    async getOne(actingUserId: number, id: number, isAdmin = false) {
        if (isAdmin) {
            const organization = await this.organizationRepository.findByPk(id);
            if (!organization) {
                throw new HttpException("Organization not found", HttpStatus.NOT_FOUND);
            }
            return organization;
        }
        const tenantOwnerId = await this.resolveOwnerUserId(actingUserId);
        const organization = await this.organizationRepository.findOne({ where: { id, userId: tenantOwnerId } });
        if (!organization) {
            throw new HttpException("Organization not found", HttpStatus.NOT_FOUND);
        }
        return organization;
    }

    async update(actingUserId: number, id: number, dto: CreateOrganizationDto, isAdmin = false) {
        const organization = await this.getOne(actingUserId, id, isAdmin);
        const clean = this.normalizeDto(dto) as CreateOrganizationDto;
        this.assertRuRequisites(clean);
        await organization.update(clean as any);
        return organization;
    }

    async remove(actingUserId: number, id: number, isAdmin = false) {
        const organization = await this.getOne(actingUserId, id, isAdmin);
        await organization.destroy();
        return { message: "Organization deleted" };
    }
}
