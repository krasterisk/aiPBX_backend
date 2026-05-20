-- Personal account (лицевой счёт) for B2B bank top-up identification
-- Dialect: MySQL 8.0+

ALTER TABLE users ADD COLUMN IF NOT EXISTS `personalAccountNumber` VARCHAR(32) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS `users_personalAccountNumber_unique` ON users (`personalAccountNumber`);

UPDATE users
SET `personalAccountNumber` = CONCAT('AIPBX-', LPAD(id, 8, '0'))
WHERE `personalAccountNumber` IS NULL
  AND (`vpbx_user_id` IS NULL OR `vpbx_user_id` = id);
