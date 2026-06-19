-- Migration: schemaVersion column on operator_analytics (additive, no data loss)
-- Dialect: MySQL 8.0.12+
-- Records the project's currentSchemaVersion at analysis time for historical trends.

ALTER TABLE operator_analytics
    ADD COLUMN IF NOT EXISTS `schemaVersion` INT NULL;
