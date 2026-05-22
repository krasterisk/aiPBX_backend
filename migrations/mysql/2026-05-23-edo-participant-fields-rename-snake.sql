-- Optional: run only if 2026-05-22 was applied with snake_case names (edo_participant_id → edoParticipantId)
-- Skip if columns are already camelCase or missing.

ALTER TABLE our_organizations CHANGE COLUMN `edo_participant_id` `edoParticipantId` VARCHAR(128) NULL;
ALTER TABLE our_organizations CHANGE COLUMN `sbis_cert_thumbprint` `sbisCertThumbprint` VARCHAR(64) NULL;

ALTER TABLE organizations CHANGE COLUMN `edo_participant_id` `edoParticipantId` VARCHAR(128) NULL;
ALTER TABLE organizations CHANGE COLUMN `edo_invitation_id` `edoInvitationId` VARCHAR(64) NULL;
ALTER TABLE organizations CHANGE COLUMN `edo_invitation_state_code` `edoInvitationStateCode` SMALLINT NULL;
ALTER TABLE organizations CHANGE COLUMN `edo_invitation_state_at` `edoInvitationStateAt` DATETIME NULL;
ALTER TABLE organizations CHANGE COLUMN `edo_invitation_checked_at` `edoInvitationCheckedAt` DATETIME NULL;
