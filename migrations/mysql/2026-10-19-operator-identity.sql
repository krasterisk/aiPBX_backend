-- MySQL 8 / MariaDB: idempotent additive DDL, preserving legacy callers.
DELIMITER $$
DROP PROCEDURE IF EXISTS migrate_operator_identity_20261019$$
CREATE PROCEDURE migrate_operator_identity_20261019()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='operator_analytics' AND column_name='operatorId') THEN
        ALTER TABLE operator_analytics ADD COLUMN operatorId VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='operator_analytics' AND column_name='operatorExtension') THEN
        ALTER TABLE operator_analytics ADD COLUMN operatorExtension VARCHAR(64) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='aiCdr' AND column_name='operatorId') THEN
        ALTER TABLE aiCdr ADD COLUMN operatorId VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='aiCdr' AND column_name='operatorExtension') THEN
        ALTER TABLE aiCdr ADD COLUMN operatorExtension VARCHAR(64) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='operator_analytics' AND index_name='idx_operator_analytics_employee') THEN
        CREATE INDEX idx_operator_analytics_employee ON operator_analytics (userId, operatorId, projectId);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='aiCdr' AND index_name='idx_ai_cdr_employee') THEN
        CREATE INDEX idx_ai_cdr_employee ON aiCdr (userId, operatorId, projectId);
    END IF;
END$$
CALL migrate_operator_identity_20261019()$$
DROP PROCEDURE migrate_operator_identity_20261019$$
DELIMITER ;
