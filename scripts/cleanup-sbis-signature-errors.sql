-- Clear stale SBIS "missing signature" errors left after auto-send failures.
-- Invoice drafts were created successfully; only ВыполнитьДействие failed.
-- Safe to re-run.

-- Preview:
-- SELECT id, type, number, "sbisStatus", left("sbisLastError", 120) AS err
-- FROM organization_documents
-- WHERE "sbisLastError" ILIKE '%Не приложен файл подписи%'
--    OR "sbisLastError" ILIKE '%cannot sign ON_CHETOP%'
--    OR "sbisLastError" ILIKE '%SBIS_EDO_DEFERRED_SIGN%';

UPDATE organization_documents
SET
    "sbisLastError" = NULL,
    "sbisStatus" = CASE
        WHEN "sbisId" IS NOT NULL AND btrim("sbisId") <> '' THEN 'draft'
        ELSE "sbisStatus"
    END
WHERE "sbisLastError" ILIKE '%Не приложен файл подписи%'
   OR "sbisLastError" ILIKE '%cannot sign ON_CHETOP%'
   OR "sbisLastError" ILIKE '%SBIS_EDO_DEFERRED_SIGN%';
;