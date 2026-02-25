import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { AiCdr } from '../ai-cdr/ai-cdr.model';

interface CreateBillingRecord {
    channelId: string;
    type: string;
    audioTokens?: number;
    textTokens?: number;
    totalTokens?: number;
    audioCost?: number;
    textCost?: number;
    sttCost?: number;
    totalCost?: number;
}

@Table({ tableName: 'billingRecords' })
export class BillingRecord extends Model<BillingRecord, CreateBillingRecord> {
    @ApiProperty({ example: 'abc-123', description: 'Channel uniqueId (FK to aiCdr)' })
    @ForeignKey(() => AiCdr)
    @Column({ type: DataType.STRING, allowNull: false })
    channelId: string;

    @ApiProperty({ example: 'realtime', description: 'Billing type: realtime | analytic' })
    @Column({ type: DataType.STRING, allowNull: false })
    type: string;

    @ApiProperty({ example: 836, description: 'Audio tokens (input + output)' })
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    audioTokens: number;

    @ApiProperty({ example: 6040, description: 'Text tokens (input + output)' })
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    textTokens: number;

    @ApiProperty({ example: 6876, description: 'Total tokens for this record' })
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    totalTokens: number;

    @ApiProperty({ example: 0.029, description: 'Audio tokens cost' })
    @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
    audioCost: number;

    @ApiProperty({ example: 0.030, description: 'Text tokens cost' })
    @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
    textCost: number;

    @ApiProperty({ example: 0.059, description: 'Total cost for this record' })
    @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
    totalCost: number;

    @ApiProperty({ example: 0.010, description: 'STT cost' })
    @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
    sttCost: number;

    @BelongsTo(() => AiCdr, { foreignKey: 'channelId', targetKey: 'channelId' })
    aiCdr: AiCdr;
}
