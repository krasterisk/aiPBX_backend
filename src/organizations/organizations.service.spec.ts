import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { OrganizationsService } from './organizations.service';
import { Organization } from './organizations.model';
import { User } from '../users/users.model';
import { OrganizationEdoService } from './organization-edo.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

describe('OrganizationsService', () => {
    let service: OrganizationsService;
    let mockOrgRepo: {
        create: jest.Mock;
    };
    let mockUserRepo: {
        findByPk: jest.Mock;
    };
    let mockOrganizationEdo: {
        sendInvitation: jest.Mock;
    };

    const baseDto: CreateOrganizationDto = {
        name: 'Test LLC',
        tin: '7707083893',
        address: 'Moscow',
        legalForm: 'ul',
        kpp: '770701001',
        sendEdoInvitation: true,
        edoParticipantId: '',
    };

    const createdOrg = {
        id: 10,
        reload: jest.fn().mockImplementation(function (this: typeof createdOrg) {
            return Promise.resolve(this);
        }),
        edoParticipantId: '2BE-test-id',
    };

    beforeEach(async () => {
        mockOrgRepo = {
            create: jest.fn().mockResolvedValue({ ...createdOrg }),
        };
        mockUserRepo = {
            findByPk: jest.fn().mockResolvedValue({ id: 1, vpbx_user_id: null }),
        };
        mockOrganizationEdo = {
            sendInvitation: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrganizationsService,
                { provide: getModelToken(Organization), useValue: mockOrgRepo },
                { provide: getModelToken(User), useValue: mockUserRepo },
                { provide: OrganizationEdoService, useValue: mockOrganizationEdo },
            ],
        }).compile();

        service = module.get(OrganizationsService);
        jest.clearAllMocks();
        createdOrg.reload.mockImplementation(function (this: typeof createdOrg) {
            return Promise.resolve(this);
        });
    });

    it('rejects create with sendEdoInvitation when edoParticipantId is empty', async () => {
        await expect(service.create(1, { ...baseDto, edoParticipantId: '   ' })).rejects.toMatchObject({
            status: HttpStatus.BAD_REQUEST,
        });
        expect(mockOrgRepo.create).not.toHaveBeenCalled();
    });

    it('returns organization and edo error when SBIS invitation fails', async () => {
        mockOrgRepo.create.mockResolvedValue({
            ...createdOrg,
            edoParticipantId: '2BE-abc',
        });
        mockOrganizationEdo.sendInvitation.mockRejectedValue(
            new HttpException('SBIS unavailable', HttpStatus.BAD_GATEWAY),
        );

        const result = await service.create(1, {
            ...baseDto,
            edoParticipantId: '2BE-abc',
        });

        expect(mockOrgRepo.create).toHaveBeenCalled();
        expect(result.organization).toBeDefined();
        expect(result.edo).toEqual({ success: false, error: 'SBIS unavailable' });
    });

    it('returns organization and edo success when invitation succeeds', async () => {
        const edoStatus = {
            edoParticipantId: '2BE-abc',
            edoInvitationId: 'inv-1',
            edoInvitationStateCode: 2,
            edoReady: false,
        };
        mockOrgRepo.create.mockResolvedValue({
            ...createdOrg,
            edoParticipantId: '2BE-abc',
        });
        mockOrganizationEdo.sendInvitation.mockResolvedValue({ edo: edoStatus });

        const result = await service.create(1, {
            ...baseDto,
            edoParticipantId: '2BE-abc',
        });

        expect(result.edo).toEqual({ success: true, edo: edoStatus });
    });
});
