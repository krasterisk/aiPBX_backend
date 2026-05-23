import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { OurOrganization } from './our-organization.model';
import { CreateOurOrganizationDto } from './dto/create-our-organization.dto';

@Injectable()
export class OurOrganizationsService {
    constructor(
        @InjectModel(OurOrganization) private readonly repo: typeof OurOrganization,
    ) {}

    private normalizeDto(dto: CreateOurOrganizationDto): Partial<CreateOurOrganizationDto> {
        const trim = (v: string | null | undefined) =>
            v === undefined || v === null ? v : String(v).trim();
        return {
            name: trim(dto.name) as string,
            tin: trim(dto.tin)?.replace(/\D/g, '') as string,
            address: trim(dto.address) as string,
            kpp: trim(dto.kpp as string) || null,
            ogrn: trim(dto.ogrn as string) || null,
            legalForm: dto.legalForm || null,
            director: trim(dto.director as string) || null,
            isPrimary: !!dto.isPrimary,
            bankName: trim(dto.bankName as string) || null,
            bankBranchName: trim(dto.bankBranchName as string) || null,
            bankBic: trim(dto.bankBic as string)?.replace(/\D/g, '') || null,
            bankAccount: trim(dto.bankAccount as string)?.replace(/\D/g, '') || null,
            bankCorrAccount: trim(dto.bankCorrAccount as string)?.replace(/\D/g, '') || null,
            edoParticipantId: trim(dto.edoParticipantId as string) || null,
            sbisCertThumbprint: trim(dto.sbisCertThumbprint as string) || null,
        };
    }

    /**
     * Issuer for tenant billing documents: owner user's ourOrganizationId, else primary org.
     */
    async resolveIssuerForTenant(
        ourOrganizationId: number | null | undefined,
    ): Promise<OurOrganization> {
        const org = await this.resolveForUser(ourOrganizationId);
        if (!org) {
            throw new HttpException(
                'Issuer organization is not configured (set tenant ourOrganizationId or primary our_organizations)',
                HttpStatus.BAD_REQUEST,
            );
        }
        return org;
    }

    private assertRuRequisites(dto: CreateOurOrganizationDto) {
        const lf = dto.legalForm || 'ul';
        const tin = String(dto.tin).replace(/\D/g, '');
        if (lf === 'ul') {
            if (tin.length !== 10) {
                throw new HttpException('INN must be 10 digits for legal entities (UL)', HttpStatus.BAD_REQUEST);
            }
            if (!dto.kpp || !/^\d{9}$/.test(String(dto.kpp).replace(/\D/g, ''))) {
                throw new HttpException('KPP is required (9 digits) for legal entities (UL)', HttpStatus.BAD_REQUEST);
            }
        }
        if (lf === 'ip' && tin.length !== 12) {
            throw new HttpException('INN must be 12 digits for individual entrepreneurs (IP)', HttpStatus.BAD_REQUEST);
        }
        if (dto.bankBic && !/^\d{9}$/.test(String(dto.bankBic).replace(/\D/g, ''))) {
            throw new HttpException('BIC must be 9 digits', HttpStatus.BAD_REQUEST);
        }
        if (dto.bankAccount && !/^\d{20}$/.test(String(dto.bankAccount).replace(/\D/g, ''))) {
            throw new HttpException('Bank account must be 20 digits', HttpStatus.BAD_REQUEST);
        }
        if (dto.bankCorrAccount && !/^\d{20}$/.test(String(dto.bankCorrAccount).replace(/\D/g, ''))) {
            throw new HttpException('Correspondent account must be 20 digits', HttpStatus.BAD_REQUEST);
        }
    }

    async findAll(): Promise<OurOrganization[]> {
        return this.repo.findAll({
            order: [
                ['isPrimary', 'DESC'],
                ['id', 'ASC'],
            ],
        });
    }

    async findById(id: number): Promise<OurOrganization | null> {
        return this.repo.findByPk(id);
    }

    async getPrimary(): Promise<OurOrganization | null> {
        const primary = await this.repo.findOne({ where: { isPrimary: true } });
        if (primary) return primary;
        return this.repo.findOne({ order: [['id', 'ASC']] });
    }

    async getPrimaryId(): Promise<number | null> {
        const org = await this.getPrimary();
        return org?.id ?? null;
    }

    async resolveForUser(userOurOrganizationId: number | null | undefined): Promise<OurOrganization | null> {
        if (userOurOrganizationId != null) {
            const assigned = await this.repo.findByPk(userOurOrganizationId);
            if (assigned) return assigned;
        }
        return this.getPrimary();
    }

    async create(dto: CreateOurOrganizationDto): Promise<OurOrganization> {
        const normalized = this.normalizeDto(dto);
        this.assertRuRequisites({ ...dto, ...normalized } as CreateOurOrganizationDto);

        const count = await this.repo.count();
        const isPrimary = normalized.isPrimary || count === 0;

        if (isPrimary) {
            await this.repo.update({ isPrimary: false }, { where: { isPrimary: true } });
        }

        return this.repo.create({
            ...normalized,
            isPrimary,
        } as OurOrganization);
    }

    async update(id: number, dto: CreateOurOrganizationDto): Promise<OurOrganization> {
        const row = await this.repo.findByPk(id);
        if (!row) {
            throw new HttpException('Our organization not found', HttpStatus.NOT_FOUND);
        }

        const normalized = this.normalizeDto(dto);
        this.assertRuRequisites({ ...dto, ...normalized } as CreateOurOrganizationDto);

        let isPrimary = normalized.isPrimary ?? false;
        if (isPrimary) {
            await this.repo.update(
                { isPrimary: false },
                { where: { isPrimary: true, id: { [Op.ne]: id } } },
            );
        } else if (row.isPrimary) {
            const others = await this.repo.count({ where: { id: { [Op.ne]: id } } });
            if (others === 0) {
                isPrimary = true;
            }
        }

        await row.update({ ...normalized, isPrimary } as Partial<OurOrganization>);
        return row.reload();
    }

    async delete(id: number): Promise<void> {
        const row = await this.repo.findByPk(id);
        if (!row) {
            throw new HttpException('Our organization not found', HttpStatus.NOT_FOUND);
        }
        const wasPrimary = row.isPrimary;
        await row.destroy();
        if (wasPrimary) {
            const next = await this.repo.findOne({ order: [['id', 'ASC']] });
            if (next) {
                await next.update({ isPrimary: true });
            }
        }
    }
}
