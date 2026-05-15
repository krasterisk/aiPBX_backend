-- Knowledge Base tables (MySQL; no pgvector — embedding search uses app/SQL outside Sequelize)
-- Dialect: MySQL 8.0+

CREATE TABLE IF NOT EXISTS `knowledgeBases` (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    `documentsCount` INT DEFAULT 0,
    `chunksCount` INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    `userId` INT NOT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kb_user ON `knowledgeBases` (`userId`);

CREATE TABLE IF NOT EXISTS `knowledgeDocuments` (
    id INT NOT NULL AUTO_INCREMENT,
    `knowledgeBaseId` INT NOT NULL,
    `fileName` VARCHAR(500) NOT NULL,
    `fileType` VARCHAR(50) NULL,
    `fileSize` INT NULL,
    `sourceUrl` VARCHAR(2000) NULL,
    `chunksCount` INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'processing',
    `errorMessage` TEXT,
    `userId` INT NOT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY `idx_docs_kb` (`knowledgeBaseId`),
    CONSTRAINT `knowledgeDocuments_kb_fk` FOREIGN KEY (`knowledgeBaseId`) REFERENCES `knowledgeBases` (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `knowledgeChunks` (
    id INT NOT NULL AUTO_INCREMENT,
    `documentId` INT NOT NULL,
    `knowledgeBaseId` INT NOT NULL,
    content TEXT NOT NULL,
    metadata JSON NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY `idx_chunks_kb` (`knowledgeBaseId`),
    KEY `idx_chunks_document` (`documentId`),
    CONSTRAINT `knowledgeChunks_doc_fk` FOREIGN KEY (`documentId`) REFERENCES `knowledgeDocuments` (id) ON DELETE CASCADE,
    CONSTRAINT `knowledgeChunks_kb_fk` FOREIGN KEY (`knowledgeBaseId`) REFERENCES `knowledgeBases` (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
