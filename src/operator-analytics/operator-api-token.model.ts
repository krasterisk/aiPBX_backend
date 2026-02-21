import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

interface OperatorApiTokenCreationAttrs {
    token: string;
    userId: string;
    name: string;
    projectId?: number;
}

@Table({ tableName: 'operator_api_tokens' })
export class OperatorApiToken extends Model<OperatorApiToken, OperatorApiTokenCreationAttrs> {

    @ApiProperty({ example: 1, description: 'Primary key' })
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: 'oa_a1b2c3d4e5f6', description: 'API token (hashed)' })
    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    token: string;

    @ApiProperty({ example: '5', description: 'Owner user ID' })
    @Column({ type: DataType.STRING, allowNull: false })
    userId: string;

    @ApiProperty({ example: 'My integration', description: 'Token name' })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: 1, description: 'Linked project ID (optional)' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    projectId: number;

    @ApiProperty({ example: true, description: 'Is token active' })
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
    isActive: boolean;

    @ApiProperty({ description: 'Last used timestamp' })
    @Column({ type: DataType.DATE, allowNull: true })
    lastUsedAt: Date;
}
