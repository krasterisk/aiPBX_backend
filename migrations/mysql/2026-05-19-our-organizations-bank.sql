ites for our_organizations (invoice PDF issuer block)
ALTER TABLE our_organizations ADD COLUMN `bankName` VARCHAR(255) NULL;
ALTER TABLE our_organizations ADD COLUMN `bankBranchName` VARCHAR(255) NULL;
ALTER TABLE our_organizations ADD COLUMN `bankBic` VARCHAR(12) NULL;
ALTER TABLE our_organizations ADD COLUMN `bankAccount` VARCHAR(32) NULL;
ALTER TABLE our_organizations ADD COLUMN `bankCorrAccount` VARCHAR(32) NULL;
