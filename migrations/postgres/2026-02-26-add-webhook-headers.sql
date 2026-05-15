-- Migration: Add webhookHeaders to operator_projects
-- Date: 2026-02-26
-- Description: Adds webhookHeaders column for custom HTTP headers sent with webhook requests (e.g. Authorization)

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS "webhookHeaders" JSONB NOT NULL DEFAULT '{}'::jsonb;
