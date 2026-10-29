/** Additive PostgreSQL schema. Original call time and financial event time are distinct. */
export const RECOVERY_SCHEMA=[
`CREATE TABLE IF NOT EXISTS helpdesk_recovery_quotes (
 id uuid PRIMARY KEY, owner_id text NOT NULL, project_id integer NOT NULL,
 snapshot_hash text NOT NULL, quote jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
)`,
`CREATE TABLE IF NOT EXISTS helpdesk_recovery_jobs (
 id uuid PRIMARY KEY, quote_id uuid NOT NULL UNIQUE REFERENCES helpdesk_recovery_quotes(id),
 owner_id text NOT NULL, project_id integer NOT NULL, approval_id text NOT NULL UNIQUE,
 consent_hash text NOT NULL, approval_hash text NOT NULL,
 state text NOT NULL DEFAULT 'queued', spent_usd numeric(20,6) NOT NULL DEFAULT 0,
 spent_currency numeric(20,6) NOT NULL DEFAULT 0, lease_owner text, heartbeat_at timestamptz,
 stop_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
)`,
`CREATE TABLE IF NOT EXISTS helpdesk_recovery_items (
 job_id uuid NOT NULL REFERENCES helpdesk_recovery_jobs(id), owner_id text NOT NULL, project_id integer NOT NULL,
 record_id integer NOT NULL UNIQUE, recording_key text NOT NULL, received_at timestamptz NOT NULL,
 ingested_at timestamptz NOT NULL, record_hash text NOT NULL, state text NOT NULL DEFAULT 'pending',
 prepared text, charge_usd numeric(20,6), stop_reason text, started_at timestamptz, completed_at timestamptz,
 PRIMARY KEY(job_id,record_id), UNIQUE(owner_id,project_id,recording_key)
)`,
`CREATE INDEX IF NOT EXISTS helpdesk_recovery_queue ON helpdesk_recovery_jobs(state,created_at)`,
`ALTER TABLE operator_analytics ADD COLUMN IF NOT EXISTS "ingestedAt" timestamptz`,
`ALTER TABLE operator_analytics ADD COLUMN IF NOT EXISTS "processedAt" timestamptz`,
`ALTER TABLE "aiCdr" ADD COLUMN IF NOT EXISTS "processedAt" timestamptz`,
];
