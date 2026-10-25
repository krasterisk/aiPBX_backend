-- Q1 additive migration for MySQL 8.0. Column additions use information_schema checks.
-- Apply before deploying models. Existing metrics and project prompts are untouched.
DELIMITER //
CREATE PROCEDURE q1_add_column(IN target_table VARCHAR(64), IN target_column VARCHAR(64), IN column_type VARCHAR(128))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=target_table AND column_name=target_column) THEN
        SET @q1_ddl=CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN `', target_column, '` ', column_type, ' NULL');
        PREPARE q1_stmt FROM @q1_ddl; EXECUTE q1_stmt; DEALLOCATE PREPARE q1_stmt;
    END IF;
END//
DELIMITER ;
CALL q1_add_column('operator_projects', 'qualityScoreConfig', 'JSON');
CALL q1_add_column('operator_metric_overrides', 'status', 'VARCHAR(24)');
CALL q1_add_column('aiAnalytics', 'qualityRunId', 'VARCHAR(36)');
CALL q1_add_column('aiAnalytics', 'qualityScorecardId', 'VARCHAR(64)');
CALL q1_add_column('aiAnalytics', 'qualityScore', 'DOUBLE');
CALL q1_add_column('aiAnalytics', 'qualityStatus', 'VARCHAR(24)');
CALL q1_add_column('aiAnalytics', 'qualityCoverage', 'DOUBLE');
CALL q1_add_column('aiAnalytics', 'qualityVersion', 'VARCHAR(40)');
CALL q1_add_column('aiAnalytics', 'qualityContextIncomplete', 'BOOLEAN');
CALL q1_add_column('aiAnalytics', 'qualitySummary', 'JSON');
CALL q1_add_column('operator_metric_values', 'qualityRunId', 'VARCHAR(36)');
CALL q1_add_column('operator_metric_values', 'qualityStatus', 'VARCHAR(24)');
CALL q1_add_column('operator_metric_values', 'normalizedValue', 'DOUBLE');
CALL q1_add_column('operator_metric_values', 'qualityWeight', 'DOUBLE');
CALL q1_add_column('operator_metric_values', 'contributesToQuality', 'BOOLEAN');
DROP PROCEDURE q1_add_column;
CREATE TABLE IF NOT EXISTS quality_scorecard_revisions (
    id VARCHAR(64) PRIMARY KEY, userId VARCHAR(255) NOT NULL, projectId INT NULL,
    snapshot JSON NOT NULL, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS quality_analysis_runs (
    id VARCHAR(36) PRIMARY KEY, operationKey VARCHAR(64) NOT NULL UNIQUE,
    scorecardRevisionId VARCHAR(64) NOT NULL, userId VARCHAR(255) NOT NULL,
    projectId INT NULL, channelId VARCHAR(255) NOT NULL, previousRunId VARCHAR(36) NULL,
    kind VARCHAR(24) NOT NULL, rawSnapshot JSON NOT NULL, result JSON NOT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX quality_runs_owner_channel_time(userId, channelId, createdAt, id),
    INDEX quality_runs_revision(scorecardRevisionId),
    FOREIGN KEY (scorecardRevisionId) REFERENCES quality_scorecard_revisions(id),
    FOREIGN KEY (channelId) REFERENCES aiAnalytics(channelId) ON DELETE CASCADE
);
