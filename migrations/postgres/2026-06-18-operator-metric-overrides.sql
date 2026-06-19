-- Migration: human supervisor metric overrides (stored separately from LLM values)
-- Dialect: PostgreSQL

CREATE TABLE IF NOT EXISTS operator_metric_overrides (
    id SERIAL PRIMARY KEY,
    "channelId" VARCHAR(255) NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "actorUserId" VARCHAR(255) NOT NULL,
    "metricId" VARCHAR(255) NOT NULL,
    origin VARCHAR(20) NOT NULL,
    "numValue" DOUBLE PRECISION,
    "boolValue" BOOLEAN,
    "strValue" VARCHAR(255),
    note TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_override_channel_metric ON operator_metric_overrides ("channelId", "metricId");
CREATE INDEX IF NOT EXISTS idx_override_channel ON operator_metric_overrides ("channelId");
CREATE INDEX IF NOT EXISTS idx_override_user ON operator_metric_overrides ("userId");
