import { Column, DataType, HasMany, HasOne, Model, Table } from "sequelize-typescript";
import { AiAnalytics } from "../ai-analytics/ai-analytics.model";
import { BillingRecord } from "../billing/billing-record.model";
import { ApiProperty } from "@nestjs/swagger";

export enum CdrSource {
    CALL = 'call',
    WIDGET = 'widget',
    PLAYGROUND = 'playground',
}

interface CreateAiCdr {
    channelId: string
    callerId: string
    tokens?: number
    source?: CdrSource
}

@Table({ tableName: "aiCdr" })
export class AiCdr extends Model<AiCdr, CreateAiCdr> {
    @ApiProperty({ example: '123', description: "Channel uniqueId" })
    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    channelId: string;
    @ApiProperty({ example: '1006', description: "CallerId" })
    @Column({ type: DataType.STRING, allowNull: true })
    callerId: string
    @ApiProperty({ example: 'Bob', description: "Assistant name" })
    @Column({ type: DataType.STRING, allowNull: true })
    assistantName: string
    @ApiProperty({ example: '2', description: "Assistant id" })
    @Column({ type: DataType.STRING, allowNull: true })
    assistantId: string
    @ApiProperty({ example: '1023', description: "Cached total tokens count" })
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    tokens: number
    @ApiProperty({ example: '10', description: "Call duration seconds" })
    @Column({ type: DataType.INTEGER, allowNull: true })
    duration: number
    @ApiProperty({ example: '0.084', description: "Cached total cost" })
    @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
    cost: number
    @ApiProperty({ example: '1', description: "UserId" })
    @Column({ type: DataType.STRING, allowNull: true })
    userId: string
    @ApiProperty({ example: '1006', description: "vPbxUserId" })
    @Column({ type: DataType.STRING, allowNull: true })
    vPbxUserId: string
    @ApiProperty({ example: 'call', description: "Call source: call, widget, playground" })
    @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'call' })
    source: string
    @ApiProperty({ example: 'https://server.com/records/assistantId/channelId.mp3', description: "Record URL" })
    @Column({ type: DataType.STRING, allowNull: true })
    recordUrl: string

    @HasOne(() => AiAnalytics, { foreignKey: 'channelId', sourceKey: 'channelId' })
    analytics: AiAnalytics

    @HasMany(() => BillingRecord, { foreignKey: 'channelId', sourceKey: 'channelId' })
    billingRecords: BillingRecord[]
}
