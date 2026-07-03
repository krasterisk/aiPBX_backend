import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HelpdeskTicket } from './helpdesk-ticket.model';

@Table({ tableName: 'helpdesk_ticket_messages', timestamps: true })
export class HelpdeskTicketMessage extends Model<HelpdeskTicketMessage> {
    @ApiProperty()
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ForeignKey(() => HelpdeskTicket)
    @Column({ type: DataType.INTEGER, allowNull: false })
    ticketId: number;

    @ApiProperty({ example: 'operator' })
    @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'system' })
    role: string;

    @ApiProperty()
    @Column({ type: DataType.TEXT, allowNull: false })
    content: string;

    @ApiPropertyOptional()
    @Column({ type: DataType.JSONB, allowNull: true })
    metadata: Record<string, unknown> | null;

    @BelongsTo(() => HelpdeskTicket, { onDelete: 'CASCADE' })
    ticket: HelpdeskTicket;
}
