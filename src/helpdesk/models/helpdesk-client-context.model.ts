import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Table({ tableName: 'helpdesk_client_context', timestamps: false, createdAt: false })
export class HelpdeskClientContext extends Model<HelpdeskClientContext> {
    @ApiProperty()
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty({ description: 'Уникальный ключ клиента (inn или alfawebhook id)' })
    @Column({ type: DataType.STRING(128), allowNull: false, unique: true })
    clientKey: string;

    @ApiPropertyOptional()
    @Column({ type: DataType.STRING(128), allowNull: true })
    alfawebhookClientId: string | null;

    @ApiPropertyOptional()
    @Column({ type: DataType.STRING(16), allowNull: true })
    inn: string | null;

    @ApiProperty()
    @Column({ type: DataType.JSONB, allowNull: false, defaultValue: '{}' })
    contextJson: Record<string, unknown>;

    @ApiProperty()
    @Column({ type: DataType.TEXT, allowNull: false, defaultValue: '' })
    contextMarkdown: string;

    @ApiPropertyOptional()
    @Column({ type: DataType.TEXT, allowNull: true })
    contextMarkdownOverride: string | null;

    @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
    updatedAt: Date;
}
