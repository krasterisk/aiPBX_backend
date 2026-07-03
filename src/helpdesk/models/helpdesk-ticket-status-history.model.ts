import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HelpdeskTicket } from './helpdesk-ticket.model';

@Table({ tableName: 'helpdesk_ticket_status_history', timestamps: false, updatedAt: false })
export class HelpdeskTicketStatusHistory extends Model<HelpdeskTicketStatusHistory> {
    @ApiProperty()
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ForeignKey(() => HelpdeskTicket)
    @Column({ type: DataType.INTEGER, allowNull: false })
    ticketId: number;

    @ApiPropertyOptional()
    @Column({ type: DataType.STRING(32), allowNull: true })
    fromStatus: string | null;

    @ApiProperty()
    @Column({ type: DataType.STRING(32), allowNull: false })
    toStatus: string;

    @ApiPropertyOptional()
    @Column({ type: DataType.INTEGER, allowNull: true })
    changedByUserId: number | null;

    @ApiPropertyOptional()
    @Column({ type: DataType.TEXT, allowNull: true })
    note: string | null;

    @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
    createdAt: Date;

    @BelongsTo(() => HelpdeskTicket, { onDelete: 'CASCADE' })
    ticket: HelpdeskTicket;
}
