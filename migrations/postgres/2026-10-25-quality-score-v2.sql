-- Q1 additive migration. Apply before deploying models; leave QUALITY_SCORE_V2_ENABLED=false
-- until backfill/shadow validation. No existing answers or prompts are changed here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE operator_projects ADD COLUMN IF NOT EXISTS "qualityScoreConfig" JSONB NULL;
ALTER TABLE operator_metric_overrides ADD COLUMN IF NOT EXISTS status VARCHAR(24) NULL;
ALTER TABLE "aiAnalytics" ADD COLUMN IF NOT EXISTS "qualityRunId" VARCHAR(36) NULL;
ALTER TABLE "aiAnalytics" ADD COLUMN IF NOT EXISTS "qualityScorecardId" VARCHAR(64) NULL;
ALTER TABLE "aiAnalytics" ADD COLUMN IF NOT EXISTS "qualityScore" DOUBLE PRECISION NULL;
ALTER TABLE "aiAnalytics" ADD COLUMN IF NOT EXISTS "qualityStatus" VARCHAR(24) NULL;
ALTER TABLE "aiAnalytics" ADD COLUMN IF NOT EXISTS "qualityCoverage" DOUBLE PRECISION NULL;
ALTER TABLE "aiAnalytics" ADD COLUMN IF NOT EXISTS "qualityVersion" VARCHAR(40) NULL;
ALTER TABLE "aiAnalytics" ADD COLUMN IF NOT EXISTS "qualityContextIncomplete" BOOLEAN NULL;
ALTER TABLE "aiAnalytics" ADD COLUMN IF NOT EXISTS "qualitySummary" JSONB NULL;
ALTER TABLE operator_metric_values ADD COLUMN IF NOT EXISTS "qualityRunId" VARCHAR(36) NULL;
ALTER TABLE operator_metric_values ADD COLUMN IF NOT EXISTS "qualityStatus" VARCHAR(24) NULL;
ALTER TABLE operator_metric_values ADD COLUMN IF NOT EXISTS "normalizedValue" DOUBLE PRECISION NULL;
ALTER TABLE operator_metric_values ADD COLUMN IF NOT EXISTS "qualityWeight" DOUBLE PRECISION NULL;
ALTER TABLE operator_metric_values ADD COLUMN IF NOT EXISTS "contributesToQuality" BOOLEAN NULL;
CREATE TABLE IF NOT EXISTS quality_scorecard_revisions (
    id VARCHAR(64) PRIMARY KEY,
    "userId" VARCHAR(255) NOT NULL,
    "projectId" INTEGER NULL,
    snapshot JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS quality_analysis_runs (
    id VARCHAR(36) PRIMARY KEY,
    "operationKey" VARCHAR(64) NOT NULL UNIQUE,
    "scorecardRevisionId" VARCHAR(64) NOT NULL REFERENCES quality_scorecard_revisions(id),
    "userId" VARCHAR(255) NOT NULL,
    "projectId" INTEGER NULL,
    "channelId" VARCHAR(255) NOT NULL REFERENCES "aiAnalytics"("channelId") ON DELETE CASCADE,
    "previousRunId" VARCHAR(36) NULL,
    kind VARCHAR(24) NOT NULL,
    "rawSnapshot" JSONB NOT NULL,
    result JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quality_runs_owner_channel_time ON quality_analysis_runs("userId", "channelId", "createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS quality_runs_revision ON quality_analysis_runs("scorecardRevisionId");
CREATE INDEX IF NOT EXISTS analytics_quality_score ON "aiAnalytics"("qualityStatus", "qualityScore", "channelId");
COMMIT;
