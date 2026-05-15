-- Payments: RU bank invoice / FX / idempotency (align with balance_ledger externalId)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "alfaInvId" VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "idempotencyKey" VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "fxRateRubUsd" NUMERIC(18, 8);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "amountRub" NUMERIC(14, 2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "organizationDocumentId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_alfa_inv ON payments ("alfaInvId");
