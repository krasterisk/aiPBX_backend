BEGIN;
ALTER TABLE operator_projects ADD COLUMN IF NOT EXISTS "topicSchemeState" jsonb NULL;
COMMIT;
