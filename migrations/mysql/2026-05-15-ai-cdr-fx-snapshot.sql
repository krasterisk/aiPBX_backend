-- Cached client-currency cost on CDR (mirrors billing FX snapshot at hangup)
-- Dialect: MySQL 8.0+

ALTER TABLE `aiCdr` ADD COLUMN IF NOT EXISTS `costCurrency` VARCHAR(8) NULL;
ALTER TABLE `aiCdr` ADD COLUMN IF NOT EXISTS `amountCurrency` DECIMAL(14, 4) NULL;

UPDATE `aiCdr` ac
SET
    ac.`amountCurrency` = (
        SELECT COALESCE(SUM(br.`amountCurrency`), 0)
        FROM `billingRecords` br
        WHERE br.`channelId` = ac.`channelId`
          AND br.`amountCurrency` IS NOT NULL
    ),
    ac.`costCurrency` = (
        SELECT br.`currency`
        FROM `billingRecords` br
        WHERE br.`channelId` = ac.`channelId`
          AND br.`amountCurrency` IS NOT NULL
        LIMIT 1
    )
WHERE ac.`amountCurrency` IS NULL
  AND EXISTS (
      SELECT 1 FROM `billingRecords` br
      WHERE br.`channelId` = ac.`channelId` AND br.`amountCurrency` IS NOT NULL
  );
