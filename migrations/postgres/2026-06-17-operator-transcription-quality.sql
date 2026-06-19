-- Migration: transcription quality fields on operator_analytics
-- Dialect: PostgreSQL

ALTER TABLE operator_analytics
    ADD COLUMN IF NOT EXISTS "transcriptionQuality" VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS "transcriptionConfidence" DOUBLE PRECISION NULL,
    ADD COLUMN IF NOT EXISTS "detectedLanguage" VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS "qualityReasons" JSONB NULL;
