-- Balance threshold alerts (tenant-scoped, multiple rules per owner)
-- Dialect: MySQL 8.0+ (column names match Sequelize camelCase)

CREATE TABLE IF NOT EXISTS `balance_threshold_alerts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ownerUserId` INT NOT NULL,
    `limitAmount` DOUBLE NOT NULL,
    `emails` JSON NOT NULL,
    `notifyUserIds` JSON NOT NULL,
    `sendInvoice` TINYINT(1) NOT NULL DEFAULT 0,
    `organizationId` INT NULL,
    `invoiceAmountMode` VARCHAR(32) NOT NULL DEFAULT 'fixed',
    `invoiceAmountRub` DOUBLE NULL,
    `sendViaEdo` TINYINT(1) NOT NULL DEFAULT 0,
    `lastTriggeredAt` DATETIME NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_balance_threshold_alerts_owner` (`ownerUserId`),
    CONSTRAINT `fk_balance_threshold_alerts_owner`
        FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

INSERT INTO `balance_threshold_alerts` (
    `ownerUserId`,
    `limitAmount`,
    `emails`,
    `notifyUserIds`
)
SELECT
    ul.`userId`,
    ul.`limitAmount`,
    ul.`emails`,
    JSON_ARRAY()
FROM `user_limits` ul
WHERE NOT EXISTS (
    SELECT 1 FROM `balance_threshold_alerts` b WHERE b.`ownerUserId` = ul.`userId`
);
