import { assertTopicSchemeChecks, compileTopicScheme, resolveTopicScheme, topicSchemeBaseline, topicSchemeTaxonomy, validateTopicScheme } from './topic-scheme';
import { buildAnalysisContext, buildAnalysisPrompt, buildOpenAiJsonSchema, buildZodAnalysisSchema } from './analysis-schema';

const taxonomy = [{ id: 'book', name: 'Booking', aliases: [] }, { id: 'results', name: 'Results', aliases: [] }, { id: 'other', name: 'Other', aliases: [] }];
const scheme = { version: 1 as const, fallbackTopicId: 'other', topics: taxonomy.map(t => ({ id: t.id, name: t.name,
    when: `${t.name} criteria`, exclude: `${t.name} exclusions`, examples: [`${t.name} example`] })) };
const evidence = (book: boolean, results: boolean) => ({ book: { matches: book, reason: 'Booking explanation' }, results: { matches: results, reason: 'Results explanation' } });

describe('structured topic scheme', () => {
    it.each([[true, true, 'book'], [false, true, 'results'], [true, false, 'book'], [false, false, 'other']])(
        'resolves eligibility %s/%s deterministically to %s', (book, results, expected) => {
            expect(resolveTopicScheme(scheme, evidence(book as boolean, results as boolean)).selectedTopicId).toBe(expected);
        });
    it('uses configured priority rather than taxonomy order or model order', () => {
        const reordered = { ...scheme, topics: [scheme.topics[1], scheme.topics[2], scheme.topics[0]] };
        expect(resolveTopicScheme(reordered, evidence(true, true)).selectedTopicId).toBe('results');
        expect(resolveTopicScheme(reordered, evidence(false, false)).selectedTopicId).toBe('other');
    });
    it('rejects missing, unknown, non-boolean evidence and model-supplied fallback decisions', () => {
        for (const bad of [{ book: evidence(true, false).book }, { ...evidence(false, false), other: { matches: true, reason: 'fallback' } },
            { ...evidence(true, false), book: { matches: 'true', reason: 'not boolean' } }]) {
            expect(() => resolveTopicScheme(scheme, bad)).toThrow();
        }
    });
    it('rejects duplicate identities, unknown fallback, empty criteria and incomplete taxonomy', () => {
        for (const bad of [{ ...scheme, fallbackTopicId: 'unknown' }, { ...scheme, topics: [scheme.topics[0], scheme.topics[0]] },
            { ...scheme, topics: scheme.topics.map(t => ({ ...t, when: '' })) }]) {
            expect(() => validateTopicScheme(bad, taxonomy)).toThrow();
        }
        expect(() => validateTopicScheme(scheme, taxonomy.slice(0, 2))).toThrow();
    });
    it('supports renamed/new draft topics while preserving opaque existing taxonomy attributes', () => {
        const changed = { ...scheme, topics: scheme.topics.map(t => ({ ...t, name: 'New ' + t.name })) };
        const result = topicSchemeTaxonomy(changed, taxonomy.map(t => ({ ...t, color: '#123456' })));
        expect(result[0]).toMatchObject({ id: 'book', name: 'New Booking', color: '#123456' });
        expect(validateTopicScheme(changed, taxonomy, false)).toEqual(changed);
    });
    it('binds checks to context, criteria identities and active revision, independently of object key order', () => {
        const project = { callTaxonomy: taxonomy, systemPrompt: 'context', topicSchemeState: { active: { revision: 'a' } } };
        expect(topicSchemeBaseline(project)).toBe(topicSchemeBaseline({ ...project, callTaxonomy: taxonomy.map(t => ({ aliases: [], name: t.name, id: t.id })) }));
        expect(topicSchemeBaseline(project)).not.toBe(topicSchemeBaseline({ ...project, systemPrompt: 'changed' }));
        expect(topicSchemeBaseline(project)).not.toBe(topicSchemeBaseline({ ...project, topicSchemeState: { active: { revision: 'b' } } }));
    });
    it('requires passed checks covering every theme, never permits a known wrong or incomplete run', () => {
        const draft: any = { scheme, checks: taxonomy.map(t => ({ expectedTopicId: t.id, selectedTopicId: t.id })), checkRun: { status: 'passed' } };
        expect(() => assertTopicSchemeChecks(draft)).not.toThrow();
        for (const invalid of [{ ...draft, checks: [] }, { ...draft, checkRun: { status: 'running' } },
            { ...draft, checkRun: { status: 'failed' } }, { ...draft, checks: [...draft.checks, { expectedTopicId: 'book', selectedTopicId: 'other' }] }]) {
            expect(() => assertTopicSchemeChecks(invalid)).toThrow();
        }
    });
    it('includes each criterion only in the managed block, skips legacy descriptions, and leaves legacy projects unchanged', () => {
        const project: any = { callTaxonomy: taxonomy.map(t => ({ ...t, description: 'LEGACY_DUPLICATED_RULE' })), singleTopic: true,
            topicSchemeState: { active: { scheme } } };
        const ctx = buildAnalysisContext(project);
        const prompt = buildAnalysisPrompt('Synthetic conversation', ctx);
        expect(prompt).toContain('topic_eligibility');
        expect(prompt).not.toContain('LEGACY_DUPLICATED_RULE');
        expect(prompt).not.toContain('"topic_tag_ids"');
        expect(compileTopicScheme(scheme, taxonomy)).toContain('exclusion wins');
        const json = buildOpenAiJsonSchema(ctx);
        expect(json.required).toContain('topic_eligibility');
        expect(json.properties).not.toHaveProperty('topic_tag_ids');
        const zod = buildZodAnalysisSchema(ctx);
        expect(zod.shape).toHaveProperty('topic_eligibility');
        const legacy = buildAnalysisContext({ ...project, topicSchemeState: null });
        expect(buildAnalysisPrompt('Synthetic', legacy)).toContain('LEGACY_DUPLICATED_RULE');
        expect(buildOpenAiJsonSchema(legacy).required).toContain('topic_tag_ids');
    });
});
