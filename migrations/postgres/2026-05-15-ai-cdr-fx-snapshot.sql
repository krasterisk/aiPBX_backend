-- Cached client-currency cost on CDR (mirrors billing FX snapshot at hangup)
-- Prerequisite: billingRecords FX columns (see 2026-05-15-billing-records-fx-snapshot.sql)

ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(8) NOT NULL DEFAULT 'USD';
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "amountCurrency" DECIMAL(14, 4);
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "fxRateUsdToCurrency" DECIMAL(18, 8);
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "fxRateSource" VARCHAR(32);
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "fxCapturedAt" TIMESTAMPTZ;

ALTER TABLE "aiCdr" ADD COLUMN IF NOT EXISTS "costCurrency" VARCHAR(8);
ALTER TABLE "aiCdr" ADD COLUMN IF NOT EXISTS "amountCurrency" DECIMAL(14, 4);

UPDATE "aiCdr" ac
SET
    "amountCurrency" = sub.sum_client,
    "costCurrency" = sub.ccy
FROM (
    SELECT
        br."channelId",
        SUM(br."amountCurrency") AS sum_client,
        MAX(br."currency") AS ccy
    FROM "billingRecords" br
    WHERE br."amountCurrency" IS NOT NULL
    GROUP BY br."channelId"
) sub
WHERE ac."channelId" = sub."channelId"
  AND ac."amountCurrency" IS NULL;
