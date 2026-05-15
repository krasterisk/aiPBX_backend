-- Migration: Add non-realtime pipeline fields to aiAssistants
-- Dialect: MySQL 8.0.12+

ALTER TABLE `aiAssistants`
    ADD COLUMN IF NOT EXISTS `pipelineMode` VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS `sttProvider` VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS `llmProvider` VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS `llmModel` VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS `ttsProvider` VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS `ttsVoice` VARCHAR(255) NULL;
