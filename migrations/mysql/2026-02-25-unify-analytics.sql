-- Migration: Unified Call Analytics
-- Dialect: MySQL 8.0.12+
-- Description: mirrors postgres/2026-02-25-unify-analytics.sql (safe re-runs via IF EXISTS drops)

ALTER TABLE `aiCdr`
    ADD COLUMN IF NOT EXISTS `projectId` INT NULL;

SET @idx_ai_cdr := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aiCdr' AND INDEX_NAME = 'idx_aiCdr_projectId'
);
SET @sql_ai_cdr := IF(@idx_ai_cdr = 0, 'CREATE INDEX idx_aiCdr_projectId ON `aiCdr` (`projectId`)', 'SELECT 1');
PREPARE stmt_ai_cdr FROM @sql_ai_cdr;
EXECUTE stmt_ai_cdr;
DEALLOCATE PREPARE stmt_ai_cdr;

ALTER TABLE `billingRecords`
    ADD COLUMN IF NOT EXISTS `sttCost` FLOAT NOT NULL DEFAULT 0;

ALTER TABLE `aiAssistants`
    ADD COLUMN IF NOT EXISTS `projectId` INT NULL;

DROP PROCEDURE IF EXISTS `_tmp_unify_drop_operator_columns`;
DELIMITER //
CREATE PROCEDURE `_tmp_unify_drop_operator_columns`()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'metrics') THEN
        ALTER TABLE operator_analytics DROP COLUMN metrics;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'customMetrics') THEN
        ALTER TABLE operator_analytics DROP COLUMN `customMetrics`;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'customMetricsDef') THEN
        ALTER TABLE operator_analytics DROP COLUMN `customMetricsDef`;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'schemaVersion') THEN
        ALTER TABLE operator_analytics DROP COLUMN `schemaVersion`;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'cost') THEN
        ALTER TABLE operator_analytics DROP COLUMN cost;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'llmCost') THEN
        ALTER TABLE operator_analytics DROP COLUMN `llmCost`;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'sttCost') THEN
        ALTER TABLE operator_analytics DROP COLUMN `sttCost`;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'tokens') THEN
        ALTER TABLE operator_analytics DROP COLUMN tokens;
    END IF;
END //
DELIMITER ;

CALL `_tmp_unify_drop_operator_columns`();
DROP PROCEDURE IF EXISTS `_tmp_unify_drop_operator_columns`;

DROP PROCEDURE IF EXISTS `_tmp_unify_ai_analytics_csat`;
DELIMITER //
CREATE PROCEDURE `_tmp_unify_ai_analytics_csat`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aiAnalytics' AND COLUMN_NAME = 'csat') THEN
        ALTER TABLE `aiAnalytics` ADD COLUMN `csat` FLOAT NULL;
    END IF;
END //
DELIMITER ;

CALL `_tmp_unify_ai_analytics_csat`();
DROP PROCEDURE IF EXISTS `_tmp_unify_ai_analytics_csat`;

SELECT
    'aiCdr.projectId' AS check_name,
    COUNT(*) AS column_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aiCdr' AND COLUMN_NAME = 'projectId'
UNION ALL
SELECT
    'billingRecords.sttCost',
    COUNT(*)
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billingRecords' AND COLUMN_NAME = 'sttCost'
UNION ALL
SELECT
    'aiAssistants.projectId',
    COUNT(*)
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aiAssistants' AND COLUMN_NAME = 'projectId'
UNION ALL
SELECT
    'operator_analytics.metrics DROPPED',
    CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME IN (
    'metrics', 'customMetrics', 'customMetricsDef', 'schemaVersion',
    'cost', 'llmCost', 'sttCost', 'tokens'
);
