-- Migration: promptVersion column on operator_analytics (additive, no data loss)
-- Dialect: MySQL 8.0.12+
-- Records the analysis prompt/rubric artifact version used at analysis time
-- so historical analyses stay comparable and offline evals tie to a prompt revision.

