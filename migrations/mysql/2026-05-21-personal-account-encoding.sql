-- Re-encode personal account numbers: AIPBX- + (ownerId * K + OFFSET) mod 10^8
-- MUST match PERSONAL_ACCOUNT_K / PERSONAL_ACCOUNT_OFFSET in backend .env before run.
-- Defaults below: K=73856093, OFFSET=48291037 (same as .env.example)

UPDATE users
SET `personalAccountNumber` = CONCAT(
    'AIPBX-',
    LPAD(((id * 73856093 + 48291037) % 100000000), 8, '0')
)
WHERE `vpbx_user_id` IS NULL;

UPDATE users
SET `personalAccountNumber` = NULL
WHERE `vpbx_user_id` IS NOT NULL;
