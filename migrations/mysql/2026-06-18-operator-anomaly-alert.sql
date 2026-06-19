-- Migration: anomalyLastAlertAt on operator_projects (additive)
-- Dialect: MySQL 8.0+

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS `anomalyLastAlertAt` DATETIME NULL;
