-- Migration: anomalyLastAlertAt on operator_projects (additive)
-- Dialect: PostgreSQL

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS "anomalyLastAlertAt" TIMESTAMP WITH TIME ZONE NULL;
