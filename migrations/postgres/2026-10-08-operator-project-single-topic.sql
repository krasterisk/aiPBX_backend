-- Optional single-topic classification; existing projects keep multi-topic mode.
ALTER TABLE operator_projects ADD COLUMN IF NOT EXISTS "singleTopic" BOOLEAN NOT NULL DEFAULT FALSE;
