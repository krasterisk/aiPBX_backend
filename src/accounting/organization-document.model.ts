import { Sequelize } from 'sequelize';
import { BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { Organization } from '../organizations/organizations.model';

const organizationDocumentIdDefault =
    process.env.DB_DIALECT === 'postgres'
        ? Sequelize.literal('gen_random_uuid()')
        : Sequelize.literal('UUID()');

export type OrganizationDocumentType =
    | 'invoice'
    | 'advance_invoice'
    | 'act'
    | 'sf'
    | 'upd';

export type OrganizationDocumentStatus =
    | 'issued'
    | 'paid'
    | 'sent_to_sbis'
    | 'accepted'
    | 'failed'
    | 'cancelled'
    | 'closed';

@Table({ tableName: 'organization_documents' })
export class OrganizationDocument extends Model<OrganizationDocument> {
    @ApiProperty()
    @PrimaryKey
    @Column({ type: DataType.UUID, defaultValue: organizationDocumentIdDefault })
    id: string;

    @ApiProperty()
    @Column({ type: DataType.STRING, allowNull: false })
    userId: string;

    @ApiProperty()
    @ForeignKey(() => Organization)
    @Column({ type: DataType.INTEGER, allowNull: false })
    organizationId: number;

    @ApiProperty()
    @Column({ type: DataType.STRING, allowNull: false })
    type: OrganizationDocumentType;

    @ApiProperty()
    @Column({ type: DataType.STRING, allowNull: false })
    number: string;

    @ApiProperty()
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'AI' })
    series: string;

    @ApiProperty()
    @Column({ type: DataType.DATEONLY, allowNull: false })
    documentDate: string;

    @ApiProperty({ required: false })
    @Column({ type: DataType.DATEONLY, allowNull: true })
    periodFrom: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.DATEONLY, allowNull: true })
    periodTo: string | null;

    @ApiProperty()
    @Column({ type: DataType.DECIMAL(14, 2), allowNull: false })
    amountRub: string;

    @ApiProperty({ required: false })
    @Column({ type: DataType.DECIMAL(14, 4), allowNull: true })
    amountUsd: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.DECIMAL(14, 6), allowNull: true })
    fxRate: string | null;

    @ApiProperty()
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'none' })
    vatMode: string;

    @ApiProperty()
    @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
    vatAmount: string;

    @ApiProperty()
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'issued' })
    status: OrganizationDocumentStatus;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING, allowNull: true })
    paymentId: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.JSON, allowNull: true })
    relatedAdvanceInvoiceIds: string[] | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING, allowNull: true })
    sbisId: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.TEXT, allowNull: true })
    sbisUrl: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING, allowNull: true })
    sbisDocNum: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING, allowNull: true })
    sbisStatus: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.TEXT, allowNull: true })
    sbisLastError: string | null;

    @ApiProperty()
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    sbisAttemptCount: number;

    @ApiProperty({ required: false })
    @Column({ type: DataType.TEXT, allowNull: true })
    pdfPath: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING, allowNull: true })
    externalTransactionId: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING, allowNull: true })
    idempotencyKey: string | null;

    @ApiProperty()
    @Column({ type: DataType.TEXT, allowNull: false })
    subject: string;

    @ApiProperty({ required: false })
    @Column({ type: DataType.UUID, allowNull: true })
    relatedInvoiceId: string | null;

    @BelongsTo(() => Organization)
    organization: Organization;
}
