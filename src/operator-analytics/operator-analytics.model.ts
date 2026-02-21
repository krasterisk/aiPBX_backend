import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

export enum AnalyticsSource {
    FRONTEND = 'frontend',
    API = 'api',
}

export enum AnalyticsStatus {
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    ERROR = 'error',
}

interface OperatorAnalyticsCreationAttrs {
    userId: string;
    filename: string;
    source: AnalyticsSource;
    status?: AnalyticsStatus;
    operatorName?: string;
    clientPhone?: string;
    language?: string;
    customMetricsDef?: any;
    llmCost?: number;
    sttCost?: number;
    projectId?: number;
}

@Table({ tableName: 'operator_analytics' })
export class OperatorAnalytics extends Model<OperatorAnalytics, OperatorAnalyticsCreationAttrs> {

    @ApiProperty({ example: 1, description: 'Primary key' })
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: '5', description: 'Owner user ID' })
    @Column({ type: DataType.STRING, allowNull: false })
    userId: string;

    @ApiProperty({ example: 'call_001.mp3', description: 'Original filename' })
    @Column({ type: DataType.STRING, allowNull: false })
    filename: string;

    @ApiProperty({ example: 'frontend', description: 'Upload source' })
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: AnalyticsSource.FRONTEND })
    source: string;

    @ApiProperty({ example: 'completed', description: 'Processing status' })
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: AnalyticsStatus.PROCESSING })
    status: string;

    @ApiProperty({ example: 'Иванов А.', description: 'Operator name' })
    @Column({ type: DataType.STRING, allowNull: true })
    operatorName: string;

    @ApiProperty({ example: '+79001234567', description: 'Client phone' })
    @Column({ type: DataType.STRING, allowNull: true })
    clientPhone: string;

    @ApiProperty({ example: 1, description: 'Project (group) ID' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    projectId: number;

    @ApiProperty({ example: 'ru', description: 'Language hint for STT' })
    @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'auto' })
    language: string;

    @ApiProperty({ description: 'Full transcription text' })
    @Column({ type: DataType.TEXT, allowNull: true })
    transcription: string;

    @ApiProperty({ description: 'Base 10 metrics JSON' })
    @Column({ type: DataType.JSON, allowNull: true })
    metrics: any;

    @ApiProperty({ description: 'Custom metrics results' })
    @Column({ type: DataType.JSON, allowNull: true })
    customMetrics: any;

    @ApiProperty({ description: 'Custom metric definitions used' })
    @Column({ type: DataType.JSON, allowNull: true })
    customMetricsDef: any;

    @ApiProperty({ example: 125.5, description: 'Audio duration in seconds' })
    @Column({ type: DataType.FLOAT, allowNull: true })
    duration: number;

    @ApiProperty({ example: 0.05, description: 'Total cost (STT + LLM)' })
    @Column({ type: DataType.FLOAT, allowNull: true, defaultValue: 0 })
    cost: number;

    @ApiProperty({ example: 0.03, description: 'LLM (GPT) cost' })
    @Column({ type: DataType.FLOAT, allowNull: true, defaultValue: 0 })
    llmCost: number;

    @ApiProperty({ example: 0.02, description: 'STT (transcription) cost' })
    @Column({ type: DataType.FLOAT, allowNull: true, defaultValue: 0 })
    sttCost: number;

    @ApiProperty({ example: 1500, description: 'Total tokens consumed' })
    @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 0 })
    tokens: number;

    @ApiProperty({ description: 'Error message if status=error' })
    @Column({ type: DataType.TEXT, allowNull: true })
    errorMessage: string;
}
