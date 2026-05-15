-- FX snapshot columns on billingRecords (per-usage client currency)

ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(8) NOT NULL DEFAULT 'USD';
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "amountCurrency" DECIMAL(14, 4);
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "fxRateUsdToCurrency" DECIMAL(18, 8);
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "fxRateSource" VARCHAR(32);
ALTER TABLE "billingRecords" ADD COLUMN IF NOT EXISTS "fxCapturedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "idx_billing_records_user_currency_created"
    ON "billingRecords" ("userId", "currency", "createdAt");
