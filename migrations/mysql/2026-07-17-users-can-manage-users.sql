-- Sub-user flag: manage tenant users + receive tenant balance notifications
-- Dialect: MySQL

ALTER TABLE users
    ADD COLUMN `canManageUsers` TINYINT(1) NOT NULL DEFAULT 0;
