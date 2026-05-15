-- Migration: Recreate all operator-analytics tables
-- Dialect: MySQL 8.0.13+ (JSON expression defaults)
-- WARNING: Drops operator_api_tokens, operator_analytics, operator_projects — data loss.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS operator_api_tokens;
DROP TABLE IF EXISTS operator_analytics;
DROP TABLE IF EXISTS operator_projects;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE operator_projects (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    `userId` VARCHAR(255) NOT NULL,
    `isDefault` TINYINT(1) NOT NULL DEFAULT 0,
    `systemPrompt` TEXT,
    `customMetricsSchema` JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
    `currentSchemaVersion` INT NOT NULL DEFAULT 1,
    `visibleDefaultMetrics` JSON NOT NULL DEFAULT (CAST('["greeting_quality","script_compliance","politeness_empathy","active_listening","objection_handling","product_knowledge","problem_resolution","speech_clarity_pace","closing_quality"]' AS JSON)),
    `dashboardConfig` JSON NOT NULL DEFAULT (CAST('{"widgets":[],"maxWidgets":20}' AS JSON)),
    `webhookUrl` VARCHAR(500) NULL,
    `webhookEvents` JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_operator_projects_userId ON operator_projects (`userId`);

CREATE TABLE operator_analytics (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `userId` VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'frontend',
    status VARCHAR(50) NOT NULL DEFAULT 'processing',
    `operatorName` VARCHAR(255) NULL,
    `clientPhone` VARCHAR(255) NULL,
    `projectId` INT NULL,
    language VARCHAR(10) DEFAULT 'auto',
    transcription TEXT,
    metrics JSON NULL,
    `customMetrics` JSON NULL,
    `customMetricsDef` JSON NULL,
    `schemaVersion` INT NULL,
    `sttProvider` VARCHAR(50) NULL,
    duration FLOAT NULL,
    cost FLOAT DEFAULT 0,
    `llmCost` FLOAT DEFAULT 0,
    `sttCost` FLOAT DEFAULT 0,
    tokens INT DEFAULT 0,
    `errorMessage` TEXT NULL,
    `recordUrl` VARCHAR(1024) NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT `operator_analytics_project_fk` FOREIGN KEY (`projectId`) REFERENCES operator_projects (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_operator_analytics_userId ON operator_analytics (`userId`);
CREATE INDEX idx_operator_analytics_projectId ON operator_analytics (`projectId`);
CREATE INDEX idx_operator_analytics_status ON operator_analytics (status);
CREATE INDEX idx_operator_analytics_createdAt ON operator_analytics (`createdAt`);

CREATE TABLE operator_api_tokens (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(255) NOT NULL,
    `userId` VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    `projectId` INT NULL,
    `isActive` TINYINT(1) NOT NULL DEFAULT 1,
    `lastUsedAt` TIMESTAMP(3) NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY `operator_api_tokens_token_uq` (token),
    CONSTRAINT `operator_api_tokens_project_fk` FOREIGN KEY (`projectId`) REFERENCES operator_projects (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_operator_api_tokens_userId ON operator_api_tokens (`userId`);
CREATE INDEX idx_operator_api_tokens_token ON operator_api_tokens (token);

DROP PROCEDURE IF EXISTS `_tmp_add_dynamic_siptrunks`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_dynamic_siptrunks`()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SipTrunks') THEN
        ALTER TABLE `SipTrunks`
            ADD COLUMN IF NOT EXISTS `trunkType` VARCHAR(20) NOT NULL DEFAULT 'registration',
            ADD COLUMN IF NOT EXISTS `transport` VARCHAR(10) NOT NULL DEFAULT 'udp',
            ADD COLUMN IF NOT EXISTS `domain` VARCHAR(255) NULL,
            ADD COLUMN IF NOT EXISTS `callerId` VARCHAR(255) NULL,
            ADD COLUMN IF NOT EXISTS `providerIp` VARCHAR(255) NULL,
            ADD COLUMN IF NOT EXISTS `records` TINYINT(1) NOT NULL DEFAULT 0;
        ALTER TABLE `SipTrunks` DROP COLUMN IF EXISTS `requireAuth`;
    END IF;
END //
DELIMITER ;

CALL `_tmp_add_dynamic_siptrunks`();
DROP PROCEDURE IF EXISTS `_tmp_add_dynamic_siptrunks`;

ALTER TABLE prices
    ADD COLUMN IF NOT EXISTS stt FLOAT NOT NULL DEFAULT 0;

DROP PROCEDURE IF EXISTS `_tmp_add_dynamic_pbxservers`;
DELIMITER //
CREATE PROCEDURE `_tmp_add_dynamic_pbxservers`()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PbxServers') THEN
        ALTER TABLE `PbxServers`
            ADD COLUMN IF NOT EXISTS `sipTechnology` VARCHAR(10) NOT NULL DEFAULT 'pjsip';
    END IF;
END //
DELIMITER ;

CALL `_tmp_add_dynamic_pbxservers`();
DROP PROCEDURE IF EXISTS `_tmp_add_dynamic_pbxservers`;
