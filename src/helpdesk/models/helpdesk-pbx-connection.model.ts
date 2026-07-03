import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Table({ tableName: 'helpdesk_pbx_connections', timestamps: true })
export class HelpdeskPbxConnection extends Model<HelpdeskPbxConnection> {
    @ApiProperty()
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty()
    @Column({ type: DataType.STRING(128), allowNull: false })
    alfawebhookClientId: string;

    @ApiProperty()
    @Column({ type: DataType.STRING(512), allowNull: false })
    url: string;

    @Column({ type: DataType.TEXT, allowNull: false })
    apiKeyEncrypted: string;

    @ApiProperty({ example: 'cloud' })
    @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'cloud' })
    type: string;

    @ApiPropertyOptional()
    @Column({ type: DataType.STRING(255), allowNull: true })
    label: string | null;
}
