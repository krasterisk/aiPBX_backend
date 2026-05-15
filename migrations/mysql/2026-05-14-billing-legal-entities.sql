-- RU legal entities: organizations extensions, documents, counters, balance ledger, currency history
-- Dialect: MySQL 8.0.13+ (UUID() default), 8.0.12+ IF NOT EXISTS on columns

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS kpp VARCHAR(9) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ogrn VARCHAR(15) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS `legalForm` VARCHAR(8) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS director VARCHAR(255) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS `bankAccount` VARCHAR(32) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS `bankBic` VARCHAR(12) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS `bankName` VARCHAR(255) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subject TEXT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS `alfawebhookSyncedAt` TIMESTAMP(3) NULL;

CREATE TABLE IF NOT EXISTS `document_counters` (
    `year` INT NOT NULL,
    `docType` VARCHAR(32) NOT NULL,
    `lastNumber` INT NOT NULL DEFAULT 0,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`year`, `docType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `organization_documents` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    `userId` VARCHAR(64) NOT NULL,
    `organizationId` INT NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `number` VARCHAR(64) NOT NULL,
    `series` VARCHAR(8) NOT NULL DEFAULT 'AI',
    `documentDate` DATE NOT NULL,
    `periodFrom` DATE NULL,
    `periodTo` DATE NULL,
    `amountRub` DECIMAL(14, 2) NOT NULL,
    `amountUsd` DECIMAL(14, 4) NULL,
    `fxRate` DECIMAL(14, 6) NULL,
    `vatMode` VARCHAR(8) NOT NULL DEFAULT 'none',
    `vatAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(32) NOT NULL DEFAULT 'issued',
    `paymentId` VARCHAR(64) NULL,
    `relatedAdvanceInvoiceIds` JSON NULL,
    `sbisId` VARCHAR(128) NULL,
    `sbisUrl` TEXT NULL,
    `sbisDocNum` VARCHAR(64) NULL,
    `sbisStatus` VARCHAR(32) NULL,
    `sbisLastError` TEXT NULL,
    `sbisAttemptCount` INT NOT NULL DEFAULT 0,
    `pdfPath` TEXT NULL,
    `externalTransactionId` VARCHAR(128) NULL,
    `idempotencyKey` VARCHAR(128) NULL,
    `subject` TEXT NOT NULL,
    `relatedInvoiceId` CHAR(36) NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT `organization_documents_org_fk` FOREIGN KEY (`organizationId`) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_org_docs_user ON `organization_documents` (`userId`);
CREATE INDEX idx_org_docs_org ON `organization_documents` (`organizationId`);
CREATE INDEX idx_org_docs_type ON `organization_documents` (`type`);
CREATE INDEX idx_org_docs_ext_txn ON `organization_documents` (`externalTransactionId`);
CREATE UNIQUE INDEX idx_org_docs_idempotency ON `organization_documents` (`idempotencyKey`);

CREATE TABLE IF NOT EXISTS `balance_ledger` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(64) NOT NULL,
    `direction` VARCHAR(16) NOT NULL,
    `amountUsd` DECIMAL(14, 4) NOT NULL,
    `balanceBeforeUsd` DECIMAL(14, 4) NOT NULL,
    `balanceAfterUsd` DECIMAL(14, 4) NOT NULL,
    `source` VARCHAR(32) NOT NULL,
    `externalId` VARCHAR(128) NULL,
    `documentId` CHAR(36) NULL,
    `paymentId` VARCHAR(64) NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_balance_ledger_user ON `balance_ledger` (`userId`);
CREATE INDEX idx_balance_ledger_source ON `balance_ledger` (`source`);
CREATE UNIQUE INDEX idx_balance_ledger_idem ON `balance_ledger` (`source`, `externalId`);

CREATE TABLE IF NOT EXISTS `currency_history` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `atDate` DATE NOT NULL,
    `fromCurrency` VARCHAR(8) NOT NULL,
    `toCurrency` VARCHAR(8) NOT NULL,
    `rate` DECIMAL(18, 8) NOT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `currency_history_at_pair` (`atDate`, `fromCurrency`, `toCurrency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
