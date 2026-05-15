-- Cached client-currency cost on CDR (mirrors billing FX snapshot at hangup)

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
