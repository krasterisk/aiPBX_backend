import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { QualityScorecard, QualityScoreResult } from './quality-score';

@Table({ tableName: 'quality_scorecard_revisions', updatedAt: false })
export class QualityScorecardRevision extends Model {
    @Column({ type: DataType.STRING(64), primaryKey: true }) id: string;
    @Column({ type: DataType.STRING, allowNull: false }) userId: string;
    @Column({ type: DataType.INTEGER, allowNull: true }) projectId: number | null;
    @Column({ type: DataType.JSON, allowNull: false }) snapshot: QualityScorecard;
}

@Table({ tableName: 'quality_analysis_runs', updatedAt: false })
export class QualityAnalysisRun extends Model {
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
