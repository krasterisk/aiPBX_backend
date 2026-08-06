-- Migration: per-project analytics digest settings (additive, disabled by default)
-- Dialect: MySQL / MariaDB (portable; no ADD COLUMN IF NOT EXISTS)

DROP PROCEDURE IF EXISTS `_tmp_add_digest_config`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_digest_config`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'operator_projects'
          AND COLUMN_NAME = 'digestConfig'
    ) THEN
        ALTER TABLE operator_projects
            ADD COLUMN `digestConfig` JSON NULL;
    END IF;
END //
DELIMITER ;

CALL `_tmp_add_digest_config`();
DROP PROCEDURE IF EXISTS `_tmp_add_digest_config`;
