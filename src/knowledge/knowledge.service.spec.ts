import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeBase } from './knowledge-base.model';
import { KnowledgeDocument } from './knowledge-document.model';
import { KnowledgeChunk } from './knowledge-chunk.model';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { ParserService } from './parser.service';
import { Sequelize } from 'sequelize-typescript';

describe('KnowledgeService', () => {
    let service: KnowledgeService;
    let mockKbModel: any;
    let mockDocModel: any;
    let mockChunkModel: any;
    let mockSequelize: any;
    let mockEmbeddingService: any;
    let mockChunkingService: any;
    let mockParserService: any;

    const mockKb = {
        id: 1,
        userId: 1,
        name: 'Test KB',
        description: 'Test knowledge base',
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
    };

    const mockDoc = {
        id: 1,
        knowledgeBaseId: 1,
        userId: 1,
        fileName: 'test.pdf',
        fileType: 'pdf',
        fileSize: 1024,
        status: 'processing',
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        mockKbModel = {
            create: jest.fn().mockResolvedValue(mockKb),
            findAll: jest.fn().mockResolvedValue([mockKb]),
            findByPk: jest.fn().mockResolvedValue(mockKb),
            update: jest.fn().mockResolvedValue([1]),
        };
        mockDocModel = {
            create: jest.fn().mockResolvedValue(mockDoc),
            findAll: jest.fn().mockResolvedValue([mockDoc]),
            findByPk: jest.fn().mockResolvedValue(mockDoc),
            count: jest.fn().mockResolvedValue(1),
        };
        mockChunkModel = {
            count: jest.fn().mockResolvedValue(5),
        };
        mockSequelize = {
            query: jest.fn().mockResolvedValue([]),
            transaction: jest.fn().mockResolvedValue({
                commit: jest.fn(),
                rollback: jest.fn(),
            }),
            getDialect: jest.fn().mockReturnValue('postgres'),
        };
        mockEmbeddingService = {
            embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
            embedBatch: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
            isAvailable: jest.fn().mockReturnValue(true),
        };
        mockChunkingService = {
            chunkText: jest.fn().mockReturnValue([
                { content: 'Chunk 1 content', metadata: { fileName: 'test.pdf', chunkIndex: 0 } },
            ]),
        };
        mockParserService = {
            parseFile: jest.fn().mockResolvedValue('Extracted text from file'),
            parseUrl: jest.fn().mockResolvedValue('Extracted text from URL'),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                KnowledgeService,
                { provide: getModelToken(KnowledgeBase), useValue: mockKbModel },
                { provide: getModelToken(KnowledgeDocument), useValue: mockDocModel },
                { provide: getModelToken(KnowledgeChunk), useValue: mockChunkModel },
                { provide: Sequelize, useValue: mockSequelize },
                { provide: EmbeddingService, useValue: mockEmbeddingService },
                { provide: ChunkingService, useValue: mockChunkingService },
                { provide: ParserService, useValue: mockParserService },
            ],
        }).compile();

        service = module.get<KnowledgeService>(KnowledgeService);
    });

    // ═══════════════════════════════════════════════════════════════════
    // Knowledge Base CRUD
    // ═══════════════════════════════════════════════════════════════════

    describe('createKnowledgeBase', () => {
        it('should create KB with userId, name, and description', async () => {
            await service.createKnowledgeBase(1, 'My KB', 'Test desc');

            expect(mockKbModel.create).toHaveBeenCalledWith({
                userId: 1,
                name: 'My KB',
                description: 'Test desc',
            });
        });
    });

    describe('getKnowledgeBases', () => {
        it('should return KBs filtered by userId, ordered by createdAt DESC', async () => {
            const result = await service.getKnowledgeBases(1);

            expect(mockKbModel.findAll).toHaveBeenCalledWith({
                where: { userId: 1 },
                order: [['createdAt', 'DESC']],
            });
            expect(result).toEqual([mockKb]);
        });
    });

    describe('updateKnowledgeBase', () => {
        it('should update name and description', async () => {
            await service.updateKnowledgeBase(1, 1, { name: 'Updated', description: 'New desc' });

            expect(mockKb.update).toHaveBeenCalledWith({ name: 'Updated', description: 'New desc' });
        });

        it('should throw when KB not found', async () => {
            mockKbModel.findByPk.mockResolvedValue(null);

            await expect(
                service.updateKnowledgeBase(999, 1, { name: 'Test' }),
            ).rejects.toThrow('Knowledge base not found');
        });

        it('should throw when userId does not match', async () => {
            mockKbModel.findByPk.mockResolvedValue({ ...mockKb, userId: 2 });

            await expect(
                service.updateKnowledgeBase(1, 1, { name: 'Test' }),
            ).rejects.toThrow('Knowledge base not found');
        });
    });

    describe('deleteKnowledgeBase', () => {
        it('should destroy the KB', async () => {
            await service.deleteKnowledgeBase(1, 1);

            expect(mockKb.destroy).toHaveBeenCalled();
        });

        it('should throw when KB not found', async () => {
            mockKbModel.findByPk.mockResolvedValue(null);

            await expect(service.deleteKnowledgeBase(999, 1)).rejects.toThrow('Knowledge base not found');
        });

        it('should throw when userId mismatches', async () => {
            mockKbModel.findByPk.mockResolvedValue({ ...mockKb, userId: 999 });

            await expect(service.deleteKnowledgeBase(1, 1)).rejects.toThrow('Knowledge base not found');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Documents
    // ═══════════════════════════════════════════════════════════════════

    describe('getDocuments', () => {
        it('should return docs for a KB ordered by createdAt DESC', async () => {
            const result = await service.getDocuments(1);

            expect(mockDocModel.findAll).toHaveBeenCalledWith({
                where: { knowledgeBaseId: 1 },
                order: [['createdAt', 'DESC']],
            });
            expect(result).toEqual([mockDoc]);
        });
    });

    describe('uploadFile', () => {
        it('should create document record with processing status', async () => {
            const file = {
                buffer: Buffer.from('fake pdf content'),
                originalname: 'report.pdf',
                mimetype: 'application/pdf',
                size: 2048,
            };

            const result = await service.uploadFile(1, 1, file);

            expect(mockDocModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    knowledgeBaseId: 1,
                    userId: 1,
                    fileName: 'report.pdf',
                    fileType: 'pdf',
                    fileSize: 2048,
                    status: 'processing',
                }),
            );
            expect(result.status).toBe('processing');
        });
    });

    describe('addUrl', () => {
        it('should create document from URL with hostname+path as filename', async () => {
            const result = await service.addUrl(1, 1, 'https://example.com/docs/guide');

            expect(mockDocModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileName: 'example.com/docs/guide',
                    fileType: 'url',
                    sourceUrl: 'https://example.com/docs/guide',
                    status: 'processing',
                }),
            );
        });
    });

    describe('deleteDocument', () => {
        it('should destroy document and update KB counts', async () => {
            await service.deleteDocument(1, 1);

            expect(mockDoc.destroy).toHaveBeenCalled();
        });

        it('should throw when document not found', async () => {
            mockDocModel.findByPk.mockResolvedValue(null);

            await expect(service.deleteDocument(999, 1)).rejects.toThrow('Document not found');
        });

        it('should throw when userId mismatches', async () => {
            mockDocModel.findByPk.mockResolvedValue({ ...mockDoc, userId: 999 });

            await expect(service.deleteDocument(1, 1)).rejects.toThrow('Document not found');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // RAG Search
    // ═══════════════════════════════════════════════════════════════════

    describe('search', () => {
        it('should delegate to searchMultiple with single KB ID', async () => {
            const spy = jest.spyOn(service, 'searchMultiple').mockResolvedValue([]);

            await service.search(1, 'test query', 3);

            expect(spy).toHaveBeenCalledWith([1], 'test query', 3);
        });
    });

    describe('searchMultiple', () => {
        it('should return empty when kbIds is empty', async () => {
            const result = await service.searchMultiple([], 'test');

            expect(result).toEqual([]);
            expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
        });

        it('should return empty when embedding service unavailable', async () => {
            mockEmbeddingService.isAvailable.mockReturnValue(false);

            const result = await service.searchMultiple([1], 'test');

            expect(result).toEqual([]);
        });

        it('should embed query and execute pgvector similarity search', async () => {
            mockSequelize.getDialect.mockReturnValue('postgres');
            mockSequelize.query.mockResolvedValue([
                { content: 'Result 1', similarity: '0.85', metadata: {}, documentId: 1 },
                { content: 'Result 2', similarity: '0.72', metadata: {}, documentId: 2 },
            ]);

            const result = await service.searchMultiple([1, 2], 'What is X?', 5);

            expect(mockEmbeddingService.embed).toHaveBeenCalledWith('What is X?');
            expect(mockSequelize.query).toHaveBeenCalledWith(
                expect.stringContaining('knowledgeChunks'),
                expect.objectContaining({
                    replacements: expect.objectContaining({
                        kbIds: [1, 2],
                        limit: 5,
                    }),
                }),
            );
            expect(result).toHaveLength(2);
            expect(result[0].similarity).toBe(0.85);
            expect(result[0].content).toBe('Result 1');
        });

        it('should fallback to JS cosine similarity for MySQL', async () => {
            mockSequelize.getDialect.mockReturnValue('mysql');
            mockSequelize.query.mockResolvedValue([
                { content: 'MySQL result', embedding: JSON.stringify([0.1, 0.2, 0.3]), metadata: '{}', documentId: 1 },
            ]);

            const result = await service.searchMultiple([1], 'test');

            expect(result).toHaveLength(1);
            expect(result[0].content).toBe('MySQL result');
            expect(result[0].similarity).toBeGreaterThan(0);
        });
    });
});
