-- «Панацея», метрика «Источник обращения» (lead_source).
-- Уже сохранённые false и 0 занижают долю «да». Для этой метрики они
-- означают «не оценивалось»: заменить на null. true не трогаем.
-- null не пишется в operator_metric_values, поэтому строки с 0 удаляются.
-- Dialect: PostgreSQL

DO $mig$
DECLARE
    rec record;
    cleaned jsonb;
    updated_analytics int := 0;
    deleted_values int := 0;
BEGIN
    FOR rec IN
        SELECT a."channelId", a.metrics::text AS metrics_text
        FROM "aiAnalytics" a
        INNER JOIN "aiCdr" c ON c."channelId" = a."channelId"
        INNER JOIN operator_projects p ON p.id = c."projectId"
        WHERE p.name = 'Панацея'
          AND a.metrics::text LIKE '%lead_source%'
    LOOP
        BEGIN
            cleaned := replace(rec.metrics_text, E'\\u0000', '')::jsonb;
            IF cleaned #>> '{custom_metrics,lead_source}' IN ('false', '0') THEN
                UPDATE "aiAnalytics"
                SET metrics = jsonb_set(
                    cleaned,
                    '{custom_metrics,lead_source}',
                    'null'::jsonb
                )::json
                WHERE "channelId" = rec."channelId";
                updated_analytics := updated_analytics + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Panacea lead_source: skip channel %: %', rec."channelId", SQLERRM;
        END;
    END LOOP;

    DELETE FROM operator_metric_values mv
    USING "aiCdr" c, operator_projects p
    WHERE mv."channelId" = c."channelId"
      AND p.id = c."projectId"
      AND p.name = 'Панацея'
      AND mv."metricId" = 'lead_source'
      AND (mv."boolValue" IS FALSE OR mv."numValue" = 0);

    GET DIAGNOSTICS deleted_values = ROW_COUNT;

    RAISE NOTICE 'Panacea lead_source: analytics set to null: %, metric rows removed: %',
        updated_analytics, deleted_values;
END
$mig$;
