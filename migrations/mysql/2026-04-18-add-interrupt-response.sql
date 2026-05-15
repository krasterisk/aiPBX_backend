-- Migration: Add interrupt_response to aiAssistants
-- Dialect: MySQL 8.0.12+

ALTER TABLE `aiAssistants`
    ADD COLUMN IF NOT EXISTS `interrupt_response` TINYINT(1) NOT NULL DEFAULT 1;
