import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './users.model';

export type InvoiceAmountMode = 'fixed' | 'average_monthly';

interface BalanceThresholdAlertCreationAttrs {
    ownerUserId: number;
    limitAmount: number;
    emails: string[];
    notifyUserIds?: number[];
    sendInvoice?: boolean;
    organizationId?: number | null;
    invoiceAmountMode?: InvoiceAmountMode;
    invoiceAmountRub?: number | null;
    sendViaEdo?: boolean;
}

@Table({ tableName: 'balance_threshold_alerts' })
export class BalanceThresholdAlert extends Model<BalanceThresholdAlert, BalanceThresholdAlertCreationAttrs> {
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    declare id: number;

    @ApiProperty({ example: 1, description: 'Tenant owner user id' })
    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    ownerUserId: number;

    @BelongsTo(() => User, { foreignKey: 'ownerUserId', onDelete: 'CASCADE' })
    owner: User;

    @ApiProperty({ example: 100, description: 'Balance threshold (USD, same as user.balance)' })
    @Column({ type: DataType.FLOAT, allowNull: false })
    limitAmount: number;

    @ApiProperty({ example: '["a@b.com"]' })
    @Column({ type: DataType.JSON, allowNull: false, defaultValue: [] })
    emails: string[];

    @ApiProperty({ example: '[1,2]' })
    @Column({ type: DataType.JSON, allowNull: false, defaultValue: [] })
    notifyUserIds: number[];

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    sendInvoice: boolean;

    @Column({ type: DataType.INTEGER, allowNull: true })
    organizationId: number | null;

    @Column({ type: DataType.STRING(32), allowNull: false, defaultValue: 'fixed' })
    invoiceAmountMode: InvoiceAmountMode;

    @Column({ type: DataType.FLOAT, allowNull: true })
    invoiceAmountRub: number | null;

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    sendViaEdo: boolean;

    @Column({ type: DataType.DATE, allowNull: true })
    lastTriggeredAt: Date | null;
}
