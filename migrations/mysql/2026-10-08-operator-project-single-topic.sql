-- Optional single-topic classification; existing projects keep multi-topic mode.
DROP PROCEDURE IF EXISTS `_tmp_add_single_topic`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_single_topic`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_projects'
          AND COLUMN_NAME = 'singleTopic'
    ) THEN
        ALTER TABLE operator_projects ADD COLUMN `singleTopic` BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END //
DELIMITER ;
CALL `_tmp_add_single_topic`();
DROP PROCEDURE IF EXISTS `_tmp_add_single_topic`;
