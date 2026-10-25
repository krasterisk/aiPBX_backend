import { Column, DataType, Model, Table, BelongsTo, ForeignKey } from "sequelize-typescript";
import { AiCdr } from "../../ai-cdr/ai-cdr.model";
import { ApiProperty } from "@nestjs/swagger";

interface QualityPreviewAnalyticsCreationAttrs {
    channelId: string;
    metrics: any;
    summary?: string;
    sentiment?: string;
    csat?: number;
    cost?: number;
    tokens?: number;
}

@Table({ tableName: "quality_preview_analytics" })
export class QualityPreviewAnalytics extends Model<QualityPreviewAnalytics, QualityPreviewAnalyticsCreationAttrs> {
    @ApiProperty({ type: String, nullable: true, required: false })
    @Column({ type: DataType.STRING(36), allowNull: true }) qualityRunId: string | null;
    @ApiProperty({ type: Object, nullable: true, required: false })
    @Column({ type: DataType.JSON, allowNull: true }) qualitySummary: { csat: number | null; sentiment: string | null; success: boolean | null } | null;
    @ApiProperty({ type: String, nullable: true, required: false })
    @Column({ type: DataType.STRING(64), allowNull: true }) qualityScorecardId: string | null;
    @ApiProperty({ type: Number, nullable: true, required: false, description: 'Published deterministic quality score, 0–100. Null is not zero.' })
    @Column({ type: DataType.FLOAT, allowNull: true }) qualityScore: number | null;
    @ApiProperty({ type: String, nullable: true, required: false, enum: ['scored','needs_review','unscorable'] })
    @Column({ type: DataType.STRING(24), allowNull: true }) qualityStatus: string | null;
    @ApiProperty({ type: Number, nullable: true, required: false })
    @Column({ type: DataType.FLOAT, allowNull: true }) qualityCoverage: number | null;
    @ApiProperty({ type: String, nullable: true, required: false })
    @Column({ type: DataType.STRING(40), allowNull: true }) qualityVersion: string | null;
    @ApiProperty({ type: Boolean, nullable: true, required: false })
    @Column({ type: DataType.BOOLEAN, allowNull: true }) qualityContextIncomplete: boolean | null;
    @ApiProperty({ example: '123', description: "Channel uniqueId" })
    @ForeignKey(() => AiCdr)
    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    channelId: string;



    @ApiProperty({ example: '{"accuracy": 90}', description: "Full analytics metrics JSON" })
    @Column({ type: DataType.JSON, allowNull: false })
    metrics: any;

    @ApiProperty({ example: 'Call was successful', description: "Short summary of the call" })
    @Column({ type: DataType.TEXT, allowNull: true })
    summary: string;

    @ApiProperty({ example: 'Positive', description: "Overall sentiment" })
    @Column({ type: DataType.STRING, allowNull: true })
    sentiment: string;

    @ApiProperty({ example: 5, description: "Model-predicted satisfaction (1-5), separate from quality and customer survey CSAT" })
    @Column({ type: DataType.INTEGER, allowNull: true })
    csat: number;

    @ApiProperty({ example: 0.05, description: "Cost of the analysis" })
    @Column({ type: DataType.FLOAT, allowNull: true })
    cost: number;

    @ApiProperty({ example: 100, description: "Total tokens used" })
    @Column({ type: DataType.INTEGER, allowNull: true })
    tokens: number;
}
