-- Migration: promptVersion column on operator_analytics (additive, no data loss)
-- Dialect: PostgreSQL
-- Records the analysis prompt/rubric artifact version used at analysis time
-- so historical analyses stay comparable and offline evals tie to a prompt revision.

ALTER TABLE operator_analytics
    ADD COLUMN IF NOT EXISTS "promptVersion" VARCHAR(255) NULL;
