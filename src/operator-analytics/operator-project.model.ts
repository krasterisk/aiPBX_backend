import { Column, DataType, Model, Table, Index } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { MetricDefinition, DefaultMetricKey, DashboardConfig, WebhookEvent, ALL_DEFAULT_METRIC_KEYS } from './interfaces/operator-metrics.interface';

export interface OperatorProjectCreationAttrs {
    name: string;
    userId: string;
    description?: string;
    isDefault?: boolean;
    systemPrompt?: string;
    customMetricsSchema?: MetricDefinition[];
    visibleDefaultMetrics?: DefaultMetricKey[];
    dashboardConfig?: DashboardConfig;
    webhookUrl?: string;
    webhookEvents?: WebhookEvent[];
}

@Table({ tableName: 'operator_projects' })
export class OperatorProject extends Model<OperatorProject, OperatorProjectCreationAttrs> {

    @ApiProperty({ example: 1 })
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: 'Отдел продаж' })
    @Column({ type: DataType.STRING, allowNull: false, validate: { len: [1, 100] } })
    name: string;

    @ApiProperty({ example: 'Входящие звонки менеджеров продаж' })
    @Column({ type: DataType.TEXT, allowNull: true })
    description: string;

    @ApiProperty({ example: '5' })
    @Index({ name: 'idx_operator_projects_userId' })
    @Column({ type: DataType.STRING, allowNull: false })
    userId: string;

    // ─── Dynamic Analytics Fields ────────────────────────────────────

    @ApiProperty({ example: false, description: 'Auto-created default project flag' })
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    isDefault: boolean;

    @ApiProperty({ description: 'Business context prompt for LLM (max 1000 chars)' })
    @Column({ type: DataType.TEXT, allowNull: true })
    systemPrompt: string;

    @ApiProperty({ description: 'Custom metrics schema definitions' })
    @Column({ type: DataType.JSON, allowNull: false, defaultValue: [] })
    customMetricsSchema: MetricDefinition[];

    @ApiProperty({ example: 1, description: 'Current schema version (auto-incremented)' })
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
    currentSchemaVersion: number;

    @ApiProperty({ description: 'Which default metrics are visible for this project' })
    @Column({ type: DataType.JSON, allowNull: false, defaultValue: ALL_DEFAULT_METRIC_KEYS })
    visibleDefaultMetrics: DefaultMetricKey[];

    @ApiProperty({ description: 'Dashboard widget configuration' })
    @Column({ type: DataType.JSON, allowNull: false, defaultValue: { widgets: [], maxWidgets: 20 } })
    dashboardConfig: DashboardConfig;

    @ApiProperty({ example: 'https://example.com/webhook', description: 'Webhook URL for notifications' })
    @Column({ type: DataType.STRING(500), allowNull: true })
    webhookUrl: string;

    @ApiProperty({ description: 'Webhook event types to send' })
    @Column({ type: DataType.JSON, allowNull: false, defaultValue: [] })
    webhookEvents: WebhookEvent[];
}
