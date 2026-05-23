/** Fallback nomenclature (typos per product brief); override via SBIS_AIPBX_SUBJECT_DEFAULT or organization.subject */
export const HARDCODED_SUBJECT_FALLBACK =
    '«Пополнение баланса блачного сервиа обработки голосовых вызовов с использованием технологий искусственного интеллекта (AI PBX)»';

/** Fixed line item for monthly closing UPD (USN, status 2). Override via SBIS_CLOSING_UPD_SUBJECT. */
export const CLOSING_UPD_SUBJECT_DEFAULT =
    'Услуги предоставления доступа к облачному сервису обработки голосовых вызовов (распознавание речи, речевая аналитика, генерация AI-ответов) с использованием технологий искусственного интеллекта (AIPBX.RU)';

export const DOCUMENT_SERIES_DEFAULT = 'AI';

export const DOC_TYPE_INVOICE = 'INV';
export const DOC_TYPE_ADVANCE_SF = 'ASF';
export const DOC_TYPE_ACT = 'ACT';
export const DOC_TYPE_SF = 'SF';
export const DOC_TYPE_UPD = 'UPD';

/** Until SBIS returns Номер after ЗаписатьДокумент. */
export const UPD_NUMBER_PENDING = 'б/н';

export function resolveClosingUpdSubject(): string {
    const fromEnv = (process.env.SBIS_CLOSING_UPD_SUBJECT || '').trim();
    return fromEnv || CLOSING_UPD_SUBJECT_DEFAULT;
}

function formatPeriodRu(periodFrom: string, periodTo: string): string {
    const fmt = (iso: string) => {
        const p = iso.trim().split('-');
        if (p.length === 3 && p[0].length === 4) {
            return `${p[2]}.${p[1]}.${p[0]}`;
        }
        return iso;
    };
    return `${fmt(periodFrom)} — ${fmt(periodTo)}`;
}

/** SBIS document Примечание: personal account + billing period. */
export function buildClosingDocumentNote(
    personalAccountNumber: string | null | undefined,
    periodFrom: string,
    periodTo: string,
): string {
    const pa = (personalAccountNumber || '').trim();
    const period = formatPeriodRu(periodFrom, periodTo);
    const parts: string[] = [];
    if (pa) {
        parts.push(`Лицевой счёт ${pa}.`);
    }
    parts.push(`Период оказания услуг: ${period}.`);
    parts.push('НДС не облагается (УСН, п. 2 ст. 346.11 НК РФ).');
    return parts.join(' ');
}
