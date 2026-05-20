import { Column, DataType, Model, PrimaryKey, Table, AutoIncrement, Index } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

export type LegalDocumentKind = 'public_offer' | 'personal_data_policy';

export type LegalAcceptanceSource = 'login' | 'signup' | 'activation' | 'manual';

@Table({ tableName: 'legal_acceptances', timestamps: true, createdAt: 'acceptedAt', updatedAt: 'updatedAt' })
export class LegalAcceptance extends Model<LegalAcceptance> {
    @ApiProperty()
    @PrimaryKey
    @AutoIncrement
    @Column({ type: DataType.BIGINT })
    id: number;

    @ApiProperty({ description: 'User id (string for compatibility with users.id)' })
    @Index('legal_acceptances_user_idx')
    @Column({ type: DataType.STRING(64), allowNull: false })
    userId: string;

    @ApiProperty()
    @Column({ type: DataType.STRING(32), allowNull: false })
    documentKind: LegalDocumentKind;

    @ApiProperty({ description: 'YYYY-MM-DD' })
    @Column({ type: DataType.STRING(32), allowNull: false })
    documentVersion: string;

    @ApiProperty({ description: 'SHA-256 of document content (or version-string fallback)' })
    @Column({ type: DataType.STRING(128), allowNull: false })
    contentHash: string;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(64), allowNull: true })
    ip: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(512), allowNull: true })
    userAgent: string | null;

    @ApiProperty({ description: 'login | signup | activation | manual' })
    @Column({ type: DataType.STRING(32), allowNull: false, defaultValue: 'login' })
    source: LegalAcceptanceSource;
}
