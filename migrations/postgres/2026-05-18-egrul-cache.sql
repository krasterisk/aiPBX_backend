CREATE TABLE IF NOT EXISTS egrul_cache (
    inn VARCHAR(12) PRIMARY KEY,
    kpp VARCHAR(9),
    payload JSONB NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'saby_edo',
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_egrul_cache_expires ON egrul_cache ("expiresAt");
