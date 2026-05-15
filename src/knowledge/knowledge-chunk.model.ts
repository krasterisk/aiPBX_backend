import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { KnowledgeBase } from './knowledge-base.model';
import { KnowledgeDocument } from './knowledge-document.model';

@Table({ tableName: 'knowledgeChunks', timestamps: true, updatedAt: false })
export class KnowledgeChunk extends Model<KnowledgeChunk> {
    @ApiProperty({ example: 1, description: 'Chunk ID' })
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty({ description: 'Text content of the chunk' })
    @Column({ type: DataType.TEXT, allowNull: false })
    content: string;

    // Note: embedding is stored as vector(768) in PostgreSQL via pgvector.
    // Sequelize doesn't natively support the vector type, so we use raw SQL
    // for insert/search operations. This field is not mapped here.

    @ApiProperty({ description: 'Metadata (page, heading, position)' })
    @Column({ type: DataType.JSON, allowNull: true })
    metadata: Record<string, any>;

    @ForeignKey(() => KnowledgeDocument)
    @Column({ type: DataType.INTEGER, allowNull: false })
    documentId: number;

    @BelongsTo(() => KnowledgeDocument, { onDelete: 'CASCADE' })
    document: KnowledgeDocument;

    @ForeignKey(() => KnowledgeBase)
    @Column({ type: DataType.INTEGER, allowNull: false })
    knowledgeBaseId: number;

    @BelongsTo(() => KnowledgeBase, { onDelete: 'CASCADE' })
    knowledgeBase: KnowledgeBase;
}
