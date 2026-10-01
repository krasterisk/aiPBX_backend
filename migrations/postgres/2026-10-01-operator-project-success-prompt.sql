-- Migration: project-specific success prompt
-- Dialect: PostgreSQL
-- Date: 2026-10-01

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS "successPrompt" TEXT NULL;
