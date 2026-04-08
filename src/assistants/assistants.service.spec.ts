// Mock nanoid (ESM-only module) before any imports
jest.mock('nanoid', () => ({
    nanoid: (size?: number) => 'mocked_nanoid_12345',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { AssistantsService } from './assistants.service';
import { Assistant } from './assistants.model';
import { Prices } from '../prices/prices.model';
import { BillingRecord } from '../billing/billing-record.model';
import { OpenAiService } from '../open-ai/open-ai.service';
import { UsersService } from '../users/users.service';

describe('AssistantsService', () => {
    let service: AssistantsService;
    let mockAssistantsRepo: any;
    let mockPricesRepo: any;
    let mockBillingRecordRepo: any;
    let mockOpenAiService: any;
    let mockUsersService: any;

    const mockAssistant = {
        id: 1,
        uniqueId: 'abc123def456ghi',
        userId: 1,
        name: 'Test Bot',
        tools: [],
        mcpServers: [],
        $set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        reload: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        mockAssistantsRepo = {
            create: jest.fn().mockResolvedValue({ ...mockAssistant, $set: jest.fn().mockResolvedValue(undefined) }),
            findByPk: jest.fn().mockResolvedValue(mockAssistant),
            findOne: jest.fn().mockResolvedValue(mockAssistant),
            findAll: jest.fn().mockResolvedValue([mockAssistant]),
            findAndCountAll: jest.fn().mockResolvedValue({ rows: [mockAssistant], count: 1 }),
            destroy: jest.fn().mockResolvedValue(1),
        };
        mockPricesRepo = {
            findOne: jest.fn().mockResolvedValue({ userId: 1, text: 5 }),
        };
        mockBillingRecordRepo = {
            create: jest.fn().mockResolvedValue({}),
        };
        mockOpenAiService = {
            chatCompletion: jest.fn().mockResolvedValue({
                content: JSON.stringify({ instruction: 'Generated system prompt' }),
                usage: { total_tokens: 1000 },
            }),
        };
        mockUsersService = {
            decrementUserBalance: jest.fn().mockResolvedValue(true),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AssistantsService,
                { provide: getModelToken(Assistant), useValue: mockAssistantsRepo },
                { provide: getModelToken(Prices), useValue: mockPricesRepo },
                { provide: getModelToken(BillingRecord), useValue: mockBillingRecordRepo },
                { provide: OpenAiService, useValue: mockOpenAiService },
                { provide: UsersService, useValue: mockUsersService },
            ],
        }).compile();

        service = module.get<AssistantsService>(AssistantsService);
    });

    // ═══════════════════════════════════════════════════════════════════
    // create
    // ═══════════════════════════════════════════════════════════════════

    describe('create', () => {
        it('should create assistant with generated uniqueId', async () => {
            const result = await service.create(
                [{ name: 'My Bot', instruction: 'Be helpful' } as any],
                false,
                '1',
            );

            expect(mockAssistantsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'My Bot',
                    instruction: 'Be helpful',
                    uniqueId: expect.any(String),
                    userId: 1,
                }),
            );
            expect(result).toHaveLength(1);
        });

        it('should use provided userId when explicitly set', async () => {
            await service.create(
                [{ name: 'Bot', userId: 5 } as any],
                true,
                '1',
            );

            expect(mockAssistantsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 5 }),
            );
        });

        it('should fallback to token userId when assistant.userId is null', async () => {
            await service.create(
                [{ name: 'Bot', userId: null } as any],
                false,
                '3',
            );

            expect(mockAssistantsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 3 }),
            );
        });

        it('should set tools when provided', async () => {
            const createdAssistant = {
                ...mockAssistant,
                $set: jest.fn().mockResolvedValue(undefined),
            };
            mockAssistantsRepo.create.mockResolvedValue(createdAssistant);

            await service.create(
                [{ name: 'Bot', tools: [{ id: 10 }, { id: 20 }] } as any],
                false,
                '1',
            );

            expect(createdAssistant.$set).toHaveBeenCalledWith('tools', [10, 20]);
        });

        it('should set mcpServers when provided', async () => {
            const createdAssistant = {
                ...mockAssistant,
                $set: jest.fn().mockResolvedValue(undefined),
            };
            mockAssistantsRepo.create.mockResolvedValue(createdAssistant);

            await service.create(
                [{ name: 'Bot', mcpServers: [{ id: 1 }, { id: 2 }] } as any],
                false,
                '1',
            );

            expect(createdAssistant.$set).toHaveBeenCalledWith('mcpServers', [1, 2]);
        });

        it('should handle projectId — convert string to number', async () => {
            await service.create(
                [{ name: 'Bot', projectId: '5' } as any],
                false,
                '1',
            );

            expect(mockAssistantsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: 5 }),
            );
        });

        it('should set projectId to null when empty string', async () => {
            await service.create(
                [{ name: 'Bot', projectId: '' } as any],
                false,
                '1',
            );

            expect(mockAssistantsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: null }),
            );
        });

        it('should create multiple assistants in batch', async () => {
            const result = await service.create(
                [
                    { name: 'Bot 1' } as any,
                    { name: 'Bot 2' } as any,
                ],
                false,
                '1',
            );

            expect(mockAssistantsRepo.create).toHaveBeenCalledTimes(2);
            expect(result).toHaveLength(2);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // update
    // ═══════════════════════════════════════════════════════════════════

    describe('update', () => {
        it('should throw 404 when assistant not found', async () => {
            mockAssistantsRepo.findByPk.mockResolvedValue(null);

            await expect(
                service.update({ id: 999, name: 'Updated' } as any),
            ).rejects.toThrow(HttpException);
        });

        it('should update assistant fields', async () => {
            await service.update({ id: 1, name: 'Updated Bot' } as any);

            expect(mockAssistant.update).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Updated Bot' }),
            );
        });

        it('should clear tools when empty array passed', async () => {
            await service.update({ id: 1, tools: [] } as any);

            expect(mockAssistant.$set).toHaveBeenCalledWith('tools', []);
        });

        it('should update tools when non-empty array passed', async () => {
            await service.update({ id: 1, tools: [{ id: 5 }, { id: 10 }] } as any);

            expect(mockAssistant.$set).toHaveBeenCalledWith('tools', [5, 10]);
        });

        it('should convert userId to number', async () => {
            await service.update({ id: 1, userId: '42' } as any);

            expect(mockAssistant.update).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 42 }),
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // delete
    // ═══════════════════════════════════════════════════════════════════

    describe('delete', () => {
        it('should destroy assistant and return success', async () => {
            const result = await service.delete('1');

            expect(mockAssistantsRepo.destroy).toHaveBeenCalledWith({ where: { id: '1' } });
            expect(result.statusCode).toBe(HttpStatus.OK);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // get (paginated)
    // ═══════════════════════════════════════════════════════════════════

    describe('get', () => {
        it('should filter by userId for non-admin', async () => {
            await service.get(
                { page: '1', limit: '10', search: '' } as any,
                false,
                '5',
            );

            expect(mockAssistantsRepo.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    offset: 0,
                    limit: 10,
                    where: expect.objectContaining({ userId: 5 }),
                }),
            );
        });

        it('should throw when userId is missing and not admin', async () => {
            await expect(
                service.get({ page: '1', limit: '10', search: '' } as any, false, ''),
            ).rejects.toThrow(HttpException);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // getAll
    // ═══════════════════════════════════════════════════════════════════

    describe('getAll', () => {
        it('should return all assistants for admin (no userId filter)', async () => {
            await service.getAll('1', true);

            expect(mockAssistantsRepo.findAll).toHaveBeenCalledWith(
                expect.objectContaining({ where: {} }),
            );
        });

        it('should filter by userId for non-admin', async () => {
            await service.getAll('5', false);

            expect(mockAssistantsRepo.findAll).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: 5 } }),
            );
        });

        it('should throw when userId is missing and not admin', async () => {
            await expect(service.getAll('', false)).rejects.toThrow('userId must be set');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // getById, getByUniqueId
    // ═══════════════════════════════════════════════════════════════════

    describe('getById', () => {
        it('should return assistant when found', async () => {
            const result = await service.getById(1);

            expect(result).toEqual(mockAssistant);
        });

        it('should throw 404 when not found', async () => {
            mockAssistantsRepo.findOne.mockResolvedValue(null);

            await expect(service.getById(999)).rejects.toThrow('Assistant not found');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // generatePrompt (AI + billing)
    // ═══════════════════════════════════════════════════════════════════

    describe('generatePrompt', () => {
        it('should throw when prompt is empty', async () => {
            await expect(service.generatePrompt('', '1')).rejects.toThrow('Prompt is empty');
        });

        it('should call openAiService.chatCompletion and return instruction', async () => {
            const result = await service.generatePrompt('AI assistant for a clinic', '1');

            expect(mockOpenAiService.chatCompletion).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ role: 'system' }),
                    expect.objectContaining({ role: 'user', content: 'AI assistant for a clinic' }),
                ]),
                'gpt-4o-mini',
            );
            expect(result.success).toBe(true);
            expect(result.instruction).toBe('Generated system prompt');
        });

        it('should charge user balance based on token usage', async () => {
            await service.generatePrompt('Make a bot', '1');

            // cost = 1000 tokens * (5 / 1_000_000) = 0.005
            expect(mockUsersService.decrementUserBalance).toHaveBeenCalledWith('1', 0.005);
        });

        it('should create billing record with token details', async () => {
            await service.generatePrompt('Make a bot', '1');

            expect(mockBillingRecordRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'text',
                    userId: '1',
                    description: 'Prompt generation',
                    textTokens: 1000,
                    totalTokens: 1000,
                    textCost: 0.005,
                    totalCost: 0.005,
                }),
            );
        });

        it('should NOT charge when token count is 0', async () => {
            mockOpenAiService.chatCompletion.mockResolvedValue({
                content: JSON.stringify({ instruction: 'Prompt' }),
                usage: { total_tokens: 0 },
            });

            await service.generatePrompt('Test', '1');

            expect(mockUsersService.decrementUserBalance).not.toHaveBeenCalled();
            expect(mockBillingRecordRepo.create).not.toHaveBeenCalled();
        });

        it('should NOT charge when price.text is 0', async () => {
            mockPricesRepo.findOne.mockResolvedValue({ userId: 1, text: 0 });

            await service.generatePrompt('Test', '1');

            expect(mockUsersService.decrementUserBalance).not.toHaveBeenCalled();
        });

        it('should throw when openAI returns null content', async () => {
            mockOpenAiService.chatCompletion.mockResolvedValue({ content: null });

            await expect(service.generatePrompt('Test', '1'))
                .rejects.toThrow('Failed to generate prompt');
        });
    });
});
