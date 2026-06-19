-- Migration: per-project monthly budget fields (additive, disabled by default)
-- Dialect: MySQL 8.0.12+

ALTER TABLE operator_projects
    ADD COLUMN IF NOT EXISTS `monthlyBudgetUsd` FLOAT NULL,
    ADD COLUMN IF NOT EXISTS `budgetAlertEmails` JSON NULL,
    ADD COLUMN IF NOT EXISTS `budgetLastAlertAt` DATETIME NULL;
