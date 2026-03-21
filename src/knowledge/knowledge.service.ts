import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { KnowledgeBase } from './knowledge-base.model';
import { KnowledgeDocument } from './knowledge-document.model';
import { KnowledgeChunk } from './knowledge-chunk.model';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { ParserService } from './parser.service';

export interface SearchResult {
    content: string;
    similarity: number;
    metadata: Record<string, any>;
    documentId: number;
}

/**
 * Knowledge Service — orchestrates KB management, document processing, and RAG search.
 *
 * KB lifecycle: Create KB → Upload files/URLs → Parse → Chunk → Embed → Store in pgvector
 * Search: Query → Embed → pgvector similarity → Top K chunks
 */
@Injectable()
export class KnowledgeService {
    private readonly logger = new Logger(KnowledgeService.name);

    constructor(
        @InjectModel(KnowledgeBase) private kbModel: typeof KnowledgeBase,
        @InjectModel(KnowledgeDocument) private documentModel: typeof KnowledgeDocument,
        @InjectModel(KnowledgeChunk) private chunkModel: typeof KnowledgeChunk,
        private readonly sequelize: Sequelize,
        private readonly embeddingService: EmbeddingService,
        private readonly chunkingService: ChunkingService,
        private readonly parserService: ParserService,
    ) {}

    // ── Knowledge Base CRUD ─────────────────────────────────

    async createKnowledgeBase(userId: number, name: string, description?: string): Promise<KnowledgeBase> {
        return this.kbModel.create({ userId, name, description } as any);
    }

