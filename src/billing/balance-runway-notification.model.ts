import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from '../users/users.model';

interface BalanceRunwayNotificationCreationAttrs {
    ownerUserId: number;
    lastNotifiedAt: Date;
    lastForecastDays: number;
    lastDailyBurnUsd: number;
}

@Table({ tableName: 'balance_runway_notifications' })
export class BalanceRunwayNotification extends Model<
    BalanceRunwayNotification,
    BalanceRunwayNotificationCreationAttrs
> {
    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, primaryKey: true })
    ownerUserId: number;

    @BelongsTo(() => User, { foreignKey: 'ownerUserId', onDelete: 'CASCADE' })
    owner: User;

    @Column({ type: DataType.DATE, allowNull: false })
    lastNotifiedAt: Date;

    @Column({ type: DataType.FLOAT, allowNull: false })
    lastForecastDays: number;

    @Column({ type: DataType.FLOAT, allowNull: false })
    lastDailyBurnUsd: number;
}
