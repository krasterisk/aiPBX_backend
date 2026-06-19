-- Migration: normalized metric_values table (dual-write alongside JSON)
-- Dialect: PostgreSQL

CREATE TABLE IF NOT EXISTS operator_metric_values (
    id SERIAL PRIMARY KEY,
    "channelId" VARCHAR(255) NOT NULL,
    "userId" VARCHAR(255),
    "projectId" INTEGER,
    "metricId" VARCHAR(255) NOT NULL,
    origin VARCHAR(20) NOT NULL,
    "numValue" DOUBLE PRECISION,
    "boolValue" BOOLEAN,
    "strValue" VARCHAR(255),
    "schemaVersion" INTEGER,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metric_values_metric_channel ON operator_metric_values ("metricId", "channelId");
CREATE INDEX IF NOT EXISTS idx_metric_values_channel ON operator_metric_values ("channelId");
CREATE INDEX IF NOT EXISTS idx_metric_values_user ON operator_metric_values ("userId");
CREATE INDEX IF NOT EXISTS idx_metric_values_project ON operator_metric_values ("projectId");
