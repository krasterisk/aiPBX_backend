-- Migration: LLM input/output token split on billingRecords (additive, no data loss)
-- Dialect: PostgreSQL
-- Enables per-call cost decomposition (LLM in/out tokens). Legacy rows stay NULL.

ALTER TABLE "billingRecords"
    ADD COLUMN IF NOT EXISTS "textTokensIn" INTEGER NULL,
    ADD COLUMN IF NOT EXISTS "textTokensOut" INTEGER NULL;
