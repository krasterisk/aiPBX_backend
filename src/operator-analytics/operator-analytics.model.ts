import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { decryptTranscript, encryptTranscript } from './lib/transcript-crypto';

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
    projectId?: number;
    recordUrl?: string;
    sttProvider?: string;
    consentObtained?: boolean;
    consentSource?: string;
    schemaVersion?: number;
    promptVersion?: string;
    audioSha256?: string;
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

    @ApiProperty({ example: 2, description: 'Project custom-metrics schema version applied at analysis time' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    schemaVersion: number;

    @ApiProperty({ example: '2026-06-18.1', description: 'Analysis prompt/rubric artifact version used at analysis time' })
    @Column({ type: DataType.STRING, allowNull: true })
    promptVersion: string;

    @ApiProperty({ description: 'Full transcription text (encrypted at rest when OPERATOR_ENCRYPT_TRANSCRIPTS=true)' })
    @Column({
        type: DataType.TEXT,
        allowNull: true,
        // Transparent at-rest encryption with dual-read of legacy plaintext.
        set(this: OperatorAnalytics, value: string | null) {
            this.setDataValue('transcription', encryptTranscript(value) as string);
        },
        get(this: OperatorAnalytics): string | null {
            return decryptTranscript(this.getDataValue('transcription'));
        },
    })
    transcription: string;

    @ApiProperty({ example: 125.5, description: 'Audio duration in seconds' })
    @Column({ type: DataType.FLOAT, allowNull: true })
    duration: number;

    @ApiProperty({ description: 'Error message if status=error' })
    @Column({ type: DataType.TEXT, allowNull: true })
    errorMessage: string;

    @ApiProperty({ description: 'URL to the audio recording if provided via API' })
    @Column({ type: DataType.STRING, allowNull: true })
    recordUrl: string;

    @ApiProperty({ example: 'external', description: 'STT provider used (external / openai)' })
    @Column({ type: DataType.STRING, allowNull: true })
    sttProvider: string;

    @ApiProperty({ example: 'ok', description: 'Transcription quality verdict: ok | low | unusable' })
    @Column({ type: DataType.STRING, allowNull: true })
    transcriptionQuality: string;

    @ApiProperty({ example: 0.85, description: 'Transcription confidence 0..1' })
    @Column({ type: DataType.FLOAT, allowNull: true })
    transcriptionConfidence: number;

    @ApiProperty({ example: 'ru', description: 'Detected transcription language' })
    @Column({ type: DataType.STRING, allowNull: true })
    detectedLanguage: string;

    @ApiProperty({ description: 'Quality reason codes for i18n' })
    @Column({ type: DataType.JSON, allowNull: true })
    qualityReasons: string[];

    @ApiProperty({ example: true, description: 'Whether call-recording consent was obtained (nullable = unknown)' })
    @Column({ type: DataType.BOOLEAN, allowNull: true })
    consentObtained: boolean;

    @ApiProperty({ example: 'ivr', description: 'How consent was obtained (ivr / contract / verbal / ...)' })
    @Column({ type: DataType.STRING, allowNull: true })
    consentSource: string;

    @ApiProperty({ example: 'a1b2c3…', description: 'SHA-256 of uploaded audio (nullable; used for dedup when enabled)' })
    @Column({ type: DataType.STRING(64), allowNull: true })
    audioSha256: string;
}
