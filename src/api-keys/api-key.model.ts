import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../users/users.model';

@Table({ tableName: 'api_keys', timestamps: true })
export class ApiKey extends Model<ApiKey> {

    @ApiProperty({ example: 1, description: 'ID' })
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty({ example: 'KrAsterisk production key', description: 'Human-readable label' })
    @Column({ type: DataType.STRING(255), allowNull: false })
    name: string;

    /**
     * SHA-256 hash of the raw Bearer token.
     * The raw token is shown to the user only once on creation.
     */
    @Column({ type: DataType.STRING(64), allowNull: false, unique: true })
    tokenHash: string;

    /**
     * Optional token prefix shown in UI for identification (e.g. "aipbx_k7Xq...").
     * Does NOT contain the actual secret.
     */
    @ApiProperty({ example: 'aipbx_k7Xq', description: 'Token prefix for UI display' })
    @Column({ type: DataType.STRING(16), allowNull: true })
    tokenPrefix: string;

    /**
     * JSON array of allowed scopes.
     * Supported values: 'chat:message', 'models:read'.
     * Null = all scopes allowed.
     */
    @ApiProperty({
        example: ['chat:message', 'models:read'],
        description: 'Allowed scopes. Null = all scopes.',
    })
    @Column({ type: DataType.JSON, allowNull: true })
    scopes: string[] | null;

    @ApiProperty({ description: 'Expiry timestamp (null = never)' })
    @Column({ type: DataType.DATE, allowNull: true })
    expiresAt: Date | null;

    @ApiProperty({ description: 'Last usage timestamp' })
    @Column({ type: DataType.DATE, allowNull: true })
    lastUsedAt: Date | null;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    userId: number;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;
}
