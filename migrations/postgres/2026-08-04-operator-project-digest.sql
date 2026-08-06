-- Migration: per-project analytics digest settings (additive, disabled by default)
-- Dialect: PostgreSQL

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS "digestConfig" JSONB NULL;
