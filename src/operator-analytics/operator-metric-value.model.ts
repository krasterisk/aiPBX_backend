import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

export type MetricValueOrigin = 'default' | 'custom' | 'summary';

interface MetricValueCreationAttrs {
    channelId: string;
    userId?: string;
    projectId?: number;
    metricId: string;
    origin: MetricValueOrigin;
    numValue?: number | null;
    boolValue?: boolean | null;
    strValue?: string | null;
    schemaVersion?: number | null;
}

/**
 * Normalized, queryable storage for analysis metric values.
 *
 * Written in addition to the JSON blob on AiAnalytics.metrics (dual-write). The JSON
 * remains the source of truth for existing readers; this table enables future
 * dialect-aware SQL aggregation/filtering/sorting without breaking anything.
 */
@Table({ tableName: 'operator_metric_values', timestamps: true, updatedAt: false })
export class MetricValue extends Model<MetricValue, MetricValueCreationAttrs> {
    @ApiProperty({ example: 1 })
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: '123', description: 'AiCdr.channelId (= OperatorAnalytics.id as string)' })
    @Column({ type: DataType.STRING, allowNull: false })
    channelId: string;

    @ApiProperty({ example: '5', description: 'Owner user ID' })
    @Column({ type: DataType.STRING, allowNull: true })
    userId: string;

    @ApiProperty({ example: 1, description: 'Project ID' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    projectId: number;

    @ApiProperty({ example: 'greeting_quality', description: 'Metric key (default key, custom id, or summary key)' })
    @Column({ type: DataType.STRING, allowNull: false })
    metricId: string;

    @ApiProperty({ example: 'default', description: 'Where the metric comes from: default | custom | summary' })
    @Column({ type: DataType.STRING, allowNull: false })
    origin: string;

    @ApiProperty({ example: 75, description: 'Numeric value (scores, csat, custom number)' })
    @Column({ type: DataType.FLOAT, allowNull: true })
    numValue: number | null;

    @ApiProperty({ example: true, description: 'Boolean value (success, custom boolean)' })
    @Column({ type: DataType.BOOLEAN, allowNull: true })
    boolValue: boolean | null;

    @ApiProperty({ example: 'Positive', description: 'String/enum value (sentiment, custom enum/string)' })
    @Column({ type: DataType.STRING, allowNull: true })
    strValue: string | null;

    @ApiProperty({ example: 2, description: 'Project schema version at analysis time' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    schemaVersion: number | null;
}
