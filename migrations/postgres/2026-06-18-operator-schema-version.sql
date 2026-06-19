-- Migration: schemaVersion column on operator_analytics (additive, no data loss)
-- Dialect: PostgreSQL
-- Records the project's currentSchemaVersion at analysis time for historical trends.

ALTER TABLE operator_analytics
    ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER NULL;
