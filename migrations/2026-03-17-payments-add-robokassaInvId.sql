-- Add robokassaInvId column to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS "robokassaInvId" INTEGER;
