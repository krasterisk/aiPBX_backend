import { Column, DataType, Model, Table, BelongsTo, ForeignKey } from "sequelize-typescript";
import { AiCdr } from "../ai-cdr/ai-cdr.model";
import { ApiProperty } from "@nestjs/swagger";

interface AiAnalyticsCreationAttrs {
    channelId: string;
    metrics: any;
    summary?: string;
    sentiment?: string;
    csat?: number;
    cost?: number;
    tokens?: number;
}

@Table({ tableName: "aiAnalytics" })
export class AiAnalytics extends Model<AiAnalytics, AiAnalyticsCreationAttrs> {
    @ApiProperty({ example: '123', description: "Channel uniqueId" })
    @ForeignKey(() => AiCdr)
    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    channelId: string;

    @BelongsTo(() => AiCdr, { foreignKey: 'channelId', targetKey: 'channelId' })
    cdr: AiCdr;

    @ApiProperty({ example: '{"accuracy": 90}', description: "Full analytics metrics JSON" })
    @Column({ type: DataType.JSON, allowNull: false })
    metrics: any;

    @ApiProperty({ example: 'Call was successful', description: "Short summary of the call" })
    @Column({ type: DataType.TEXT, allowNull: true })
    summary: string;

    @ApiProperty({ example: 'Positive', description: "Overall sentiment" })
    @Column({ type: DataType.STRING, allowNull: true })
    sentiment: string;

    @ApiProperty({ example: 5, description: "Customer Satisfaction Score (1-5)" })
    @Column({ type: DataType.INTEGER, allowNull: true })
    csat: number;

    @ApiProperty({ example: 0.05, description: "Cost of the analysis" })
    @Column({ type: DataType.FLOAT, allowNull: true })
    cost: number;

    @ApiProperty({ example: 100, description: "Total tokens used" })
    @Column({ type: DataType.INTEGER, allowNull: true })
    tokens: number;
}
