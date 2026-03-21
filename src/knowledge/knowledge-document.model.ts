import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../users/users.model';
import { KnowledgeBase } from './knowledge-base.model';

@Table({ tableName: 'knowledgeDocuments', timestamps: true })
export class KnowledgeDocument extends Model<KnowledgeDocument> {
    @ApiProperty({ example: 1, description: 'Document ID' })
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty({ example: 'price-list.pdf', description: 'Original file name' })
    @Column({ type: DataType.STRING(500), allowNull: false })
    fileName: string;

    @ApiProperty({ example: 'pdf', description: 'File type: pdf, docx, txt, url' })
    @Column({ type: DataType.STRING(50), allowNull: true })
    fileType: string;

    @ApiProperty({ example: 102400, description: 'File size in bytes' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    fileSize: number;

    @ApiProperty({ example: 'https://example.com/prices', description: 'Source URL if added by URL' })
    @Column({ type: DataType.STRING(2000), allowNull: true })
    sourceUrl: string;

    @ApiProperty({ example: 42, description: 'Number of text chunks created' })
    @Column({ type: DataType.INTEGER, defaultValue: 0 })
    chunksCount: number;

    @ApiProperty({ example: 'ready', description: 'Processing status: processing, ready, error' })
    @Column({ type: DataType.STRING(50), defaultValue: 'processing' })
    status: string;

    @ApiProperty({ description: 'Error message if processing failed' })
    @Column({ type: DataType.TEXT, allowNull: true })
    errorMessage: string;

    @ForeignKey(() => KnowledgeBase)
    @Column({ type: DataType.INTEGER, allowNull: false })
    knowledgeBaseId: number;

    @BelongsTo(() => KnowledgeBase, { onDelete: 'CASCADE' })
    knowledgeBase: KnowledgeBase;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    userId: number;

    @BelongsTo(() => User)
    user: User;
}
