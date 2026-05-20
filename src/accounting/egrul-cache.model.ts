import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

@Table({ tableName: 'egrul_cache', timestamps: true, updatedAt: false })
export class EgrulCache extends Model<EgrulCache> {
    @PrimaryKey
    @Column({ type: DataType.STRING(12), allowNull: false })
    inn: string;

    @Column({ type: DataType.STRING(9), allowNull: true })
    kpp: string | null;

    @Column({ type: DataType.JSON, allowNull: false })
    payload: Record<string, unknown>;

    @Column({ type: DataType.STRING(32), allowNull: false, defaultValue: 'saby_edo' })
    source: string;

    @Column({ type: DataType.DATE, allowNull: false })
    fetchedAt: Date;

    @Column({ type: DataType.DATE, allowNull: false })
    expiresAt: Date;
}
