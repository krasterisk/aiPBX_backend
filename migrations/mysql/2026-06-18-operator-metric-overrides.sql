-- Migration: human supervisor metric overrides (stored separately from LLM values)
-- Dialect: MySQL 8.0+

CREATE TABLE IF NOT EXISTS operator_metric_overrides (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `channelId` VARCHAR(255) NOT NULL,
    `userId` VARCHAR(255) NOT NULL,
    `actorUserId` VARCHAR(255) NOT NULL,
    `metricId` VARCHAR(255) NOT NULL,
    origin VARCHAR(20) NOT NULL,
    `numValue` FLOAT NULL,
    `boolValue` TINYINT(1) NULL,
    `strValue` VARCHAR(255) NULL,
    note TEXT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_override_channel_metric (`channelId`, `metricId`),
    INDEX idx_override_channel (`channelId`),
    INDEX idx_override_user (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
