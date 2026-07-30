-- Migration: operator call taxonomy column + per-call tag table
-- Dialect: MySQL 8.0+

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS `callTaxonomy` JSON NOT NULL DEFAULT (CAST('[]' AS JSON));

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
