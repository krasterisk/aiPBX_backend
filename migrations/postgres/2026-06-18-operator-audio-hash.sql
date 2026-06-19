-- Migration: audio SHA-256 for upload deduplication (§13)
-- Dialect: PostgreSQL

ALTER TABLE operator_analytics
    ADD COLUMN IF NOT EXISTS "audioSha256" VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_operator_analytics_audio_hash_project
    ON operator_analytics ("audioSha256", "projectId")
    WHERE "audioSha256" IS NOT NULL;
