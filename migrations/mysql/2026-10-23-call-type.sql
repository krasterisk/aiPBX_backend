-- Apply before deploying the callType models. Legacy NULL is read as incoming.
DROP PROCEDURE IF EXISTS `_tmp_add_call_type`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_call_type`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_analytics' AND COLUMN_NAME = 'callType') THEN
        ALTER TABLE operator_analytics ADD COLUMN `callType` VARCHAR(16) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aiCdr' AND COLUMN_NAME = 'callType') THEN
        ALTER TABLE aiCdr ADD COLUMN `callType` VARCHAR(16) NULL;
    END IF;
    ALTER TABLE operator_analytics ALTER COLUMN `callType` SET DEFAULT 'incoming';
    ALTER TABLE aiCdr ALTER COLUMN `callType` SET DEFAULT 'incoming';
END //
DELIMITER ;
CALL `_tmp_add_call_type`();
DROP PROCEDURE IF EXISTS `_tmp_add_call_type`;
