-- Migration: transcription quality fields on operator_analytics
-- Dialect: MySQL 8.0.12+

ALTER TABLE operator_analytics
    ADD COLUMN IF NOT EXISTS transcriptionQuality VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS transcriptionConfidence FLOAT NULL,
    ADD COLUMN IF NOT EXISTS detectedLanguage VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS qualityReasons JSON NULL;
