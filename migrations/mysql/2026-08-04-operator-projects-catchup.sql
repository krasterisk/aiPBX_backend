    -- Catch-up for operator_projects (no information_schema / no procedures).
    -- Run against the app DB (DB_NAME from .env).
    -- If a column already exists you get #1060 — skip that statement and continue.

    -- 2026-02-26-add-webhook-headers.sql
    ALTER TABLE operator_projects
        ADD COLUMN `webhookHeaders` JSON NOT NULL DEFAULT (CAST('{}' AS JSON));

    -- 2026-07-30-operator-call-taxonomy.sql
    ALTER TABLE operator_projects
        ADD COLUMN `callTaxonomy` JSON NOT NULL DEFAULT (CAST('[]' AS JSON));

    -- 2026-06-18-operator-project-budget.sql
    ALTER TABLE operator_projects ADD COLUMN `monthlyBudgetUsd` FLOAT NULL;
    ALTER TABLE operator_projects ADD COLUMN `budgetAlertEmails` JSON NULL;
    ALTER TABLE operator_projects ADD COLUMN `budgetLastAlertAt` DATETIME NULL;

    -- 2026-06-18-operator-anomaly-alert.sql
    ALTER TABLE operator_projects ADD COLUMN `anomalyLastAlertAt` DATETIME NULL;

    -- 2026-08-04-operator-project-digest.sql
    ALTER TABLE operator_projects ADD COLUMN `digestConfig` JSON NULL;

    -- 2026-08-04-operator-project-alert.sql
    ALTER TABLE operator_projects ADD COLUMN `alertConfig` JSON NULL;

    -- Tag table (idempotent)
    CREATE TABLE IF NOT EXISTS operator_call_tags (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `channelId` VARCHAR(255) NOT NULL,
        `userId` VARCHAR(255) NULL,
        `projectId` INT NULL,
        `tagId` VARCHAR(100) NOT NULL,
        source VARCHAR(16) NOT NULL DEFAULT 'auto',
        `actorUserId` VARCHAR(255) NULL,
        `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX uq_call_tags_channel_tag (`channelId`, `tagId`),
        INDEX idx_call_tags_tag_project (`tagId`, `projectId`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
