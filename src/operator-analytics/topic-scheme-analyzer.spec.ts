import { OperatorAnalyticsService } from './operator-analytics.service';
import { AnalysisSchemaValidationError } from './lib/analysis-schema';

describe('native managed-topic analyzer', () => {
    it('uses structured evidence on schema repair and resolves competing matches itself', async () => {
        const service: any = Object.create(OperatorAnalyticsService.prototype);
        service.logger = { log: jest.fn(), warn: jest.fn() };
        service.analyticsModel = 'gpt-5-nano';
        const tags = ['booking', 'results', 'other'].map(id => ({ id, name: id, aliases: [] }));
        const scheme = { version: 1, fallbackTopicId: 'other', topics: tags.map(t => ({ ...t,
            when: 'Selection criterion', exclude: '', examples: [] })).map(({ aliases, ...topic }) => topic) };
        const project: any = { singleTopic: true, visibleDefaultMetrics: ['greeting_quality'], callTaxonomy: tags,
            topicSchemeState: { active: { scheme } } };
        const content = JSON.stringify({ assessments: {}, greeting_quality: 100, customer_sentiment: 'Neutral', csat: 4,
            summary: 'Synthetic mixed request', success: true, analysis_confidence: 0.9, insufficient_content: false,
            topic_tag_ids: ['other'], // A model-supplied final label cannot override the resolver.
            topic_eligibility: { booking: { matches: true, reason: 'Explicit booking request' },
                results: { matches: true, reason: 'Results also requested' } },
            diarized_text: [{ speaker: 'customer', text: 'Book and send results.' }, { speaker: 'operator', text: 'I will help.' }] });
        service.chatWithFallback = jest.fn().mockRejectedValueOnce(new AnalysisSchemaValidationError('Missing evidence', '{}'))
            .mockResolvedValue({ content, model: 'deepseek-flash', usage: {} });
        const result = await service.previewTopicScheme('Synthetic mixed booking and results request', project);
        expect(result.topicIds).toEqual(['booking']);
        expect(result.decision.eligibleTopicIds).toEqual(['booking', 'results']);
        const repair = service.chatWithFallback.mock.calls[1][0].at(-1).content;
        expect(repair).toContain('Return topic_eligibility');
        expect(repair).not.toContain('topic_tag_ids must contain exactly one');
        expect(service.chatWithFallback.mock.calls[0][0][0].content).toContain('only the STRUCTURED CALL TOPIC SCHEME');
    });
});
