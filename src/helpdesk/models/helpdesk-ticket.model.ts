import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HelpdeskTicketMessage } from './helpdesk-ticket-message.model';
import { HelpdeskTicketStatusHistory } from './helpdesk-ticket-status-history.model';

export interface HelpdeskTicketCreationAttrs {
    status?: string;
    category?: string;
    priority?: string;
    source?: string;
    subject?: string;
    description?: string | null;
    callerPhone?: string | null;
    contactPhone?: string | null;
    alfawebhookClientId?: string | null;
    inn?: string | null;
    clientName?: string | null;
    assigneeId?: number | null;
    createdByApiKeyId?: number | null;
    transcript?: string | null;
}

@Table({ tableName: 'helpdesk_tickets', timestamps: true })
export class HelpdeskTicket extends Model<HelpdeskTicket, HelpdeskTicketCreationAttrs> {
    @ApiProperty()
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty({ example: 'new' })
    @Column({ type: DataType.STRING(32), allowNull: false, defaultValue: 'new' })
    status: string;

    @ApiProperty({ example: 'technical' })
    @Column({ type: DataType.STRING(32), allowNull: false, defaultValue: 'other' })
    category: string;

    @ApiProperty({ example: 'normal' })
    @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'normal' })
    priority: string;

    @ApiProperty({ example: 'voice' })
    @Column({ type: DataType.STRING(32), allowNull: false, defaultValue: 'voice' })
    source: string;

    @ApiProperty()
    @Column({ type: DataType.STRING(512), allowNull: false, defaultValue: '' })
    subject: string;

    @ApiPropertyOptional()
    @Column({ type: DataType.TEXT, allowNull: true })
    description: string | null;

    @ApiPropertyOptional({ description: 'Caller ID' })
    @Column({ type: DataType.STRING(32), allowNull: true })
    callerPhone: string | null;

    @ApiPropertyOptional()
    @Column({ type: DataType.STRING(32), allowNull: true })
    contactPhone: string | null;

    @ApiPropertyOptional()
    @Column({ type: DataType.STRING(128), allowNull: true })
    alfawebhookClientId: string | null;

    @ApiPropertyOptional()
    @Column({ type: DataType.STRING(16), allowNull: true })
    inn: string | null;

    @ApiPropertyOptional()
    @Column({ type: DataType.STRING(512), allowNull: true })
    clientName: string | null;

    @ApiPropertyOptional({ description: 'ID оператора-исполнителя' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    assigneeId: number | null;

    @ApiPropertyOptional()
    @Column({ type: DataType.INTEGER, allowNull: true })
    createdByApiKeyId: number | null;

    @ApiPropertyOptional()
    @Column({ type: DataType.TEXT, allowNull: true })
    transcript: string | null;

    @HasMany(() => HelpdeskTicketMessage)
    messages: HelpdeskTicketMessage[];

    @HasMany(() => HelpdeskTicketStatusHistory)
    statusHistory: HelpdeskTicketStatusHistory[];
}
