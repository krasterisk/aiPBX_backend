-- Migration: Add assistant-mcpServer join table
-- Date: 2026-02-16
-- Description: Many-to-Many relationship between aiAssistants and mcpServers

CREATE TABLE IF NOT EXISTS `aiAssistant_mcpServers` (
  `mcpServerId` INT NOT NULL,
  `assistantId` INT NOT NULL,
  PRIMARY KEY (`mcpServerId`, `assistantId`),
  FOREIGN KEY (`mcpServerId`) REFERENCES `mcpServers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`assistantId`) REFERENCES `aiAssistants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
