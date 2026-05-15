-- Add userId and description to billingRecords; drop FK on channelId (name-agnostic)
-- Dialect: MySQL 8.0+

ALTER TABLE `billingRecords` ADD COLUMN IF NOT EXISTS `userId` VARCHAR(255) NULL;
ALTER TABLE `billingRecords` ADD COLUMN IF NOT EXISTS `description` VARCHAR(255) NULL;

DROP PROCEDURE IF EXISTS `_tmp_drop_billingRecords_channel_fk`;
DELIMITER //
CREATE PROCEDURE `_tmp_drop_billingRecords_channel_fk`()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE cname VARCHAR(255);
    DECLARE cur CURSOR FOR
        SELECT kcu.CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE kcu
        INNER JOIN information_schema.TABLE_CONSTRAINTS tc
            ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
            AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_NAME = kcu.TABLE_NAME
        WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
          AND kcu.TABLE_NAME = 'billingRecords'
          AND kcu.COLUMN_NAME = 'channelId'
          AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO cname;
        IF done = 1 THEN
            LEAVE read_loop;
        END IF;
        SET @sql = CONCAT('ALTER TABLE `billingRecords` DROP FOREIGN KEY `', cname, '`');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END LOOP;
    CLOSE cur;
END //
DELIMITER ;

CALL `_tmp_drop_billingRecords_channel_fk`();
DROP PROCEDURE IF EXISTS `_tmp_drop_billingRecords_channel_fk`;

UPDATE `billingRecords` br
INNER JOIN `aiCdr` ac ON br.`channelId` = ac.`channelId`
SET br.`userId` = ac.`userId`
WHERE br.`userId` IS NULL;
