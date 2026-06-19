-- Migration: normalized metric_values table (dual-write alongside JSON)
-- Dialect: MySQL 8.0+

CREATE TABLE IF NOT EXISTS operator_metric_values (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `channelId` VARCHAR(255) NOT NULL,
    `userId` VARCHAR(255) NULL,
    `projectId` INT NULL,
    `metricId` VARCHAR(255) NOT NULL,
    origin VARCHAR(20) NOT NULL,
    `numValue` FLOAT NULL,
    `boolValue` TINYINT(1) NULL,
    `strValue` VARCHAR(255) NULL,
    `schemaVersion` INT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_metric_values_metric_channel (`metricId`, `channelId`),
    INDEX idx_metric_values_channel (`channelId`),
    INDEX idx_metric_values_user (`userId`),
    INDEX idx_metric_values_project (`projectId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
