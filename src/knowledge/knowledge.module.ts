import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { KnowledgeBase } from './knowledge-base.model';
import { KnowledgeDocument } from './knowledge-document.model';
import { KnowledgeChunk } from './knowledge-chunk.model';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { ParserService } from './parser.service';

@Module({
    imports: [
        SequelizeModule.forFeature([KnowledgeBase, KnowledgeDocument, KnowledgeChunk]),
    ],
    controllers: [KnowledgeController],
    providers: [
        KnowledgeService,
        EmbeddingService,
        ChunkingService,
        ParserService,
    ],
    exports: [KnowledgeService, EmbeddingService],
})
export class KnowledgeModule {}
