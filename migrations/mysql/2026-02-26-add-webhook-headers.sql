-- Migration: Add webhookHeaders to operator_projects
-- Dialect: MySQL / MariaDB (portable; no ADD COLUMN IF NOT EXISTS)

DROP PROCEDURE IF EXISTS `_tmp_add_webhook_headers`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_webhook_headers`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'operator_projects'
          AND COLUMN_NAME = 'webhookHeaders'
    ) THEN
        ALTER TABLE operator_projects
            ADD COLUMN `webhookHeaders` JSON NOT NULL DEFAULT (CAST('{}' AS JSON));
    END IF;
END //
DELIMITER ;

CALL `_tmp_add_webhook_headers`();
DROP PROCEDURE IF EXISTS `_tmp_add_webhook_headers`;
