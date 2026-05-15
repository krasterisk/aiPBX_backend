-- Add robokassaInvId column to payments table
-- Dialect: MySQL 8.0.12+

ALTER TABLE payments ADD COLUMN IF NOT EXISTS `robokassaInvId` INT NULL;
