-- Payments: RU bank invoice / FX / idempotency
-- Dialect: MySQL 8.0.12+ (partial unique index replaced by unique on nullable column)

ALTER TABLE payments ADD COLUMN IF NOT EXISTS `alfaInvId` VARCHAR(128) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS `idempotencyKey` VARCHAR(128) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS `fxRateRubUsd` DECIMAL(18, 8) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS `amountRub` DECIMAL(14, 2) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS `organizationDocumentId` CHAR(36) NULL;

CREATE UNIQUE INDEX idx_payments_idempotency ON payments (`idempotencyKey`);
CREATE INDEX idx_payments_alfa_inv ON payments (`alfaInvId`);
