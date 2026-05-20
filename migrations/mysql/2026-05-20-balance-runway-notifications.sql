CREATE TABLE IF NOT EXISTS `balance_runway_notifications` (
    `ownerUserId` INT NOT NULL PRIMARY KEY,
    `lastNotifiedAt` DATETIME NOT NULL,
    `lastForecastDays` DOUBLE NOT NULL,
    `lastDailyBurnUsd` DOUBLE NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_balance_runway_notifications_owner`
        FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
