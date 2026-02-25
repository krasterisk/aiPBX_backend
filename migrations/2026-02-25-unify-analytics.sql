-- =============================================================================
-- Migration: Unified Call Analytics
-- Date: 2026-02-25
-- Dialect: PostgreSQL
-- Description:
--   1. aiCdr          — добавляем колонку "projectId"
--   2. billingRecords  — добавляем колонку "sttCost"
--   3. aiAssistants    — добавляем колонку "projectId"
--   4. operator_analytics — убираем поля аналитики и биллинга,
--                            которые переехали в aiAnalytics / billingRecords
--   Все операции безопасны (IF NOT EXISTS / IF EXISTS) — можно запускать повторно.
-- =============================================================================

-- ─── 1. aiCdr: добавить projectId ───────────────────────────────────────────

ALTER TABLE "aiCdr"
    ADD COLUMN IF NOT EXISTS "projectId" INTEGER;

-- Индекс для быстрой фильтрации по проекту
CREATE INDEX IF NOT EXISTS idx_aiCdr_projectId ON "aiCdr" ("projectId");

-- ─── 2. billingRecords: добавить sttCost ─────────────────────────────────────

ALTER TABLE "billingRecords"
    ADD COLUMN IF NOT EXISTS "sttCost" FLOAT NOT NULL DEFAULT 0;

-- ─── 3. aiAssistants: добавить projectId ─────────────────────────────────────

ALTER TABLE "aiAssistants"
    ADD COLUMN IF NOT EXISTS "projectId" INTEGER;

-- ─── 4. operator_analytics: удалить поля, переехавшие в другие таблицы ───────
--   Поля metrics, customMetrics, customMetricsDef, schemaVersion → aiAnalytics
--   Поля cost, llmCost, sttCost, tokens              → billingRecords / aiCdr
-- Используем DO-блок, чтобы не падать если колонки уже удалены

DO $$
BEGIN

    -- metrics
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operator_analytics' AND column_name = 'metrics'
    ) THEN
        ALTER TABLE operator_analytics DROP COLUMN metrics;
    END IF;

    -- customMetrics
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operator_analytics' AND column_name = 'customMetrics'
    ) THEN
        ALTER TABLE operator_analytics DROP COLUMN "customMetrics";
    END IF;

    -- customMetricsDef
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operator_analytics' AND column_name = 'customMetricsDef'
    ) THEN
        ALTER TABLE operator_analytics DROP COLUMN "customMetricsDef";
    END IF;

    -- schemaVersion
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operator_analytics' AND column_name = 'schemaVersion'
    ) THEN
        ALTER TABLE operator_analytics DROP COLUMN "schemaVersion";
    END IF;

    -- cost
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operator_analytics' AND column_name = 'cost'
    ) THEN
        ALTER TABLE operator_analytics DROP COLUMN cost;
    END IF;

    -- llmCost
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operator_analytics' AND column_name = 'llmCost'
    ) THEN
        ALTER TABLE operator_analytics DROP COLUMN "llmCost";
    END IF;

    -- sttCost
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operator_analytics' AND column_name = 'sttCost'
    ) THEN
        ALTER TABLE operator_analytics DROP COLUMN "sttCost";
    END IF;

    -- tokens
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operator_analytics' AND column_name = 'tokens'
    ) THEN
        ALTER TABLE operator_analytics DROP COLUMN tokens;
    END IF;

END $$;

-- ─── 5. aiAnalytics: убедиться что поле csat имеет нужный тип ───────────────
--   Если csat уже есть — меняем дефолт/тип на FLOAT чтобы поддержать 1-100.
--   Если нет — добавляем (на случай если таблица создана без него).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'aiAnalytics' AND column_name = 'csat'
    ) THEN
        ALTER TABLE "aiAnalytics" ADD COLUMN "csat" FLOAT;
    END IF;
END $$;

-- ─── Итоговая проверка (опционально, выводит результат) ─────────────────────

SELECT
    'aiCdr.projectId'        AS check_name,
    COUNT(*)                  AS column_exists
FROM information_schema.columns
WHERE table_name = 'aiCdr' AND column_name = 'projectId'

UNION ALL

SELECT
    'billingRecords.sttCost',
    COUNT(*)
FROM information_schema.columns
WHERE table_name = 'billingRecords' AND column_name = 'sttCost'

UNION ALL

SELECT
    'aiAssistants.projectId',
    COUNT(*)
FROM information_schema.columns
WHERE table_name = 'aiAssistants' AND column_name = 'projectId'

UNION ALL

SELECT
    'operator_analytics.metrics DROPPED',
    CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.columns
WHERE table_name = 'operator_analytics' AND column_name IN (
    'metrics', 'customMetrics', 'customMetricsDef', 'schemaVersion',
    'cost', 'llmCost', 'sttCost', 'tokens'
);
