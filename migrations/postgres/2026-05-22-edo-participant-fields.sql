-- EDO participant id + cert thumbprint for issuers; invitation state for client organizations
-- Column names: camelCase (matches Sequelize models)
ALTER TABLE our_organizations ADD COLUMN IF NOT EXISTS "edoParticipantId" VARCHAR(128) NULL;
ALTER TABLE our_organizations ADD COLUMN IF NOT EXISTS "sbisCertThumbprint" VARCHAR(64) NULL;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "edoParticipantId" VARCHAR(128) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "edoInvitationId" VARCHAR(64) NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "edoInvitationStateCode" SMALLINT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "edoInvitationStateAt" TIMESTAMPTZ NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "edoInvitationCheckedAt" TIMESTAMPTZ NULL;
