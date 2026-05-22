-- EDO participant id + cert thumbprint for issuers; invitation state for client organizations
-- Column names: camelCase (matches Sequelize models, same as bankBic / legalForm)
ALTER TABLE our_organizations ADD COLUMN `edoParticipantId` VARCHAR(128) NULL;
ALTER TABLE our_organizations ADD COLUMN `sbisCertThumbprint` VARCHAR(64) NULL;

ALTER TABLE organizations ADD COLUMN `edoParticipantId` VARCHAR(128) NULL;
ALTER TABLE organizations ADD COLUMN `edoInvitationId` VARCHAR(64) NULL;
ALTER TABLE organizations ADD COLUMN `edoInvitationStateCode` SMALLINT NULL;
ALTER TABLE organizations ADD COLUMN `edoInvitationStateAt` DATETIME NULL;
ALTER TABLE organizations ADD COLUMN `edoInvitationCheckedAt` DATETIME NULL;
