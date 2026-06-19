import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

export type MetricOverrideOrigin = 'default' | 'custom' | 'summary';

interface MetricOverrideCreationAttrs {
    channelId: string;
    userId: string;
    actorUserId: string;
    metricId: string;
    origin: MetricOverrideOrigin;
    numValue?: number | null;
    boolValue?: boolean | null;
    strValue?: string | null;
    note?: string | null;
}

/**
 * Human supervisor corrections to LLM-produced metric values. Stored SEPARATELY
 * from the LLM analysis (never overwrites `AiAnalytics.metrics`) so the original
 * model output and the human reference both survive — the pair is the calibration
 * dataset for evals / prompt tuning.
 */
@Table({ tableName: 'operator_metric_overrides', timestamps: true })
export class MetricOverride extends Model<MetricOverride, MetricOverrideCreationAttrs> {
    @ApiProperty({ example: 1 })
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: '123', description: 'AiCdr.channelId (= OperatorAnalytics.id as string)' })
    @Column({ type: DataType.STRING, allowNull: false })
    channelId: string;

    @ApiProperty({ example: '5', description: 'Owner user ID of the analyzed record' })
    @Column({ type: DataType.STRING, allowNull: false })
    userId: string;

    @ApiProperty({ example: '9', description: 'User ID of the supervisor who made the override' })
    @Column({ type: DataType.STRING, allowNull: false })
    actorUserId: string;

    @ApiProperty({ example: 'greeting_quality', description: 'Metric key (default key, custom id, or summary key)' })
    @Column({ type: DataType.STRING, allowNull: false })
    metricId: string;

    @ApiProperty({ example: 'default', description: 'Where the metric comes from: default | custom | summary' })
    @Column({ type: DataType.STRING, allowNull: false })
    origin: string;

    @ApiProperty({ example: 75, description: 'Corrected numeric value' })
    @Column({ type: DataType.FLOAT, allowNull: true })
    numValue: number | null;

    @ApiProperty({ example: true, description: 'Corrected boolean value' })
    @Column({ type: DataType.BOOLEAN, allowNull: true })
    boolValue: boolean | null;

    @ApiProperty({ example: 'Positive', description: 'Corrected string/enum value' })
    @Column({ type: DataType.STRING, allowNull: true })
    strValue: string | null;

    @ApiProperty({ example: 'Operator did greet, model missed it', description: 'Supervisor note / rationale' })
    @Column({ type: DataType.TEXT, allowNull: true })
    note: string | null;
}
