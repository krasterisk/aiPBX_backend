import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

@Table({ tableName: 'helpdesk_settings', timestamps: false, createdAt: false })
export class HelpdeskSettings extends Model<HelpdeskSettings> {
    @ApiProperty()
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty({ type: [String], description: 'Email для уведомлений о новых заявках' })
    @Column({ type: DataType.JSONB, allowNull: false, defaultValue: '[]' })
    notificationEmails: string[];

    @ApiProperty({ type: [String], description: 'Telegram chat ID' })
    @Column({ type: DataType.JSONB, allowNull: false, defaultValue: '[]' })
    notificationTelegramChatIds: string[];

    @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
    updatedAt: Date;
}
