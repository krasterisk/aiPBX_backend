-- Migration: per-project critical alert settings (additive, disabled by default)
-- Dialect: MySQL / MariaDB (portable; no ADD COLUMN IF NOT EXISTS)

DROP PROCEDURE IF EXISTS `_tmp_add_alert_config`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_alert_config`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'operator_projects'
          AND COLUMN_NAME = 'alertConfig'
    ) THEN
        ALTER TABLE operator_projects
            ADD COLUMN `alertConfig` JSON NULL;
    END IF;
END //
DELIMITER ;

CALL `_tmp_add_alert_config`();
DROP PROCEDURE IF EXISTS `_tmp_add_alert_config`;
