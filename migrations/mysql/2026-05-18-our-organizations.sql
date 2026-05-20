-- Issuer organizations (admin) + per-tenant default for invoices / SBIS
-- Dialect: MySQL 8.0+

CREATE TABLE IF NOT EXISTS `our_organizations` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `tin` VARCHAR(255) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `kpp` VARCHAR(9) NULL,
    `ogrn` VARCHAR(15) NULL,
    `legalForm` VARCHAR(8) NULL,
    `director` VARCHAR(255) NULL,
    `isPrimary` TINYINT(1) NOT NULL DEFAULT 0,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No FK on users: table often hits MySQL limit of 64 keys/indexes per table.
-- Referential integrity is enforced in application (OurOrganizationsService).
ALTER TABLE users ADD COLUMN IF NOT EXISTS `ourOrganizationId` INT NULL;
