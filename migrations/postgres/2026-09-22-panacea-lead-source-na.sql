-- «Источник обращения» для проекта «Панацея»: null, если пациент звонит не впервые.
-- null не считается провалом и не входит в долю «да».
-- Dialect: PostgreSQL

UPDATE operator_projects
SET "customMetricsSchema" = (
    SELECT jsonb_agg(
        CASE
            WHEN elem->>'id' = 'lead_source' THEN jsonb_set(
                elem,
                '{description}',
                to_jsonb('Только если пациент явно звонит впервые: true — спросила, откуда узнали о клинике или медцентре; false — визит первый, вопрос не задан. Если это не первая запись или из диалога не ясно, что визит первый — верни null. null значит метрика не применяется и не является ошибкой.'::text)
            )
            ELSE elem
        END
        ORDER BY ord
    )
    FROM jsonb_array_elements("customMetricsSchema") WITH ORDINALITY AS t(elem, ord)
),
"updatedAt" = NOW()
WHERE name = 'Панацея'
  AND "customMetricsSchema" @> '[{"id":"lead_source"}]'::jsonb;
