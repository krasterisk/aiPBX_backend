-- Helpdesk module: заявки клиентов Krasterisk (Phase 7)
-- Dialect: MySQL 8.0+ (development)

CREATE TABLE IF NOT EXISTS `helpdesk_tickets` (
    id INT NOT NULL AUTO_INCREMENT,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    category VARCHAR(32) NOT NULL DEFAULT 'other',
    priority VARCHAR(16) NOT NULL DEFAULT 'normal',
    source VARCHAR(32) NOT NULL DEFAULT 'voice',
    subject VARCHAR(512) NOT NULL DEFAULT '',
    description TEXT,
    `callerPhone` VARCHAR(32) NULL,
    `contactPhone` VARCHAR(32) NULL,
    `alfawebhookClientId` VARCHAR(128) NULL,
    inn VARCHAR(16) NULL,
    `clientName` VARCHAR(512) NULL,
    `assigneeId` INT NULL,
    `createdByApiKeyId` INT NULL,
    transcript TEXT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_helpdesk_tickets_status (status),
    KEY idx_helpdesk_tickets_assignee (`assigneeId`),
    KEY idx_helpdesk_tickets_category (category),
    KEY idx_helpdesk_tickets_created (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `helpdesk_ticket_messages` (
    id INT NOT NULL AUTO_INCREMENT,
    `ticketId` INT NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'system',
    content TEXT NOT NULL,
    metadata JSON NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_helpdesk_messages_ticket (`ticketId`),
    CONSTRAINT `helpdesk_messages_ticket_fk` FOREIGN KEY (`ticketId`) REFERENCES `helpdesk_tickets` (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `helpdesk_ticket_status_history` (
    id INT NOT NULL AUTO_INCREMENT,
    `ticketId` INT NOT NULL,
    `fromStatus` VARCHAR(32) NULL,
    `toStatus` VARCHAR(32) NOT NULL,
    `changedByUserId` INT NULL,
    note TEXT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_helpdesk_status_history_ticket (`ticketId`),
    CONSTRAINT `helpdesk_status_history_ticket_fk` FOREIGN KEY (`ticketId`) REFERENCES `helpdesk_tickets` (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `helpdesk_client_context` (
    id INT NOT NULL AUTO_INCREMENT,
    `clientKey` VARCHAR(128) NOT NULL,
    `alfawebhookClientId` VARCHAR(128) NULL,
    inn VARCHAR(16) NULL,
    `contextJson` JSON NOT NULL,
    `contextMarkdown` TEXT NOT NULL,
    `contextMarkdownOverride` TEXT NULL,
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_helpdesk_client_context_key (`clientKey`),
    KEY idx_helpdesk_client_context_inn (inn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `helpdesk_pbx_connections` (
    id INT NOT NULL AUTO_INCREMENT,
    `alfawebhookClientId` VARCHAR(128) NOT NULL,
    url VARCHAR(512) NOT NULL,
    `apiKeyEncrypted` TEXT NOT NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'cloud',
    label VARCHAR(255) NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_helpdesk_pbx_client (`alfawebhookClientId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `helpdesk_settings` (
    id INT NOT NULL AUTO_INCREMENT,
    `notificationEmails` JSON NOT NULL,
    `notificationTelegramChatIds` JSON NOT NULL,
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `helpdesk_settings` (`notificationEmails`, `notificationTelegramChatIds`)
SELECT JSON_ARRAY(), JSON_ARRAY()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `helpdesk_settings` LIMIT 1);
