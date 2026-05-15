-- Migration: Add non-realtime pipeline fields to aiAssistants
-- Date: 2026-03-20
-- Description: Adds provider selection fields for the non-realtime voice pipeline.
--             All fields are nullable - existing assistants default to realtime mode.

ALTER TABLE "aiAssistants"
ADD COLUMN IF NOT EXISTS "pipelineMode" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "sttProvider" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "llmProvider" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "llmModel" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "ttsProvider" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "ttsVoice" VARCHAR(255);

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'aiAssistants'
AND column_name IN ('pipelineMode', 'sttProvider', 'llmProvider', 'llmModel', 'ttsProvider', 'ttsVoice');
