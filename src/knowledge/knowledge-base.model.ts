import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../users/users.model';

@Table({ tableName: 'knowledgeBases', timestamps: true })
export class KnowledgeBase extends Model<KnowledgeBase> {
    @ApiProperty({ example: 1, description: 'Knowledge Base ID' })
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty({ example: 'Прайс-лист компании', description: 'Knowledge base name' })
    @Column({ type: DataType.STRING(255), allowNull: false })
    name: string;

    @ApiProperty({ description: 'Description of the knowledge base' })
    @Column({ type: DataType.TEXT, allowNull: true })
    description: string;

    @ApiProperty({ example: 5, description: 'Number of documents' })
    @Column({ type: DataType.INTEGER, defaultValue: 0 })
    documentsCount: number;

    @ApiProperty({ example: 42, description: 'Total number of text chunks' })
    @Column({ type: DataType.INTEGER, defaultValue: 0 })
    chunksCount: number;

    @ApiProperty({ example: 'active', description: 'Status: active, processing' })
    @Column({ type: DataType.STRING(50), defaultValue: 'active' })
    status: string;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    userId: number;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;
}
