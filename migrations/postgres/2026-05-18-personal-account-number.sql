-- Personal account (лицевой счёт) for B2B bank top-up identification
-- Dialect: PostgreSQL

ALTER TABLE users ADD COLUMN IF NOT EXISTS "personalAccountNumber" VARCHAR(32) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_personal_account_number_unique ON users ("personalAccountNumber")
    WHERE "personalAccountNumber" IS NOT NULL;

UPDATE users
SET "personalAccountNumber" = 'AIPBX-' || LPAD(id::text, 8, '0')
WHERE "personalAccountNumber" IS NULL
  AND ("vpbx_user_id" IS NULL OR "vpbx_user_id" = id);
