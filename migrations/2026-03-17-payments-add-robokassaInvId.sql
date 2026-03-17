-- Add robokassaInvId column to payments table

-- PostgreSQL
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "robokassaInvId" INTEGER;
