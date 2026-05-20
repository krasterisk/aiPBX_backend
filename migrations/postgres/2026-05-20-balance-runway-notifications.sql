CREATE TABLE IF NOT EXISTS balance_runway_notifications (
    "ownerUserId" INTEGER NOT NULL PRIMARY KEY,
    "lastNotifiedAt" TIMESTAMPTZ NOT NULL,
    "lastForecastDays" DOUBLE PRECISION NOT NULL,
    "lastDailyBurnUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_balance_runway_notifications_owner
        FOREIGN KEY ("ownerUserId") REFERENCES users(id) ON DELETE CASCADE
);
