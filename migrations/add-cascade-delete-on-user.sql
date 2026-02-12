-- Migration: Add ON DELETE CASCADE to all foreign keys referencing users(id)
-- Date: 2026-02-12
-- Description: When a user is deleted, all related records will be automatically removed
--
-- IMPORTANT: Before running this migration, execute this query to verify the actual
-- constraint names in YOUR database (they may differ from the defaults below):
--
-- SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
-- FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
-- WHERE REFERENCED_TABLE_NAME = 'users'
--   AND REFERENCED_COLUMN_NAME = 'id'
--   AND TABLE_SCHEMA = 'aiPBX';
--
-- If any CONSTRAINT_NAME differs, update the DROP FOREIGN KEY statements below accordingly.

-- 1. prices
ALTER TABLE `prices` DROP FOREIGN KEY `prices_ibfk_1`;
ALTER TABLE `prices` ADD CONSTRAINT `prices_ibfk_1`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. user_limits
ALTER TABLE `user_limits` DROP FOREIGN KEY `user_limits_ibfk_1`;
ALTER TABLE `user_limits` ADD CONSTRAINT `user_limits_ibfk_1`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. widget_keys
ALTER TABLE `widget_keys` DROP FOREIGN KEY `widget_keys_ibfk_1`;
ALTER TABLE `widget_keys` ADD CONSTRAINT `widget_keys_ibfk_1`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. PbxServers
ALTER TABLE `PbxServers` DROP FOREIGN KEY `PbxServers_ibfk_1`;
ALTER TABLE `PbxServers` ADD CONSTRAINT `PbxServers_ibfk_1`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. organizations
ALTER TABLE `organizations` DROP FOREIGN KEY `organizations_ibfk_1`;
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_ibfk_1`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. SipAccounts
ALTER TABLE `SipAccounts` DROP FOREIGN KEY `SipAccounts_ibfk_2`;
ALTER TABLE `SipAccounts` ADD CONSTRAINT `SipAccounts_ibfk_2`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. systemLogs
ALTER TABLE `systemLogs` DROP FOREIGN KEY `systemLogs_ibfk_1`;
ALTER TABLE `systemLogs` ADD CONSTRAINT `systemLogs_ibfk_1`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. aiAssistants
ALTER TABLE `aiAssistants` DROP FOREIGN KEY `aiAssistants_ibfk_1`;
ALTER TABLE `aiAssistants` ADD CONSTRAINT `aiAssistants_ibfk_1`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. aiTools
ALTER TABLE `aiTools` DROP FOREIGN KEY `aiTools_ibfk_1`;
ALTER TABLE `aiTools` ADD CONSTRAINT `aiTools_ibfk_1`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. user_roles (join table)
ALTER TABLE `user_roles` DROP FOREIGN KEY `user_roles_ibfk_2`;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_ibfk_2`
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
