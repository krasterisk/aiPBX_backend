import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

export interface OurOrganizationCreationAttrs {
    name: string;
    tin: string;
    address: string;
    kpp?: string | null;
    ogrn?: string | null;
    legalForm?: string | null;
    director?: string | null;
    isPrimary?: boolean;
    bankName?: string | null;
    bankBranchName?: string | null;
    bankBic?: string | null;
    bankAccount?: string | null;
    bankCorrAccount?: string | null;
    edoParticipantId?: string | null;
    sbisCertThumbprint?: string | null;
}

@Table({ tableName: 'our_organizations' })
export class OurOrganization extends Model<OurOrganization, OurOrganizationCreationAttrs> {
    @ApiProperty({ example: 'ООО «АйПиБиИкс»', description: 'Short name' })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: '7701234567', description: 'INN' })
    @Column({ type: DataType.STRING, allowNull: false })
    tin: string;

    @ApiProperty({ example: '123 Main St', description: 'Legal address' })
    @Column({ type: DataType.STRING, allowNull: false })
    address: string;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(9), allowNull: true })
    kpp: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(15), allowNull: true })
    ogrn: string | null;

    @ApiProperty({ required: false, description: 'ul | ip' })
    @Column({ type: DataType.STRING(8), allowNull: true })
    legalForm: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(255), allowNull: true })
    director: string | null;

    @ApiProperty({ example: true, description: 'Default issuer for new tenants' })
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    isPrimary: boolean;

    @ApiProperty({ required: false, description: 'Bank name for invoices' })
    @Column({ type: DataType.STRING(255), allowNull: true })
    bankName: string | null;

    @ApiProperty({ required: false, description: 'Bank branch label on invoice (defaults to bank name)' })
    @Column({ type: DataType.STRING(255), allowNull: true })
    bankBranchName: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(12), allowNull: true })
    bankBic: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(32), allowNull: true })
    bankAccount: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(32), allowNull: true })
    bankCorrAccount: string | null;

    @ApiProperty({ required: false, description: 'EDO participant id (maps to SBIS ИдентификаторАЯ)' })
    @Column({ type: DataType.STRING(128), allowNull: true })
    edoParticipantId: string | null;

    @ApiProperty({ required: false, description: 'Qualified signature thumbprint for outgoing EDO' })
    @Column({ type: DataType.STRING(64), allowNull: true })
    sbisCertThumbprint: string | null;
}
