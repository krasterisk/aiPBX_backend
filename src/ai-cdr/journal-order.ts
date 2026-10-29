import { QUALITY_FORMULA_VERSION } from '../operator-analytics/quality/quality-score';
/** Static whitelist: ordering reads the published projection, never recalculates a score. */
export function journalOrderExpression(field: string, dialect: string, currentOnly = false): string | null {
    if (!['postgres', 'mysql'].includes(dialect)) return null;
    const col = (name: string) => (dialect === 'postgres' ? `"analytics"."${name}"` : `\`analytics\`.\`${name}\``);
    if (field === 'qualityScore') return currentOnly
        ? `CASE WHEN ${col('qualityVersion')}='${QUALITY_FORMULA_VERSION}' AND ${col('qualityStatus')}='scored' THEN ${col('qualityScore')} ELSE NULL END`
        : col('qualityScore');
    const metrics = `(replace(("analytics"."metrics")::text, E'\\\\u0000', '')::jsonb)`;
    if (field === 'scenarioSuccess')
        return dialect === 'postgres'
            ? `COALESCE(("analytics"."qualitySummary"::jsonb)->>'success', ${metrics}->'scenario_analysis'->>'success', ${metrics}->>'success')`
            : `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${col(
                  'qualitySummary'
              )}, '$.success')), JSON_UNQUOTE(JSON_EXTRACT(${col(
                  'metrics'
              )}, '$.scenario_analysis.success')), JSON_UNQUOTE(JSON_EXTRACT(${col('metrics')}, '$.success')))`;
    if (field === 'topic' && dialect === 'postgres')
        return `(SELECT string_agg(COALESCE(${metrics}->'_topics'->'tag_names'->>tag.value, tag.value), ' · ' ORDER BY tag.value)
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(${metrics}->'_topics'->'tags')='array' THEN ${metrics}->'_topics'->'tags' ELSE '[]'::jsonb END) AS tag(value))`;
    return null;
}
