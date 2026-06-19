-- Migration: per-project monthly budget fields (additive, disabled by default)
-- Dialect: PostgreSQL

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS "monthlyBudgetUsd" DOUBLE PRECISION NULL,
    ADD COLUMN IF NOT EXISTS "budgetAlertEmails" JSONB NULL,
    ADD COLUMN IF NOT EXISTS "budgetLastAlertAt" TIMESTAMP WITH TIME ZONE NULL;
