import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Organization } from './organizations.model';
import { User } from '../users/users.model';
import { SbisService } from '../accounting/sbis.service';
import { SbisEdoInvitationState } from '../accounting/sbis.types';
import { OurOrganizationsService } from '../our-organizations/our-organizations.service';

export type OrganizationEdoStatusDto = {
    edoParticipantId: string | null;
    edoOperatorLabel: string | null;
    edoInvitationId: string | null;
    edoInvitationStateCode: number | null;
    edoInvitationStateDescription: string | null;
    edoInvitationStateAt: string | null;
    edoReady: boolean;
};

@Injectable()
export class OrganizationEdoService {
    constructor(
        @InjectModel(Organization) private readonly orgModel: typeof Organization,
        @InjectModel(User) private readonly userModel: typeof User,
        private readonly sbis: SbisService,
        private readonly ourOrganizations: OurOrganizationsService,
    ) {}

    toEdoStatus(org: Organization): OrganizationEdoStatusDto {
        const code = org.edoInvitationStateCode;
        return {
            edoParticipantId: org.edoParticipantId,
            edoOperatorLabel: this.sbis.edoOperatorLabel(org.edoParticipantId),
            edoInvitationId: org.edoInvitationId,
            edoInvitationStateCode: code,
            edoInvitationStateDescription: this.describeInvitationState(code),
            edoInvitationStateAt: org.edoInvitationStateAt
                ? org.edoInvitationStateAt.toISOString()
                : null,
            edoReady: code === 7,
        };
    }

    private describeInvitationState(code: number | null): string | null {
        if (code === 2) return 'Приглашение отправлено, ожидает принятия';
        if (code === 7) return 'Можно обмениваться документами';
        if (code === 9) return 'Маршрут разорван';
        return null;
    }

    async resolveIssuerForTenant(ownerUserId: number) {
        const user = await this.userModel.findByPk(ownerUserId, {
            attributes: ['id', 'ourOrganizationId', 'vpbx_user_id'],
        });
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        const ownerId = user.vpbx_user_id ?? user.id;
        const owner =
            user.vpbx_user_id != null
                ? await this.userModel.findByPk(ownerId, { attributes: ['id', 'ourOrganizationId'] })
                : user;
        const issuer = await this.ourOrganizations.resolveIssuerForTenant(owner?.ourOrganizationId ?? null);
        if (!issuer.edoParticipantId?.trim()) {
            throw new HttpException(
                'Issuer EDO participant id is not set on our_organization',
                HttpStatus.BAD_REQUEST,
            );
        }
        return issuer;
    }

