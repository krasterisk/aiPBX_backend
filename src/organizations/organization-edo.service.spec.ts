import { OrganizationEdoService } from './organization-edo.service';
import { SbisEdoInvitationState } from '../accounting/sbis.types';

describe('OrganizationEdoService.matchInvitationToOrg', () => {
    const service = Object.create(OrganizationEdoService.prototype) as OrganizationEdoService;
    const match = (
        item: Partial<SbisEdoInvitationState>,
        inn: string,
        kpp: string,
        orgEdoId: string,
    ) =>
        (service as unknown as {
            matchInvitationToOrg: (
                i: SbisEdoInvitationState,
                inn: string,
                kpp: string,
                orgEdoId: string,
            ) => boolean;
        }).matchInvitationToOrg(
            {
                invitationId: 'x',
                stateCode: 7,
                stateDescription: null,
                stateChangedAt: null,
                ourEdoParticipantId: null,
                counterpartyEdoParticipantId: null,
                counterpartyInn: null,
                counterpartyKpp: null,
                ...item,
            },
            inn,
            kpp,
            orgEdoId,
        );

    it('matches Saby 2BE id by exact edoParticipantId', () => {
        const id = '2BEc84b324b724a4d50b42542562566332b';
        expect(
            match(
                { counterpartyEdoParticipantId: id },
                '7707083893',
                '770701001',
                id,
            ),
        ).toBe(true);
    });

    it('matches Diadoc id when INN and KPP are embedded', () => {
        expect(
            match(
                { counterpartyEdoParticipantId: '2BM-7707083893-770701001-extra' },
                '7707083893',
                '770701001',
                '',
            ),
        ).toBe(true);
    });

    it('matches by counterparty INN and KPP from invitation', () => {
        expect(
            match(
                {
                    counterpartyInn: '7707083893',
                    counterpartyKpp: '770701001',
                },
                '7707083893',
                '770701001',
                '2BE-other-id',
            ),
        ).toBe(true);
    });

    it('does not match different Saby ids', () => {
        expect(
            match(
                { counterpartyEdoParticipantId: '2BEaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
                '7707083893',
                '770701001',
                '2BEbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            ),
        ).toBe(false);
    });
});
