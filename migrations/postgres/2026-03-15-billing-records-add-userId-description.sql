-- Add userId and description columns to billingRecords table
-- for direct user filtering and human-readable charge descriptions

ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "userId" VARCHAR(255);
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "description" VARCHAR(255);

-- Drop FK constraint on channelId — billingRecords now stores
-- non-call charges (prompts, insights) with synthetic channelIds
ALTER TABLE "billingRecords" DROP CONSTRAINT IF EXISTS "billingRecords_channelId_fkey";

-- Backfill userId from aiCdr for existing records
UPDATE "billingRecords" br
SET "userId" = ac."userId"
FROM "aiCdr" ac
WHERE br."channelId" = ac."channelId"
  AND br."userId" IS NULL;
