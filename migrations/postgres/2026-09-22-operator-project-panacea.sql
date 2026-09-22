-- Project «Панацея»: clinic call checklist.
-- Dialect: PostgreSQL
--
-- Checklist items with a full rubric are custom boolean metrics (true = зачет).
-- «Была вежлива и доброжелательна» and «не делала длинных пауз» are short and
-- match the built-in politeness_empathy / speech_clarity_pace prompts, so those
-- default metrics stay visible and are not duplicated as custom metrics.
--
-- Owner resolution:
--   1. owner_override below, if set (users.id)
--   2. organization whose name contains «Панацея» / panacea
--   3. the only tenant owner (vpbx_user_id IS NULL)
-- Otherwise the script raises and does not insert.

DO $mig$
DECLARE
    -- Set to users.id (as text) to pin the tenant. Leave NULL to resolve automatically.
    owner_override text := NULL;
    owner_id text;
    root_count int;
    metrics jsonb := $json$[
        {
            "id": "greeting",
            "name": "Приветствие",
            "type": "boolean",
            "polarity": "positive",
            "description": "Зачет true только если всё верно: сотрудник начал диалог первым; до вопроса пациента прозвучало «Здравствуйте», «Добрый день», «Доброе утро» или «Добрый вечер»; форма уважительная (не «Привет», «Ага», «Слушаю»); формулировка приветливая, не сухая. false, если без приветствия сразу «Чем помочь?» или «Говорите», либо пациент заговорил первым. Интонацию по аудио не выдумывай: холодность оценивай по словам транскрипта."
        },
        {
            "id": "introduction",
            "name": "Представление",
            "type": "boolean",
            "polarity": "positive",
            "description": "Зачет true только если названо личное имя сотрудника, четко и разборчиво: «Меня зовут [Имя]», «[Имя], администратор» или «Вас консультирует [Имя]». Не зачитывать «оператор», «администратор» или «девушка» без имени. Уменьшительные («Леночка» вместо «Елена») не зачитывать. false, если имя не прозвучало."
        },
        {
            "id": "clinic_name",
            "name": "Название клиники",
            "type": "boolean",
            "polarity": "positive",
            "description": "Зачет true, если сотрудник назвал место так, что пациент понимает, куда попал: «Клиника Панацея» или «Медицинский центр Панацея» (допустимы близкие формулировки, где явно есть «Панацея»). false, если название «Панацея» не прозвучало."
        },
        {
            "id": "patient_address_form",
            "name": "Обращение к пациенту",
            "type": "boolean",
            "polarity": "positive",
            "description": "Зачет true, если администратор спросила, как обращаться: «как могу к вам обращаться» или «как вас зовут» (тот же смысл своими словами). false, если вопрос не задан."
        },
        {
            "id": "branch",
            "name": "Филиал",
            "type": "boolean",
            "polarity": "positive",
            "description": "Зачет true, если выяснен нужный филиал: на Урванцева или на Карамзина. Администратор должна спросить, если пациент сам не назвал филиал. Если пациент назвал филиал и администратор это подтвердила — тоже true. false, если филиал так и не определен."
        },
        {
            "id": "visit_briefing",
            "name": "Информирование о приеме",
            "type": "boolean",
            "polarity": "positive",
            "description": "Если пациент не просил запись к врачу или на услугу — true (пункт не применим). Иначе true только когда администратор ответила на запрос записи и назвала всё применимое: фамилию врача, который выполнит прием или услугу; стоимость; подходящий филиал и подходящего врача или услугу; подготовку и письменное направление — только если они нужны для этой услуги (если не нужны, отсутствие упоминания не штраф). false, если любое применимое сведение пропущено."
        },
        {
            "id": "extra_offer",
            "name": "Дополнительная услуга или акция",
            "type": "boolean",
            "polarity": "positive",
            "description": "Зачет true, если администратор ненавязчиво предложила дополнительную услугу или манипуляцию либо озвучила одну акцию. false, если не было ни доп. предложения, ни акции."
        },
        {
            "id": "lead_source",
            "name": "Источник обращения",
            "type": "boolean",
            "polarity": "positive",
            "description": "Если из диалога видно, что пациент записывается впервые, true только когда администратор спросила, откуда он узнал о клинике или медцентре. Если это не первая запись или первичность не ясна — true (вопрос не обязателен). false только когда визит явно первый и вопрос не задан."
        }
    ]$json$::jsonb;
    prompt text := $prompt$Медицинский центр «Панацея», филиалы на Урванцева и на Карамзина. Администратор принимает звонки пациентов и записывает на прием к врачу или на услугу. Подготовка к процедуре и письменное направление нужны не всегда. Дополнительную услугу или акцию предлагают ненавязчиво.$prompt$;
    defaults jsonb := '["politeness_empathy","speech_clarity_pace"]'::jsonb;
BEGIN
    IF owner_override IS NOT NULL AND btrim(owner_override) <> '' THEN
        owner_id := btrim(owner_override);
    ELSE
        IF to_regclass('public.organizations') IS NOT NULL THEN
            SELECT u.id::text INTO owner_id
            FROM users u
            JOIN organizations o ON o."userId" = u.id
            WHERE o.name ILIKE '%панацея%' OR o.name ILIKE '%panacea%'
            ORDER BY u.id
            LIMIT 1;
        END IF;

        IF owner_id IS NULL THEN
            SELECT COUNT(*) INTO root_count
            FROM users
            WHERE "vpbx_user_id" IS NULL OR "vpbx_user_id" = id;

            IF root_count = 1 THEN
                SELECT id::text INTO owner_id
                FROM users
                WHERE "vpbx_user_id" IS NULL OR "vpbx_user_id" = id
                ORDER BY id
                LIMIT 1;
            ELSE
                RAISE EXCEPTION
                    'Cannot resolve tenant for project Панацея (% root users, no organization named Панацея). Set owner_override at the top of this migration to users.id.',
                    root_count;
            END IF;
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM users WHERE id::text = owner_id) THEN
        RAISE EXCEPTION 'User % for project Панацея does not exist', owner_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM operator_projects
        WHERE name = 'Панацея' AND "userId" = owner_id
    ) THEN
        RAISE NOTICE 'Project Панацея already exists for user %, skip', owner_id;
    ELSE
        INSERT INTO operator_projects (
            name,
            description,
            "userId",
            "isDefault",
            "systemPrompt",
            "customMetricsSchema",
            "visibleDefaultMetrics",
            "currentSchemaVersion",
            "createdAt",
            "updatedAt"
        ) VALUES (
            'Панацея',
            'Чек-лист качества звонков администраторов медицинского центра «Панацея».',
            owner_id,
            FALSE,
            prompt,
            metrics,
            defaults,
            1,
            NOW(),
            NOW()
        );
    END IF;
END
$mig$;
