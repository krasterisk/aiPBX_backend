-- Balance threshold alerts (tenant-scoped, multiple rules per owner)
-- PostgreSQL (quoted camelCase, same as Sequelize models)

CREATE TABLE IF NOT EXISTS balance_threshold_alerts (
    id SERIAL PRIMARY KEY,
    "ownerUserId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "limitAmount" DOUBLE PRECISION NOT NULL,
    emails JSONB NOT NULL DEFAULT '[]'::jsonb,
    "notifyUserIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "sendInvoice" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" INTEGER NULL,
    "invoiceAmountMode" VARCHAR(32) NOT NULL DEFAULT 'fixed',
    "invoiceAmountRub" DOUBLE PRECISION NULL,
    "sendViaEdo" BOOLEAN NOT NULL DEFAULT false,
    "lastTriggeredAt" TIMESTAMP NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_threshold_alerts_owner
    ON balance_threshold_alerts ("ownerUserId");

INSERT INTO balance_threshold_alerts (
    "ownerUserId",
    "limitAmount",
    emails,
    "notifyUserIds"
)
SELECT
    ul."userId",
    ul."limitAmount",
    ul.emails,
    '[]'::jsonb
FROM user_limits ul
WHERE NOT EXISTS (
    SELECT 1 FROM balance_threshold_alerts b WHERE b."ownerUserId" = ul."userId"
);
