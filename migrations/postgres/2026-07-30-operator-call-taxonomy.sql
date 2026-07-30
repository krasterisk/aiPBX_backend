-- Migration: operator call taxonomy column + per-call tag table
-- Dialect: PostgreSQL
-- Date: 2026-07-30

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS "callTaxonomy" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS operator_call_tags (
    id SERIAL PRIMARY KEY,
    "channelId" VARCHAR(255) NOT NULL,
    "userId" VARCHAR(255),
    "projectId" INTEGER,
    "tagId" VARCHAR(100) NOT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'auto',
    "actorUserId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_tags_channel_tag ON operator_call_tags ("channelId", "tagId");
CREATE INDEX IF NOT EXISTS idx_call_tags_tag_project ON operator_call_tags ("tagId", "projectId");
