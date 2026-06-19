-- Migration: consent fields on operator_analytics (compliance)
-- Dialect: MySQL 8.0.12+

ALTER TABLE operator_analytics
    ADD COLUMN IF NOT EXISTS consentObtained TINYINT(1) NULL,
    ADD COLUMN IF NOT EXISTS consentSource VARCHAR(255) NULL;
