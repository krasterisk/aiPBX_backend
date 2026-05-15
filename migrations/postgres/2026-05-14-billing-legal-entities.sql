-- RU legal entities: organizations extensions, documents, counters, balance ledger, currency history
-- PostgreSQL (primary dialect in repo migrations)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- organizations: extra legal / bank / nomenclature fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS kpp VARCHAR(9);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ogrn VARCHAR(15);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "legalForm" VARCHAR(8);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS director VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "bankAccount" VARCHAR(32);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "bankBic" VARCHAR(12);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "bankName" VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "alfawebhookSyncedAt" TIMESTAMP WITH TIME ZONE;

-- document number series per calendar year and logical type
CREATE TABLE IF NOT EXISTS "document_counters" (
    "year" INTEGER NOT NULL,
    "docType" VARCHAR(32) NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY ("year", "docType")
);

-- issued / fiscal documents per organization
CREATE TABLE IF NOT EXISTS "organization_documents" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" VARCHAR(64) NOT NULL,
    "organizationId" INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "type" VARCHAR(32) NOT NULL,
    "number" VARCHAR(64) NOT NULL,
    "series" VARCHAR(8) NOT NULL DEFAULT 'AI',
    "documentDate" DATE NOT NULL,
    "periodFrom" DATE,
    "periodTo" DATE,
    "amountRub" NUMERIC(14, 2) NOT NULL,
    "amountUsd" NUMERIC(14, 4),
    "fxRate" NUMERIC(14, 6),
    "vatMode" VARCHAR(8) NOT NULL DEFAULT 'none',
    "vatAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "status" VARCHAR(32) NOT NULL DEFAULT 'issued',
    "paymentId" VARCHAR(64),
    "relatedAdvanceInvoiceIds" JSONB,
    "sbisId" VARCHAR(128),
    "sbisUrl" TEXT,
    "sbisDocNum" VARCHAR(64),
    "sbisStatus" VARCHAR(32),
    "sbisLastError" TEXT,
    "sbisAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "pdfPath" TEXT,
    "externalTransactionId" VARCHAR(128),
    "idempotencyKey" VARCHAR(128),
    "subject" TEXT NOT NULL,
    "relatedInvoiceId" UUID,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_docs_user ON "organization_documents" ("userId");
CREATE INDEX IF NOT EXISTS idx_org_docs_org ON "organization_documents" ("organizationId");
CREATE INDEX IF NOT EXISTS idx_org_docs_type ON "organization_documents" ("type");
CREATE INDEX IF NOT EXISTS idx_org_docs_ext_txn ON "organization_documents" ("externalTransactionId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_docs_idempotency ON "organization_documents" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- append-only balance movements (USD amounts; credits positive direction stored explicitly)
CREATE TABLE IF NOT EXISTS "balance_ledger" (
    "id" BIGSERIAL PRIMARY KEY,
    "userId" VARCHAR(64) NOT NULL,
    "direction" VARCHAR(16) NOT NULL,
    "amountUsd" NUMERIC(14, 4) NOT NULL,
    "balanceBeforeUsd" NUMERIC(14, 4) NOT NULL,
    "balanceAfterUsd" NUMERIC(14, 4) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "externalId" VARCHAR(128),
    "documentId" UUID,
    "paymentId" VARCHAR(64),
    "meta" JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_ledger_user ON "balance_ledger" ("userId");
CREATE INDEX IF NOT EXISTS idx_balance_ledger_source ON "balance_ledger" ("source");
CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_ledger_idem ON "balance_ledger" ("source", "externalId") WHERE "externalId" IS NOT NULL;

-- snapshot FX at operational dates (optional; also store fx on documents/payments)
CREATE TABLE IF NOT EXISTS "currency_history" (
    "id" SERIAL PRIMARY KEY,
    "atDate" DATE NOT NULL,
    "fromCurrency" VARCHAR(8) NOT NULL,
    "toCurrency" VARCHAR(8) NOT NULL,
    "rate" NUMERIC(18, 8) NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE ("atDate", "fromCurrency", "toCurrency")
);