    async getKnowledgeBases(userId: number): Promise<KnowledgeBase[]> {
        return this.kbModel.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
        });
    }

    async getKnowledgeBaseById(id: number): Promise<KnowledgeBase | null> {
        return this.kbModel.findByPk(id);
    }

    async updateKnowledgeBase(id: number, userId: number, data: { name?: string; description?: string }): Promise<KnowledgeBase> {
        const kb = await this.kbModel.findByPk(id);
        if (!kb || kb.userId !== userId) throw new Error('Knowledge base not found');
        await kb.update(data);
        return kb;
    }

    async deleteKnowledgeBase(id: number, userId: number): Promise<void> {
        const kb = await this.kbModel.findByPk(id);
        if (!kb || kb.userId !== userId) throw new Error('Knowledge base not found');
        await kb.destroy(); // cascades to documents → chunks
        this.logger.log(`Knowledge base ${id} deleted (${kb.name})`);
    }

    // ── Document Management ─────────────────────────────────

    async getDocuments(knowledgeBaseId: number): Promise<KnowledgeDocument[]> {
        return this.documentModel.findAll({
            where: { knowledgeBaseId },
            order: [['createdAt', 'DESC']],
        });
    }

    async uploadFile(
        knowledgeBaseId: number,
        userId: number,
        file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    ): Promise<KnowledgeDocument> {
        const fileType = this.detectFileType(file.originalname, file.mimetype);

        const doc = await this.documentModel.create({
            knowledgeBaseId,
            userId,
            fileName: file.originalname,
            fileType,
            fileSize: file.size,
            status: 'processing',
        } as any);

        // Process asynchronously
        this.processDocument(doc, knowledgeBaseId, async () => {
            return this.parserService.parseFile(file.buffer, fileType, file.originalname);
        }).catch(err => {
            this.logger.error(`[Doc ${doc.id}] Processing failed: ${err.message}`);
        });

        return doc;
    }

    async addUrl(
        knowledgeBaseId: number,
        userId: number,
        url: string,
    ): Promise<KnowledgeDocument> {
        const doc = await this.documentModel.create({
            knowledgeBaseId,
            userId,
            fileName: new URL(url).hostname + new URL(url).pathname,
            fileType: 'url',
            sourceUrl: url,
            status: 'processing',
        } as any);

        this.processDocument(doc, knowledgeBaseId, async () => {
            return this.parserService.parseUrl(url);
        }).catch(err => {
            this.logger.error(`[Doc ${doc.id}] URL processing failed: ${err.message}`);
        });

        return doc;
    }

    async deleteDocument(documentId: number, userId: number): Promise<void> {
        const doc = await this.documentModel.findByPk(documentId);
        if (!doc || doc.userId !== userId) throw new Error('Document not found');
        const kbId = doc.knowledgeBaseId;
        await doc.destroy();
        await this.updateKbCounts(kbId);
        this.logger.log(`Document ${documentId} deleted (${doc.fileName})`);
    }

    // ── RAG Search ──────────────────────────────────────────

    /**
     * Search a single knowledge base for relevant chunks.
     */
    async search(knowledgeBaseId: number, query: string, limit = 5): Promise<SearchResult[]> {
        return this.searchMultiple([knowledgeBaseId], query, limit);
    }

    /**
     * Search across multiple knowledge bases (used by tool handler).
     */
    async searchMultiple(knowledgeBaseIds: number[], query: string, limit = 5): Promise<SearchResult[]> {
        if (!knowledgeBaseIds.length || !this.embeddingService.isAvailable()) {
            return [];
        }

        const queryEmbedding = await this.embeddingService.embed(query);

        if (this.isPostgres) {
            // PostgreSQL + pgvector: native cosine distance
            const vectorStr = `[${queryEmbedding.join(',')}]`;
            const results = await this.sequelize.query(
                `SELECT
                    id, content, metadata, "documentId",
                    1 - (embedding <=> :vector::vector) AS similarity
                FROM "knowledgeChunks"
                WHERE "knowledgeBaseId" IN (:kbIds)
                ORDER BY embedding <=> :vector::vector
                LIMIT :limit`,
                {
                    replacements: { vector: vectorStr, kbIds: knowledgeBaseIds, limit },
                    type: 'SELECT' as any,
                },
            ) as any[];

            return results.map((r: any) => ({
                content: r.content,
                similarity: parseFloat(r.similarity),
                metadata: r.metadata || {},
                documentId: r.documentId,
            }));
        }

        // MySQL: fetch chunks and compute cosine similarity in JS
        const results = await this.sequelize.query(
            'SELECT id, content, metadata, `documentId`, embedding FROM `knowledgeChunks` WHERE `knowledgeBaseId` IN (:kbIds)',
            {
                replacements: { kbIds: knowledgeBaseIds },
                type: 'SELECT' as any,
            },
        ) as any[];

        const scored = results.map((r: any) => {
            let emb: number[] = [];
            try {
                emb = typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding;
            } catch { /* ignore */ }
            return {
                ...r,
                similarity: emb.length ? this.cosineSimilarity(queryEmbedding, emb) : 0,
            };
        });
        scored.sort((a: any, b: any) => b.similarity - a.similarity);

        return scored.slice(0, limit).map((r: any) => ({
            content: r.content,
            similarity: r.similarity,
            metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
            documentId: r.documentId,
        }));
    }

    // ── Internal Processing ─────────────────────────────────

    private async processDocument(
        doc: KnowledgeDocument,
        knowledgeBaseId: number,
        textExtractor: () => Promise<string>,
    ): Promise<void> {
        try {
            this.logger.log(`[Doc ${doc.id}] Extracting text from ${doc.fileType}...`);
            const text = await textExtractor();

            if (!text || text.trim().length < 10) {
                throw new Error('Extracted text is too short or empty');
            }

            this.logger.log(`[Doc ${doc.id}] Extracted ${text.length} characters`);

            const chunks = this.chunkingService.chunkText(text, {
                documentId: doc.id,
                fileName: doc.fileName,
            });

            if (chunks.length === 0) {
                throw new Error('No chunks generated from text');
            }

            this.logger.log(`[Doc ${doc.id}] Created ${chunks.length} chunks`);

            const texts = chunks.map(c => c.content);
            const embeddings = await this.embeddingService.embedBatch(texts);

            this.logger.log(`[Doc ${doc.id}] Generated ${embeddings.length} embeddings`);

            const transaction = await this.sequelize.transaction();
            try {
                for (let i = 0; i < chunks.length; i++) {
                    const metadataStr = JSON.stringify(chunks[i].metadata);
                    if (this.isPostgres) {
                        const vectorStr = `[${embeddings[i].join(',')}]`;
                        await this.sequelize.query(
                            `INSERT INTO "knowledgeChunks"
                                ("documentId", "knowledgeBaseId", content, embedding, metadata, "createdAt")
                            VALUES
                                (:documentId, :knowledgeBaseId, :content, :vector::vector, :metadata::jsonb, NOW())`,
                            {
                                replacements: {
                                    documentId: doc.id, knowledgeBaseId,
                                    content: chunks[i].content,
                                    vector: vectorStr, metadata: metadataStr,
                                },
                                transaction,
                            },
                        );
                    } else {
                        const vectorJson = JSON.stringify(embeddings[i]);
                        await this.sequelize.query(
                            'INSERT INTO `knowledgeChunks` (`documentId`, `knowledgeBaseId`, content, embedding, metadata, `createdAt`) VALUES (:documentId, :knowledgeBaseId, :content, :vector, :metadata, NOW())',
                            {
                                replacements: {
                                    documentId: doc.id, knowledgeBaseId,
                                    content: chunks[i].content,
                                    vector: vectorJson, metadata: metadataStr,
                                },
                                transaction,
                            },
                        );
                    }
                }

                await doc.update(
                    { status: 'ready', chunksCount: chunks.length },
                    { transaction },
                );

                await transaction.commit();
                await this.updateKbCounts(knowledgeBaseId);
                this.logger.log(`[Doc ${doc.id}] Processing complete: ${chunks.length} chunks stored`);
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } catch (err) {
            this.logger.error(`[Doc ${doc.id}] Processing failed: ${err.message}`);
            await doc.update({ status: 'error', errorMessage: err.message });
        }
    }

    /**
     * Update document and chunk counts on the KB record.
     */
    private async updateKbCounts(knowledgeBaseId: number): Promise<void> {
        try {
            const docsCount = await this.documentModel.count({ where: { knowledgeBaseId } });
            const chunksCount = await this.chunkModel.count({ where: { knowledgeBaseId } });
            await this.kbModel.update(
                { documentsCount: docsCount, chunksCount },
                { where: { id: knowledgeBaseId } },
            );
        } catch (e) {
            this.logger.warn(`Failed to update KB counts: ${e.message}`);
        }
    }

    private detectFileType(filename: string, mimetype: string): string {
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext === 'pdf' || mimetype === 'application/pdf') return 'pdf';
        if (ext === 'docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
        if (ext === 'xlsx' || mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
        if (ext === 'xls' || mimetype === 'application/vnd.ms-excel') return 'xls';
        if (ext === 'csv' || mimetype === 'text/csv') return 'csv';
        if (ext === 'txt' || ext === 'md' || mimetype?.startsWith('text/')) return 'txt';
        throw new Error(`Unsupported file type: ${ext} (${mimetype})`);
    }

    private get isPostgres(): boolean {
        return (this.sequelize.getDialect() as string) === 'postgres';
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length || a.length === 0) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }
}
