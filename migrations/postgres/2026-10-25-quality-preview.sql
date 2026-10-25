-- Isolated Q2 preview. Existing tables are never populated or updated by this migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS quality_preview_analytics (LIKE "aiAnalytics" INCLUDING DEFAULTS);
ALTER TABLE quality_preview_analytics ALTER COLUMN id DROP DEFAULT;
CREATE SEQUENCE IF NOT EXISTS quality_preview_analytics_id_seq OWNED BY quality_preview_analytics.id;
ALTER TABLE quality_preview_analytics ALTER COLUMN id SET DEFAULT nextval('quality_preview_analytics_id_seq');
CREATE UNIQUE INDEX IF NOT EXISTS qp_analytics_channel ON quality_preview_analytics("channelId");
CREATE TABLE IF NOT EXISTS quality_preview_values (LIKE operator_metric_values INCLUDING DEFAULTS);
ALTER TABLE quality_preview_values ALTER COLUMN id DROP DEFAULT;
CREATE SEQUENCE IF NOT EXISTS quality_preview_values_id_seq OWNED BY quality_preview_values.id;
ALTER TABLE quality_preview_values ALTER COLUMN id SET DEFAULT nextval('quality_preview_values_id_seq');
CREATE INDEX IF NOT EXISTS qp_values_channel ON quality_preview_values("userId","channelId");
CREATE TABLE IF NOT EXISTS quality_preview_overrides (LIKE operator_metric_overrides INCLUDING DEFAULTS);
ALTER TABLE quality_preview_overrides ALTER COLUMN id DROP DEFAULT;
CREATE SEQUENCE IF NOT EXISTS quality_preview_overrides_id_seq OWNED BY quality_preview_overrides.id;
ALTER TABLE quality_preview_overrides ALTER COLUMN id SET DEFAULT nextval('quality_preview_overrides_id_seq');
CREATE UNIQUE INDEX IF NOT EXISTS qp_override_channel_metric ON quality_preview_overrides("channelId","metricId");
CREATE TABLE IF NOT EXISTS quality_preview_scorecards (LIKE quality_scorecard_revisions INCLUDING DEFAULTS);
CREATE UNIQUE INDEX IF NOT EXISTS qp_cards_id ON quality_preview_scorecards(id);
CREATE TABLE IF NOT EXISTS quality_preview_runs (LIKE quality_analysis_runs INCLUDING DEFAULTS);
CREATE UNIQUE INDEX IF NOT EXISTS qp_runs_id ON quality_preview_runs(id);
CREATE UNIQUE INDEX IF NOT EXISTS qp_runs_operation ON quality_preview_runs("operationKey");
CREATE INDEX IF NOT EXISTS qp_runs_history ON quality_preview_runs("userId","channelId","createdAt" DESC,id DESC);
CREATE TABLE IF NOT EXISTS quality_preview_rules ("projectId" INTEGER PRIMARY KEY,"userId" VARCHAR(255) NOT NULL,config JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
DO $$ BEGIN
 ALTER TABLE quality_preview_analytics ADD CONSTRAINT qp_analytics_cdr FOREIGN KEY ("channelId") REFERENCES "aiCdr"("channelId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE quality_preview_runs ADD CONSTRAINT qp_runs_analytics FOREIGN KEY ("channelId") REFERENCES quality_preview_analytics("channelId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE quality_preview_values ADD CONSTRAINT qp_values_analytics FOREIGN KEY ("channelId") REFERENCES quality_preview_analytics("channelId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE quality_preview_overrides ADD CONSTRAINT qp_overrides_analytics FOREIGN KEY ("channelId") REFERENCES quality_preview_analytics("channelId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;
