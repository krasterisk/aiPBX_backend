-- Migration: operator call taxonomy column + per-call tag table
-- Dialect: MySQL / MariaDB (portable; no ADD COLUMN IF NOT EXISTS)

DROP PROCEDURE IF EXISTS `_tmp_add_call_taxonomy`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_call_taxonomy`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'operator_projects'
          AND COLUMN_NAME = 'callTaxonomy'
    ) THEN
        ALTER TABLE operator_projects
            ADD COLUMN `callTaxonomy` JSON NOT NULL DEFAULT (CAST('[]' AS JSON));
    END IF;
END //
DELIMITER ;

CALL `_tmp_add_call_taxonomy`();
DROP PROCEDURE IF EXISTS `_tmp_add_call_taxonomy`;

CREATE TABLE IF NOT EXISTS operator_call_tags (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `channelId` VARCHAR(255) NOT NULL,
    `userId` VARCHAR(255) NULL,
    `projectId` INT NULL,
    `tagId` VARCHAR(100) NOT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'auto',
    `actorUserId` VARCHAR(255) NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX uq_call_tags_channel_tag (`channelId`, `tagId`),
    INDEX idx_call_tags_tag_project (`tagId`, `projectId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
