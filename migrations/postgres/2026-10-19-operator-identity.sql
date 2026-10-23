-- Additive, repeatable; old API callers keep NULL identity/extension.
-- Scope external operatorId by userId in every query/grouping.
BEGIN;
ALTER TABLE operator_analytics ADD COLUMN IF NOT EXISTS "operatorId" VARCHAR(128) NULL;
ALTER TABLE operator_analytics ADD COLUMN IF NOT EXISTS "operatorExtension" VARCHAR(64) NULL;
ALTER TABLE "aiCdr" ADD COLUMN IF NOT EXISTS "operatorId" VARCHAR(128) NULL;
ALTER TABLE "aiCdr" ADD COLUMN IF NOT EXISTS "operatorExtension" VARCHAR(64) NULL;
CREATE INDEX IF NOT EXISTS idx_operator_analytics_employee ON operator_analytics ("userId", "operatorId", "projectId");
CREATE INDEX IF NOT EXISTS idx_ai_cdr_employee ON "aiCdr" ("userId", "operatorId", "projectId");
COMMIT;
-- No name-based automatic backfill: use verified source employee mappings.
-- Rollback application first; nullable additive columns may safely remain.
