-- Chat entity for text-based helpdesk
-- Dialect: MySQL 8.0+

CREATE TABLE IF NOT EXISTS `chats` (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    instruction TEXT,
    model VARCHAR(100) DEFAULT 'qwen3:8b',
    temperature VARCHAR(10) DEFAULT '0.7',
    `userId` INT NOT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_chats_user ON `chats` (`userId`);

CREATE TABLE IF NOT EXISTS `chat_aiTools` (
    `toolId` INT NOT NULL,
    `chatId` INT NOT NULL,
    PRIMARY KEY (`toolId`, `chatId`),
    CONSTRAINT `chat_aiTools_tool_fk` FOREIGN KEY (`toolId`) REFERENCES `aiTools` (id) ON DELETE CASCADE,
    CONSTRAINT `chat_aiTools_chat_fk` FOREIGN KEY (`chatId`) REFERENCES `chats` (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
