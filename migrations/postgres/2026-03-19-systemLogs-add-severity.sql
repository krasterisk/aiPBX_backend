-- Add severity column to systemLogs table
-- Classifies log entries by criticality: info, warning, critical

-- Create ENUM type (safe for re-runs)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_systemLogs_severity') THEN
        CREATE TYPE "enum_systemLogs_severity" AS ENUM ('info', 'warning', 'critical');
    END IF;
END$$;

ALTER TABLE "systemLogs"
    ADD COLUMN IF NOT EXISTS "severity" "enum_systemLogs_severity" NOT NULL DEFAULT 'info';
