-- Migration: audio SHA-256 for upload deduplication (§13)
-- Dialect: MySQL

ALTER TABLE operator_analytics
    ADD COLUMN audioSha256 VARCHAR(64) NULL;

CREATE INDEX idx_operator_analytics_audio_hash_project
    ON operator_analytics (audioSha256, projectId);
