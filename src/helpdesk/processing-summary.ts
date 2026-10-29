import { BadRequestException } from '@nestjs/common';
import { QueryTypes, Sequelize } from 'sequelize';

export function processingPeriod(period: string | undefined, timeZone: string, now = new Date()) {
    if (typeof timeZone !== 'string' || timeZone.length > 64) throw new BadRequestException('Invalid timezone');
    let today: string;
    try {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
        const get = (key: string) => parts.find(p => p.type === key)!.value;
        today = `${get('year')}-${get('month')}-${get('day')}`;
    } catch { throw new BadRequestException('Invalid timezone'); }
    const shift = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    const value = period || `${shift(today, -1)}/${today}`;
    if (!/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Use YYYY-MM-DD/YYYY-MM-DD');
    const [start, end] = value.split('/');
    for (const day of [start, end]) {
        const stamp = Date.parse(day + 'T00:00:00Z');
        if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== day) throw new BadRequestException('Invalid calendar date');
    }
    const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
    if (days < 1 || days > 31 || end > today) throw new BadRequestException('Select 1–31 days through today');
    return { start, end, endExclusive: shift(end, 1), timeZone, days, partialLastDay: end === today };
}

const FILTER = `"userId"=:owner AND "projectId"=:project AND "createdAt">=(CAST(:start AS date)::timestamp AT TIME ZONE :tz) AND "createdAt"<(CAST(:until AS date)::timestamp AT TIME ZONE :tz)`;

/** Aggregate metadata only. No transcript getter, network request, provider or mutation. */
export async function readProcessingSummary(db: Sequelize, cabinetId: number, projectId: number, period: ReturnType<typeof processingPeriod>, currency: 'USD' | 'RUB') {
    const replacements = { owner: String(cabinetId), project: projectId, start: period.start, until: period.endExclusive, tz: period.timeZone };
    const q = <T extends object>(sql: string) => db.query<T>(sql, { type: QueryTypes.SELECT, replacements });
    const daily = await q<any>(`SELECT to_char("createdAt" AT TIME ZONE :tz,'YYYY-MM-DD') AS "day", count(*)::int AS "submittedRecords",
        count(*) FILTER (WHERE status='completed')::int AS completed,
        count(*) FILTER (WHERE status='processing')::int AS processing,
        count(*) FILTER (WHERE status='error' AND "errorMessage"='Insufficient balance')::int AS "balanceErrors",
        count(*) FILTER (WHERE status='error' AND "errorMessage" IS DISTINCT FROM 'Insufficient balance')::int AS "otherErrors"
        FROM operator_analytics WHERE ${FILTER} GROUP BY 1 ORDER BY 1`);
    const [failed] = await q<any>(`SELECT count(*)::int AS records, count(DISTINCT NULLIF("recordUrl",''))::int AS "distinctRecordings",
        count(*) FILTER (WHERE NULLIF("recordUrl",'') IS NOT NULL)::int AS "recordingLinks",
        count(*) FILTER (WHERE duration>0)::int AS "knownDurations", sum(duration) AS "knownSeconds",
        min("createdAt") AS first, max("createdAt") AS last,
        count(*) FILTER (WHERE NULLIF(transcription,'') IS NOT NULL)::int AS "withTranscript"
        FROM operator_analytics WHERE ${FILTER} AND status='error' AND "errorMessage"='Insufficient balance'`);
    const [owner] = await q<any>('SELECT balance FROM users WHERE id=CAST(:owner AS integer)');
    const [tariff] = await q<any>('SELECT analytic,stt FROM prices WHERE "userId"=CAST(:owner AS integer)');
    const rates = await q<any>(`SELECT currency,rate FROM rates WHERE currency IN ('USD','RUB')`);
    // One CDR per successful analysis. Do not multiply a call by its billing rows.
    const [sample] = await q<any>(`SELECT count(*)::int AS calls, avg(c.tokens) AS "averageTokens", avg(o.duration) AS "averageSeconds",
        sum(c.tokens) / NULLIF(sum(o.duration),0) AS "tokensPerSecond",
        count(*) FILTER (WHERE o."sttProvider"='whisper')::int AS "localWhisperCalls"
        FROM operator_analytics o JOIN "aiCdr" c ON c."channelId"=CAST(o.id AS text) AND c."userId"=o."userId" AND c."projectId"=o."projectId"
        WHERE o."userId"=:owner AND o."projectId"=:project AND o.status='completed' AND c.tokens>0 AND o.duration>0
        AND o."createdAt">=now()-interval '7 days' AND o."schemaVersion"=(SELECT "currentSchemaVersion" FROM operator_projects WHERE id=:project AND "userId"=:owner)`);
    const rate = currency === 'USD' ? 1 : Number(rates.find(r => r.currency === 'RUB')?.rate) / Number(rates.find(r => r.currency === 'USD')?.rate);
    const estimateAvailable = Boolean(tariff && Number(sample?.calls) >= 10 && Number.isFinite(rate) && rate > 0 && Number.isFinite(Number(tariff.analytic)) && Number(tariff.analytic)>=0);
    const allLocal = Number(sample?.calls) > 0 && Number(sample.localWhisperCalls) === Number(sample.calls);
    const estimateUsd = estimateAvailable && allLocal ? Number(failed.records) * Number(sample.averageTokens) * Number(tariff.analytic) / 1e6 : null;
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
        found: true, product: 'aipbx', clientId: String(cabinetId), projectId, aggregatesOnly: true,
        asOf: new Date().toISOString(), period, daily,
        missedForBalance: failed,
        coverage: 'Registered processing requests, not all PBX calls. Counts are request records; distinctRecordings counts exact nonempty recording links. A recording link does not verify file availability. Other failures and processing are separate.',
        balance: { amount: Number.isFinite(rate) && rate>0 ? round(Number(owner?.balance)*rate) : null, currency, processingAllowed: owner != null && Number(owner.balance)>0 },
        tariff: tariff ? { currency:'USD', analysisPerMillionTokens:Number(tariff.analytic), externalSttPerMinute:Number(tariff.stt), localWhisperSttPerMinute:0 } : null,
        estimate: { available:estimateUsd!==null, amount:estimateUsd===null?null:round(estimateUsd*rate), currency,
            amountUsd:estimateUsd===null?null:round(estimateUsd), sampleCalls:Number(sample?.calls||0), averageTokens:Number(sample?.averageTokens)||null,
            tokensPerSecond:Number(sample?.tokensPerSecond)||null, averageSeconds:Number(sample?.averageSeconds)||null,
            assumedSttProvider:allLocal?'whisper':null, method:'Missed request count × mean tokens of completed calls with current schema in last 7 days × current tariff. Estimate only; actual tokens and provider determine charge. No processing initiated.',
            requiresCustomerConsent:true },
        policy: { balanceGuard:'Processing is rejected at balance <= 0 before audio download/STT. The in-process check permits already-started calls to finish.',
            failedRequests:'A failed request is not a queued retry. Top-up alone does not re-run stored errors; verify actual integration retry behavior separately.',
            historicalProcessing:'Only after customer confirms period, count and estimated cost; customer reply and operational approval are separate from approval to send this estimate.' },
    };
}
