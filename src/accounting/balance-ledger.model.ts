import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type BalanceLedgerDirection = 'credit' | 'debit';

export type BalanceLedgerSource =
    | 'stripe'
    | 'robokassa'
    | 'alfa_bank'
    | 'admin'
    | 'usage_realtime'
    | 'usage_analytics'
    | 'correction'
    | 'refund';

@Table({ tableName: 'balance_ledger' })
export class BalanceLedger extends Model<BalanceLedger> {
    @Column({ type: DataType.BIGINT, primaryKey: true, autoIncrement: true })
    declare id: number;

    @Column({ type: DataType.STRING(64), allowNull: false })
    userId: string;

    @Column({ type: DataType.STRING(16), allowNull: false })
    direction: BalanceLedgerDirection;

    @Column({ type: DataType.DECIMAL(14, 4), allowNull: false })
    amountUsd: string;

    @Column({ type: DataType.DECIMAL(14, 4), allowNull: false })
    balanceBeforeUsd: string;

    @Column({ type: DataType.DECIMAL(14, 4), allowNull: false })
    balanceAfterUsd: string;

    @Column({ type: DataType.STRING(32), allowNull: false })
    source: BalanceLedgerSource;

    @Column({ type: DataType.STRING(128), allowNull: true })
    externalId: string | null;

    @Column({ type: DataType.UUID, allowNull: true })
    documentId: string | null;

    @Column({ type: DataType.STRING(64), allowNull: true })
    paymentId: string | null;

    @Column({ type: DataType.JSON, allowNull: true })
    meta: Record<string, unknown> | null;
}
