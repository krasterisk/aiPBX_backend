-- Migration: LLM input/output token split on billingRecords (additive, no data loss)
-- Dialect: MySQL 8.0.12+
-- Enables per-call cost decomposition (LLM in/out tokens). Legacy rows stay NULL.

ALTER TABLE billingRecords
    ADD COLUMN IF NOT EXISTS `textTokensIn` INT NULL,
    ADD COLUMN IF NOT EXISTS `textTokensOut` INT NULL;
