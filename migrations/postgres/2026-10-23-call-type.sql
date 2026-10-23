-- Apply before deploying the callType models. No historical-row UPDATE/backfill.
BEGIN;
ALTER TABLE operator_analytics ADD COLUMN IF NOT EXISTS "callType" VARCHAR(16) NULL;
ALTER TABLE "aiCdr" ADD COLUMN IF NOT EXISTS "callType" VARCHAR(16) NULL;
ALTER TABLE operator_analytics ALTER COLUMN "callType" SET DEFAULT 'incoming';
ALTER TABLE "aiCdr" ALTER COLUMN "callType" SET DEFAULT 'incoming';
COMMIT;
