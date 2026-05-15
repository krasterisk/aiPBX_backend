-- Add severity column to systemLogs (VARCHAR; app validates values)
-- Dialect: MySQL 8.0.12+

ALTER TABLE `systemLogs`
    ADD COLUMN IF NOT EXISTS `severity` VARCHAR(16) NOT NULL DEFAULT 'info';
