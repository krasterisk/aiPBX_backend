import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { QualityScorecard, QualityScoreResult } from './quality-score';

@Table({ tableName: 'quality_preview_scorecards', updatedAt: false })
export class QualityPreviewScorecard extends Model {
    @Column({ type: DataType.STRING(64), primaryKey: true }) id: string;
    @Column({ type: DataType.STRING, allowNull: false }) userId: string;
    @Column({ type: DataType.INTEGER, allowNull: true }) projectId: number | null;
    @Column({ type: DataType.JSON, allowNull: false }) snapshot: QualityScorecard;
}

@Table({ tableName: 'quality_preview_runs', updatedAt: false })
export class QualityPreviewRun extends Model {
    @Column({ type: DataType.STRING(36), primaryKey: true }) id: string;
    @Column({ type: DataType.STRING(64), allowNull: false, unique: true }) operationKey: string;
    @Column({ type: DataType.STRING(64), allowNull: false }) scorecardRevisionId: string;
    @Column({ type: DataType.STRING, allowNull: false }) userId: string;
    @Column({ type: DataType.INTEGER, allowNull: true }) projectId: number | null;
    @Column({ type: DataType.STRING, allowNull: false }) channelId: string;
    @Column({ type: DataType.STRING(36), allowNull: true }) previousRunId: string | null;
    @Column({ type: DataType.STRING(24), allowNull: false }) kind:
        | 'analysis'
        | 'legacy_baseline'
        | 'legacy_derived'
        | 'correction';
    @Column({ type: DataType.JSON, allowNull: false }) rawSnapshot: Record<string, any>;
    @Column({ type: DataType.JSON, allowNull: false }) result: QualityScoreResult;
}

@Table({ tableName: 'quality_preview_rules', timestamps: true })
export class QualityPreviewRules extends Model {
 @Column({ type: DataType.INTEGER, primaryKey: true }) projectId: number;
 @Column({ type: DataType.STRING, allowNull: false }) userId: string;
 @Column({ type: DataType.JSON, allowNull: false }) config: Record<string, any>;
}
