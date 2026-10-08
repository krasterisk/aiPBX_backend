import type { OperatorProject } from '../operator-project.model';
import { AnalysisSchemaValidationError, buildAnalysisContext, buildAnalysisPrompt, buildOpenAiJsonSchema, parseAndValidateAnalysisResponse } from './analysis-schema';

const project = {
    singleTopic: true, visibleDefaultMetrics: ['greeting_quality'],
    callTaxonomy: [{ id: 'booking', name: 'Запрос на запись', aliases: [] }, { id: 'other', name: 'Другое', aliases: [] }],
} as unknown as OperatorProject;
const payload = (tags: string[]) => JSON.stringify({
    assessments: {}, greeting_quality: 100, customer_sentiment: 'Positive', csat: 5,
    summary: 'Пациент записан на УЗИ', success: true, analysis_confidence: 0.9,
    insufficient_content: false, topic_tag_ids: tags,
});
const parse = (tags: string[], p: Pick<OperatorProject, 'singleTopic' | 'visibleDefaultMetrics' | 'callTaxonomy'> = project) => parseAndValidateAnalysisResponse(payload(tags), buildAnalysisContext(p as OperatorProject), raw => raw, { llmDiarize: false });

describe('single topic classification', () => {
    it('constrains the model schema and prompt to one topic', () => {
        const ctx = buildAnalysisContext(project);
        expect(buildOpenAiJsonSchema(ctx).properties.topic_tag_ids).toMatchObject({ minItems: 1, maxItems: 1 });
        expect(buildAnalysisPrompt('Запишите на УЗИ', ctx)).toContain('EXACTLY ONE');
    });
    it('accepts one known topic', () => { expect(parse(['booking']).topicTagIds).toEqual(['booking']); });
    it.each([{ tags: [] }, { tags: ['booking', 'other'] }, { tags: ['booking', 'booking'] }, { tags: ['unknown'] }, { tags: ['booking', 'unknown'] }])('rejects invalid topic result $tags', ({ tags }) => {
        expect(() => parse(tags)).toThrow(AnalysisSchemaValidationError);
    });
    it('keeps multi-topic mode backward compatible', () => {
        expect(parse(['booking', 'other', 'unknown'], { ...project, singleTopic: false }).topicTagIds).toEqual(['booking', 'other']);
    });
    it('does not require a topic without a taxonomy', () => {
        expect(parse([], { ...project, callTaxonomy: [] }).topicTagIds).toEqual([]);
    });
});
