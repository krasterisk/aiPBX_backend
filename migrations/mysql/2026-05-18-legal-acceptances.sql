-- Лог фиксации согласия пользователей с правовыми документами (оферта, политика ПДн).

CREATE TABLE IF NOT EXISTS `legal_acceptances` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(64) NOT NULL,
    `documentKind` VARCHAR(32) NOT NULL,
    `documentVersion` VARCHAR(32) NOT NULL,
    `contentHash` VARCHAR(128) NOT NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `source` VARCHAR(32) NOT NULL DEFAULT 'login',
    `acceptedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `legal_acceptances_uniq_user_doc_version`
        (`userId`, `documentKind`, `documentVersion`),
    KEY `legal_acceptances_user_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
