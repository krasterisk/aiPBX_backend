import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

@Table({ tableName: 'document_counters' })
export class DocumentCounter extends Model<DocumentCounter> {
    @PrimaryKey
    @Column({ type: DataType.INTEGER })
    year: number;

    @PrimaryKey
    @Column({ type: DataType.STRING(32) })
    docType: string;

    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    lastNumber: number;
}
