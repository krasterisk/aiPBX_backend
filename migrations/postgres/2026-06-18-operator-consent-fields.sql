-- Migration: consent fields on operator_analytics (compliance)
-- Dialect: PostgreSQL

ALTER TABLE operator_analytics
    ADD COLUMN IF NOT EXISTS "consentObtained" BOOLEAN NULL,
    ADD COLUMN IF NOT EXISTS "consentSource" VARCHAR(255) NULL;
