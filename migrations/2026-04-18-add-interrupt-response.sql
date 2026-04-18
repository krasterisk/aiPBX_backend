-- Migration: Add interrupt_response field to aiAssistants
-- Date: 2026-04-18
-- Description: Adds configurable interrupt_response boolean flag.
--             When true (default), user speech interrupts the AI response.
--             When false, the AI will finish speaking before processing user input.

ALTER TABLE "aiAssistants"
ADD COLUMN IF NOT EXISTS "interrupt_response" BOOLEAN DEFAULT true;

-- Verify
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'aiAssistants'
AND column_name = 'interrupt_response';
