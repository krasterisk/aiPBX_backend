import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'currency_history' })
export class CurrencyHistory extends Model<CurrencyHistory> {
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    declare id: number;

    @Column({ type: DataType.DATEONLY, allowNull: false })
    atDate: string;

    @Column({ type: DataType.STRING(8), allowNull: false })
    fromCurrency: string;

    @Column({ type: DataType.STRING(8), allowNull: false })
    toCurrency: string;

    @Column({ type: DataType.DECIMAL(18, 8), allowNull: false })
    rate: string;
}
