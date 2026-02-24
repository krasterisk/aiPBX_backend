-- Migration: Recreate all operator-analytics tables
-- Date: 2026-02-22
-- Dialect: PostgreSQL
-- WARNING: This drops and recreates tables. All existing data will be lost.

-- ─── Drop existing tables (order matters due to potential FK references) ─────

DROP TABLE IF EXISTS operator_api_tokens CASCADE;
DROP TABLE IF EXISTS operator_analytics CASCADE;
DROP TABLE IF EXISTS operator_projects CASCADE;

-- ─── operator_projects ──────────────────────────────────────────────────────

CREATE TABLE operator_projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    "userId" VARCHAR(255) NOT NULL,

    -- Dynamic Analytics fields
    "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
    "systemPrompt" TEXT,
    "customMetricsSchema" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "currentSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "visibleDefaultMetrics" JSONB NOT NULL DEFAULT '["greeting_quality","script_compliance","politeness_empathy","active_listening","objection_handling","product_knowledge","problem_resolution","speech_clarity_pace","closing_quality"]'::jsonb,
    "dashboardConfig" JSONB NOT NULL DEFAULT '{"widgets":[],"maxWidgets":20}'::jsonb,
    "webhookUrl" VARCHAR(500),
    "webhookEvents" JSONB NOT NULL DEFAULT '[]'::jsonb,

    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_projects_userId ON operator_projects ("userId");

-- ─── operator_analytics ─────────────────────────────────────────────────────

CREATE TABLE operator_analytics (
    id SERIAL PRIMARY KEY,
    "userId" VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'frontend',
    status VARCHAR(50) NOT NULL DEFAULT 'processing',

    "operatorName" VARCHAR(255),
    "clientPhone" VARCHAR(255),
    "projectId" INTEGER REFERENCES operator_projects(id) ON DELETE SET NULL,
    language VARCHAR(10) DEFAULT 'auto',

    transcription TEXT,
    metrics JSONB,
    "customMetrics" JSONB,
    "customMetricsDef" JSONB,
    "schemaVersion" INTEGER,
    "sttProvider" VARCHAR(50),

    duration FLOAT,
    cost FLOAT DEFAULT 0,
    "llmCost" FLOAT DEFAULT 0,
    "sttCost" FLOAT DEFAULT 0,
    tokens INTEGER DEFAULT 0,

    "errorMessage" TEXT,
    "recordUrl" VARCHAR(1024),

    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_analytics_userId ON operator_analytics ("userId");
CREATE INDEX idx_operator_analytics_projectId ON operator_analytics ("projectId");
CREATE INDEX idx_operator_analytics_status ON operator_analytics (status);
CREATE INDEX idx_operator_analytics_createdAt ON operator_analytics ("createdAt");

-- ─── operator_api_tokens ────────────────────────────────────────────────────

CREATE TABLE operator_api_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    "userId" VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    "projectId" INTEGER REFERENCES operator_projects(id) ON DELETE SET NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "lastUsedAt" TIMESTAMP WITH TIME ZONE,

    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_api_tokens_userId ON operator_api_tokens ("userId");
CREATE INDEX idx_operator_api_tokens_token ON operator_api_tokens (token);

-- ─── SipTrunks: new columns ─────────────────────────────────────────────────

ALTER TABLE "SipTrunks"
    ADD COLUMN IF NOT EXISTS "trunkType" VARCHAR(20) NOT NULL DEFAULT 'registration',
    ADD COLUMN IF NOT EXISTS "transport" VARCHAR(10) NOT NULL DEFAULT 'udp',
    ADD COLUMN IF NOT EXISTS "domain" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "callerId" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "providerIp" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "records" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "SipTrunks" DROP COLUMN IF EXISTS "requireAuth";

-- ─── prices: new stt column ─────────────────────────────────────────────────

ALTER TABLE prices
    ADD COLUMN IF NOT EXISTS stt FLOAT NOT NULL DEFAULT 0;
