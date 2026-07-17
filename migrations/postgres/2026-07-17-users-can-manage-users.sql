-- Sub-user flag: manage tenant users + receive tenant balance notifications
-- Dialect: PostgreSQL

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS "canManageUsers" BOOLEAN NOT NULL DEFAULT FALSE;
