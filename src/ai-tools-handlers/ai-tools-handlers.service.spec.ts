import { Test, TestingModule } from '@nestjs/testing';
import { AiToolsHandlersService } from './ai-tools-handlers.service';
import { AiToolsService } from '../ai-tools/ai-tools.service';
import { HttpService } from '@nestjs/axios';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { of, throwError } from 'rxjs';

describe('AiToolsHandlersService', () => {
    let service: AiToolsHandlersService;
    let mockAiToolsService: any;
    let mockHttpService: any;
    let mockKnowledgeService: any;

    const mockAssistant = { id: 1, userId: '1', name: 'Test Assistant' } as any;

    beforeEach(async () => {
        mockAiToolsService = {
            getToolByName: jest.fn(),
        };
        mockHttpService = {
            get: jest.fn(),
            post: jest.fn(),
        };
        mockKnowledgeService = {
            searchMultiple: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AiToolsHandlersService,
                { provide: AiToolsService, useValue: mockAiToolsService },
                { provide: HttpService, useValue: mockHttpService },
                { provide: KnowledgeService, useValue: mockKnowledgeService },
            ],
        }).compile();

        service = module.get<AiToolsHandlersService>(AiToolsHandlersService);
    });

    // ═══════════════════════════════════════════════════════════════════
    // functionHandler — tool not found
    // ═══════════════════════════════════════════════════════════════════

    describe('functionHandler — tool routing', () => {
        it('should return error when tool not found', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue(null);

            const result = await service.functionHandler('unknown_tool', '{}', mockAssistant);

            expect(result).toContain('tool not found');
        });

        it('should return error for invalid JSON arguments', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue({
                name: 'test',
                toolData: '{}',
                webhook: 'https://example.com',
            });

            const result = await service.functionHandler('test', '{invalid json', mockAssistant);

            expect(result).toBe('Invalid function arguments format');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // functionHandler — Knowledge Base handler
    // ═══════════════════════════════════════════════════════════════════

    describe('functionHandler — knowledge base', () => {
        const kbTool = {
            name: 'search_kb',
            toolData: { handler: 'knowledge_base', knowledgeBaseIds: [1, 2] },
            webhook: null,
        };

        it('should route to KB handler when toolData.handler is knowledge_base', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue(kbTool);
            mockKnowledgeService.searchMultiple.mockResolvedValue([
                { content: 'Relevant answer', similarity: 0.85, metadata: {}, documentId: 1 },
            ]);

            const result = await service.functionHandler(
                'search_kb',
                JSON.stringify({ query: 'What are your hours?' }),
                mockAssistant,
            );

            expect(mockKnowledgeService.searchMultiple).toHaveBeenCalledWith([1, 2], 'What are your hours?', 5);
            expect(result).toContain('Relevant answer');
            expect(result).toContain('85%');
        });

        it('should return error when query is empty', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue(kbTool);

            const result = await service.functionHandler(
                'search_kb',
                JSON.stringify({ query: '' }),
                mockAssistant,
            );

            expect(result).toBe('Error: query parameter is required');
            expect(mockKnowledgeService.searchMultiple).not.toHaveBeenCalled();
        });

        it('should return error when no knowledge bases configured', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue({
                ...kbTool,
                toolData: { handler: 'knowledge_base', knowledgeBaseIds: [] },
            });

            const result = await service.functionHandler(
                'search_kb',
                JSON.stringify({ query: 'test' }),
                mockAssistant,
            );

            expect(result).toBe('No knowledge bases configured for this tool');
        });

        it('should return "no info found" when search returns empty', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue(kbTool);
            mockKnowledgeService.searchMultiple.mockResolvedValue([]);

            const result = await service.functionHandler(
                'search_kb',
                JSON.stringify({ query: 'something obscure' }),
                mockAssistant,
            );

            expect(result).toContain('No relevant information found');
        });

        it('should filter results with similarity <= 0.3', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue(kbTool);
            mockKnowledgeService.searchMultiple.mockResolvedValue([
                { content: 'Low relevance', similarity: 0.2, metadata: {}, documentId: 1 },
                { content: 'Very low', similarity: 0.1, metadata: {}, documentId: 2 },
            ]);

            const result = await service.functionHandler(
                'search_kb',
                JSON.stringify({ query: 'test' }),
                mockAssistant,
            );

            expect(result).toContain('No relevant information found');
        });

        it('should handle toolData as JSON string', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue({
                ...kbTool,
                toolData: JSON.stringify({ handler: 'knowledge_base', knowledgeBaseIds: [3] }),
            });
            mockKnowledgeService.searchMultiple.mockResolvedValue([
                { content: 'Found it', similarity: 0.9, metadata: {}, documentId: 1 },
            ]);

            const result = await service.functionHandler(
                'search_kb',
                JSON.stringify({ query: 'test' }),
                mockAssistant,
            );

            expect(mockKnowledgeService.searchMultiple).toHaveBeenCalledWith([3], 'test', 5);
            expect(result).toContain('Found it');
        });

        it('should return error message on search failure', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue(kbTool);
            mockKnowledgeService.searchMultiple.mockRejectedValue(new Error('DB connection lost'));

            const result = await service.functionHandler(
                'search_kb',
                JSON.stringify({ query: 'test' }),
                mockAssistant,
            );

            expect(result).toContain('Knowledge base search error');
            expect(result).toContain('DB connection lost');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // functionHandler — Webhook handler
    // ═══════════════════════════════════════════════════════════════════

    describe('functionHandler — webhook', () => {
        const webhookTool = {
            name: 'crm_update',
            toolData: {},
            webhook: 'https://crm.example.com/api/hook',
            method: 'POST',
            headers: { 'X-API-Key': 'secret' },
        };

        it('should return error when no webhook configured', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue({
                name: 'no_hook',
                toolData: {},
                webhook: null,
            });

            const result = await service.functionHandler('no_hook', '{}', mockAssistant);

            expect(result).toContain('no webhook configured');
        });

        it('should POST to webhook with parsed args and custom headers', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue(webhookTool);
            mockHttpService.post.mockReturnValue(of({
                data: { success: true, ticketId: 42 },
            }));

            const result = await service.functionHandler(
                'crm_update',
                JSON.stringify({ name: 'John', phone: '+123' }),
                mockAssistant,
            );

            expect(mockHttpService.post).toHaveBeenCalledWith(
                'https://crm.example.com/api/hook',
                { name: 'John', phone: '+123' },
                expect.objectContaining({
                    headers: expect.objectContaining({ 'X-API-Key': 'secret' }),
                }),
            );
            expect(result).toContain('ticketId');
        });

        it('should GET when method is GET', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue({
                ...webhookTool,
                method: 'GET',
            });
            mockHttpService.get.mockReturnValue(of({ data: 'OK' }));

            const result = await service.functionHandler(
                'crm_update',
                JSON.stringify({ id: '5' }),
                mockAssistant,
            );

            expect(mockHttpService.get).toHaveBeenCalledWith(
                'https://crm.example.com/api/hook',
                expect.objectContaining({
                    params: { id: '5' },
                }),
            );
            expect(result).toBe('OK');
        });

        it('should default to GET when method is undefined', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue({
                ...webhookTool,
                method: undefined,
            });
            mockHttpService.get.mockReturnValue(of({ data: 'default GET' }));

            await service.functionHandler('crm_update', '{}', mockAssistant);

            expect(mockHttpService.get).toHaveBeenCalled();
            expect(mockHttpService.post).not.toHaveBeenCalled();
        });

        it('should return error message on webhook failure', async () => {
            mockAiToolsService.getToolByName.mockResolvedValue(webhookTool);
            mockHttpService.post.mockReturnValue(throwError(() => ({
                response: { status: 500, statusText: 'Internal Server Error', data: { error: 'DB down' } },
                message: 'Request failed',
                status: 500,
                toString: () => 'AxiosError',
            })));

            const result = await service.functionHandler('crm_update', '{}', mockAssistant);

            expect(result).toContain('Function call failed');
            expect(result).toContain('500');
        });
    });
});
