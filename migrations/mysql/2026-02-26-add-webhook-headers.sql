-- Migration: Add webhookHeaders to operator_projects
-- Dialect: MySQL 8.0.12+ (ADD COLUMN IF NOT EXISTS)

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS `webhookHeaders` JSON NOT NULL DEFAULT (CAST('{}' AS JSON));
