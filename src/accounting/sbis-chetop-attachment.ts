/**
 * SBIS API metadata for ON_CHETOP when embedded in СБИС.ЗаписатьДокумент (inline mode).
 * Do not pass on СБИС.ЗаписатьВложение — alfawebhook attaches only Файл; SBIS detects format from XML/name.
 * XML file uses ВерсФорм="5.01"; inline API uses Версия 1 / Подтип 1.01 / ПодВерсия 3.01.
 * @see https://sbis.ru/help/integration/api/all_methods/doc
 */
export const SBIS_CHETOP_ATTACHMENT_META = {
    Тип: 'ЭДОСч',
    /** API «Версия» (not XML ВерсФорм). */
    Версия: '1',
    Подтип: '1.01',
    ПодВерсия: '3.01',
    Название: 'Счет',
} as const;
