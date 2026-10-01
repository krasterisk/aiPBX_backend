-- Migration: project-specific success prompt
-- Dialect: MySQL / MariaDB

DROP PROCEDURE IF EXISTS `_tmp_add_success_prompt`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_success_prompt`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'operator_projects'
          AND COLUMN_NAME = 'successPrompt'
    ) THEN
        ALTER TABLE operator_projects
            ADD COLUMN `successPrompt` TEXT NULL;
    END IF;
END //
DELIMITER ;

CALL `_tmp_add_success_prompt`();
DROP PROCEDURE IF EXISTS `_tmp_add_success_prompt`;
