-- Migration: per-project critical alert settings (additive, disabled by default)
-- Dialect: PostgreSQL

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS "alertConfig" JSONB NULL;