    assertEdoReady(org: Organization): void {
        if (org.edoInvitationStateCode !== 7) {
            throw new HttpException(
                {
                    message:
                        org.edoInvitationStateCode === 2
                            ? 'EDO invitation pending acceptance by counterparty'
                            : org.edoInvitationStateCode === 9
                              ? 'EDO route is broken; send a new invitation'
                              : 'EDO route is not ready; send an invitation first',
                    edoInvitationStateCode: org.edoInvitationStateCode,
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    async applyInvitationState(org: Organization, invitationId: string, stateCode: number | null) {
        await org.update({
            edoInvitationId: invitationId,
            edoInvitationStateCode: stateCode,
            edoInvitationStateAt: new Date(),
            edoInvitationCheckedAt: new Date(),
        });
    }

    private async applyEdoRouteReady(org: Organization, stateCode: number) {
        await org.update({
            edoInvitationStateCode: stateCode,
            edoInvitationStateAt: new Date(),
            edoInvitationCheckedAt: new Date(),
        });
    }

    async sendInvitation(
        org: Organization,
        ownerUserId: number,
        counterpartyEdoParticipantId?: string | null,
    ) {
        if (!this.sbis.isConfigured()) {
            throw new HttpException('SBIS is not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }
        const issuer = await this.resolveIssuerForTenant(ownerUserId);
        const edoId =
            (counterpartyEdoParticipantId || org.edoParticipantId || '').trim() || null;

        const sent = await this.sbis.sendEdoInvitation({
            ourEdoParticipantId: issuer.edoParticipantId!,
            counterpartyInn: org.tin,
            counterpartyKpp: org.kpp,
            counterpartyName: org.name,
            counterpartyEdoParticipantId: edoId,
            counterpartyEmail: org.email,
            legalForm: (org.legalForm as 'ul' | 'ip') || undefined,
        });

        if (edoId && edoId !== org.edoParticipantId) {
            await org.update({ edoParticipantId: edoId });
        }

        if (sent.alreadyConnected || sent.stateCode === 7) {
            await this.applyEdoRouteReady(org, 7);
        } else if (sent.invitationId) {
            await this.applyInvitationState(org, sent.invitationId, sent.stateCode ?? 2);
        } else {
            await this.applyEdoRouteReady(org, sent.stateCode ?? 2);
        }
        return { invitation: sent, edo: this.toEdoStatus(await org.reload()) };
    }

    async syncInvitation(org: Organization, ownerUserId: number) {
        if (!this.sbis.isConfigured()) {
            throw new HttpException('SBIS is not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }

        if (org.edoInvitationId) {
            const read = await this.sbis.readEdoInvitation(org.edoInvitationId);
            await org.update({
                edoInvitationStateCode: read.stateCode,
                edoInvitationStateAt: read.stateChangedAt ?? org.edoInvitationStateAt ?? new Date(),
                edoInvitationCheckedAt: new Date(),
                ...(read.counterpartyEdoParticipantId
                    ? { edoParticipantId: read.counterpartyEdoParticipantId }
                    : {}),
            });
            return { edo: this.toEdoStatus(await org.reload()) };
        }

        const matched = await this.applyInvitationListMatch(org, ownerUserId);
        if (matched) {
            return { edo: this.toEdoStatus(matched) };
        }

        await org.update({ edoInvitationCheckedAt: new Date() });
        return { edo: this.toEdoStatus(await org.reload()) };
    }

    /**
     * Admin: find route in СписокИзмененийПриглашений; if missing, probe via ОтправитьПриглашение
     * (Saby-to-Saby often has no list row but returns state 7 immediately).
     */
    async checkEdoRoute(org: Organization, ownerUserId: number) {
        if (!this.sbis.isConfigured()) {
            throw new HttpException('SBIS is not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }

        if (org.edoInvitationId) {
            return this.syncInvitation(org, ownerUserId);
        }

        const matched = await this.applyInvitationListMatch(org, ownerUserId);
        if (matched) {
            return { edo: this.toEdoStatus(matched), source: 'list' as const };
        }

        const edoId = (org.edoParticipantId || '').trim();
        if (!edoId) {
            await org.update({ edoInvitationCheckedAt: new Date() });
            return { edo: this.toEdoStatus(await org.reload()), source: 'none' as const };
        }

        const probed = await this.probeEdoRouteViaInvitation(org, ownerUserId, edoId);
        return { edo: this.toEdoStatus(probed), source: 'probe' as const };
    }

    private async applyInvitationListMatch(
        org: Organization,
        ownerUserId: number,
    ): Promise<Organization | null> {
        const issuer = await this.resolveIssuerForTenant(ownerUserId);
        const changes = await this.sbis.listEdoInvitationChanges(issuer.edoParticipantId);
        const inn = org.tin.replace(/\D/g, '');
        const kpp = org.kpp?.replace(/\D/g, '') || '';
        const orgEdoId = (org.edoParticipantId || '').trim();

        for (const item of changes) {
            if (!this.matchInvitationToOrg(item, inn, kpp, orgEdoId)) {
                continue;
            }
            await org.update({
                edoInvitationId: item.invitationId,
                edoInvitationStateCode: item.stateCode,
                edoInvitationStateAt: item.stateChangedAt ?? new Date(),
                edoInvitationCheckedAt: new Date(),
                ...(item.counterpartyEdoParticipantId
                    ? { edoParticipantId: item.counterpartyEdoParticipantId }
                    : {}),
            });
            return org.reload();
        }

        return null;
    }

    private async probeEdoRouteViaInvitation(
        org: Organization,
        ownerUserId: number,
        counterpartyEdoParticipantId: string,
    ): Promise<Organization> {
        const issuer = await this.resolveIssuerForTenant(ownerUserId);
        const sent = await this.sbis.sendEdoInvitation({
            ourEdoParticipantId: issuer.edoParticipantId!,
            counterpartyInn: org.tin,
            counterpartyKpp: org.kpp,
            counterpartyName: org.name,
            counterpartyEdoParticipantId,
            counterpartyEmail: org.email,
            legalForm: (org.legalForm as 'ul' | 'ip') || undefined,
        });

        if (counterpartyEdoParticipantId !== org.edoParticipantId) {
            await org.update({ edoParticipantId: counterpartyEdoParticipantId });
        }

        if (sent.alreadyConnected || sent.stateCode === 7) {
            await this.applyEdoRouteReady(org, 7);
        } else if (sent.invitationId) {
            await this.applyInvitationState(org, sent.invitationId, sent.stateCode ?? 2);
        } else {
            await this.applyEdoRouteReady(org, sent.stateCode ?? 2);
        }
        return org.reload();
    }

    private matchInvitationToOrg(
        item: SbisEdoInvitationState,
        inn: string,
        kpp: string,
        orgEdoParticipantId: string,
    ): boolean {
        const itemId = (item.counterpartyEdoParticipantId || '').trim().toLowerCase();
        const orgId = orgEdoParticipantId.trim().toLowerCase();
        if (orgId && itemId && orgId === itemId) {
            return true;
        }

        if (item.counterpartyInn && item.counterpartyInn === inn) {
            const itemKpp = (item.counterpartyKpp || '').replace(/\D/g, '');
            if (!kpp || !itemKpp || itemKpp === kpp) {
                return true;
            }
        }

        if (itemId && inn && itemId.includes(inn)) {
            if (!kpp || itemId.includes(kpp)) {
                return true;
            }
        }

        return false;
    }

    /** Sync pending invitations for one tenant (used on PaymentOrganizations open). */
    async syncPendingForTenant(
        tenantOwnerId: number,
    ): Promise<{ synced: number; organizations: Organization[] }> {
        if (!this.sbis.isConfigured()) {
            return { synced: 0, organizations: [] };
        }

        const pending = await this.orgModel.findAll({
            where: {
                userId: tenantOwnerId,
                edoInvitationStateCode: 2,
            },
            limit: 50,
        });

        const updated: Organization[] = [];
        for (const org of pending) {
            if (!org.edoInvitationId) continue;
            try {
                await this.syncInvitation(org, tenantOwnerId);
                const fresh = await this.orgModel.findByPk(org.id);
                if (fresh) updated.push(fresh);
            } catch {
                /* skip */
            }
        }

        return { synced: updated.length, organizations: updated };
    }
}
