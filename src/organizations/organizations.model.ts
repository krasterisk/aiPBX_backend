import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";

interface OrganizationCreationAttrs {
    userId: number;
    name: string;
    tin: string;
    address: string;
    kpp?: string | null;
    ogrn?: string | null;
    legalForm?: string | null;
    director?: string | null;
    email?: string | null;
    phone?: string | null;
    bankAccount?: string | null;
    bankBic?: string | null;
    bankName?: string | null;
    subject?: string | null;
}

@Table({ tableName: 'organizations' })
export class Organization extends Model<Organization, OrganizationCreationAttrs> {

    @ApiProperty({ example: 1, description: "User ID" })
    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    userId: number;

    @ApiProperty({ example: 'My Corp', description: "Organization Name" })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: '1234567890', description: "Tax Identification Number (TIN/INN)" })
    @Column({ type: DataType.STRING, allowNull: false })
    tin: string;

    @ApiProperty({ example: '123 Main St', description: "Address" })
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

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(255), allowNull: true })
    email: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(32), allowNull: true })
    phone: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(32), allowNull: true })
    bankAccount: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(12), allowNull: true })
    bankBic: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.STRING(255), allowNull: true })
    bankName: string | null;

    @ApiProperty({ required: false, description: 'Default service name for invoices / closing docs' })
    @Column({ type: DataType.TEXT, allowNull: true })
    subject: string | null;

    @ApiProperty({ required: false })
    @Column({ type: DataType.DATE, allowNull: true })
    alfawebhookSyncedAt: Date | null;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;
}
