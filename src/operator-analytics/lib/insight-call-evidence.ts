import { QueryTypes, type Sequelize } from 'sequelize';
import { qualityReadScope } from '../quality/quality-dashboard';
import { loadQualityReadProjections, qualityReadRelation } from '../quality/quality-read-projection';
import type { DashboardCdrFilters } from './dashboard-aggregation';
import { decryptTranscript } from './transcript-crypto';
import { digest, type VerifiedInsight } from './verified-insights';

export interface InsightCallEvidence {
    id: string; factId: string; channelId: string; period: 'current' | 'previous';
    runId: string; operator: string; topics: string[]; transcript: string; complete: boolean;
    instruction: string; assessment: { status: string; rationale: string; quote: string; value?: string | number | boolean | null; normalized?: number | null };
    businessContext?: string;
}
interface EvidenceRow {
    channelId: string; userId: string; operatorId?: string; runId: string; frozen?: string; stored?: string;
    metrics?: { _topics?: { tags?: string[] } };
    result?: { status?: string; criteria?: Array<{ id: string; origin: string; status: string; rationale?: string; quote?: string; value?: unknown; normalized?: number }> };
    context?: { systemPrompt?: string; customMetricsSchema?: Array<{ id: string; description?: string }>;
        customMeta?: Record<string, { description?: string }>; callTaxonomy?: Array<{ id: string; name?: string }> };
}

/** No contact details are needed to diagnose operator behaviour. Apply before hashing or prompting. */
export function insightText(value: unknown, max = 6000): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[почта]')
        .replace(/\+?\d[\d ()-]{8,}\d/g, '[телефон]').split(String.fromCharCode(0)).join('').trim().slice(0, max);
}
function transcriptText(raw: unknown): string {
    if (typeof raw !== 'string' || raw.startsWith('enc:')) return '';
    try {
        const turns = JSON.parse(raw);
        if (Array.isArray(turns)) return turns.map(t => typeof t === 'string' ? t : `${t.speaker || t.role || ''}: ${t.text || t.content || ''}`).join('\n');
    } catch { /* Plain transcripts are supported. */ }
    return raw;
}

/** Bounded exemplars, selected by code. Same tenant/period/filter CTE and CURRENT immutable run as aggregates. */
export async function insightCallEvidence(db: Sequelize, filters: DashboardCdrFilters, admin: boolean, owner: string,
    candidates: VerifiedInsight[], period: InsightCallEvidence['period']): Promise<InsightCallEvidence[]> {
    const requests = candidates.flatMap(f => (period === 'current' ? f.evidence.channelIds.slice(0, 3) : f.evidence.previousChannelIds.slice(0, 2))
        .map(channelId => ({ fact: f, channelId })));
    const ids = [...new Set(requests.map(r => r.channelId))];
    if (!ids.length) return [];
    const resolved = await loadQualityReadProjections(db, { ...filters, userId: admin ? filters.userId : owner });
    const { cte, replacements } = qualityReadScope(filters, admin, owner, true, qualityReadRelation(db, resolved));
    const rows = await db.query<EvidenceRow>(`${cte} SELECT b."channelId",b."userId",b."operatorId",b.metrics,
        r.id AS "runId",r.result,r."rawSnapshot"::jsonb->'input'->>'transcription' AS frozen,
        s.snapshot::jsonb->'context' AS context,oa.transcription AS stored
      FROM base b JOIN quality_preview_runs r ON r.id=b."qualityRunId" AND r."userId"=b."userId" AND r."channelId"=b."channelId"
      JOIN quality_preview_scorecards s ON s.id=b."qualityScorecardId" AND s.id=r."scorecardRevisionId" AND s."userId"=b."userId"
      LEFT JOIN operator_analytics oa ON oa.id=CASE WHEN b."channelId" ~ '^[0-9]{1,18}$' THEN b."channelId"::bigint END AND oa."userId"=b."userId"
      WHERE b.usable AND b."channelId" IN (:insightEvidenceIds) ORDER BY b."channelId" LIMIT 24`, {
        replacements: { ...replacements, insightEvidenceIds: ids }, type: QueryTypes.SELECT,
    });
    const examples: InsightCallEvidence[] = requests.flatMap(({ fact, channelId }) => {
        const row = rows.find(r => r.channelId === channelId);
        if (!row) return [];
        const criterion = Array.isArray(row.result?.criteria) ? row.result.criteria.find(c => c.id === fact.evidence.metricId && c.origin === fact.evidence.origin) : null;
        if (fact.evidence.origin !== 'summary' && criterion?.status !== 'assessed') return [];
        const plain = transcriptText(decryptTranscript(row.frozen || row.stored));
        const transcript = insightText(plain);
        if (transcript.length < 40) return [];
        const context = row.context ?? {};
        const definition = fact.evidence.origin === 'custom' && Array.isArray(context.customMetricsSchema) ? context.customMetricsSchema.find(m => m.id === fact.evidence.metricId) : null;
        const instruction = insightText(definition?.description || context.customMeta?.[fact.evidence.metricId]?.description || '', 1200);
        const tags = Array.isArray(row.metrics?._topics?.tags) ? row.metrics._topics.tags : [];
        const topics = tags.map(id => insightText((Array.isArray(context.callTaxonomy) ? context.callTaxonomy.find(t => t.id === id)?.name : null) || id, 100));
        return [{ id: digest([fact.evidence.factId, period, row.runId]).slice(0, 24), factId: fact.evidence.factId, channelId, period,
            runId: row.runId, operator: 'operator-' + digest([row.userId, row.operatorId || row.channelId]).slice(0, 8), topics,
            transcript, complete: insightText(plain, Number.MAX_SAFE_INTEGER).length <= 6000, instruction, businessContext: insightText(context.systemPrompt, 1500),
            assessment: { status: criterion?.status || row.result?.status || '', rationale: insightText(criterion?.rationale, 800), quote: insightText(criterion?.quote, 500),
                value: typeof criterion?.value === 'string' ? insightText(criterion.value, 250) : typeof criterion?.value === 'boolean' || (typeof criterion?.value === 'number' && Number.isFinite(criterion.value)) ? criterion.value : null,
                normalized: Number.isFinite(criterion?.normalized) ? criterion.normalized : null } }];
    });
    return candidates.flatMap(f => examples.filter(e => e.factId === f.evidence.factId && e.complete).slice(0, period === 'current' ? 2 : 1));
}
