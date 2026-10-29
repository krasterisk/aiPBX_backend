import { previewMetrics } from './quality-preview.service';
import { OperatorAnalyticsService } from '../operator-analytics.service';

function fixture() {
    const service: any = Object.create(OperatorAnalyticsService.prototype);
    service.qualityPreviewJobs = new Set();
    const project = { id: 5, userId: '99', currentSchemaVersion: 1, setDataValue: jest.fn() };
    service.analyticsRepository = { findOne: jest.fn(async () => ({ transcription: 'Synthetic operator and customer dialogue' })) };
    service.projectRepository = { findOne: jest.fn(async () => project) };
    service.qualityPreview = {
        authorize: jest.fn(async () => ({ channelId: '123', userId: '99', projectId: 5, source: 'external-api' })),
        rules: jest.fn(async () => ({ config: { minimumCoverage: 0.9 } })),
        ensure: jest.fn(async () => ({ metrics: { _preview_source_hash: 'original-hash', _topics: { tags: ['service'] } } })),
        scoring: { writeAnalysis: jest.fn(), detail: jest.fn(async () => ({ evaluation: 'isolated' })) },
    };
    service.analyzeTranscription = jest.fn(async () => ({ metrics: { greeting_quality: 100,
        _quality_card: { userId: '99', projectId: 5 }, _quality_operation: 'operation', _quality_input: { transcription: 'frozen' } },
        customMetricsResult: { speed: 4 }, modelName: 'synthetic', assessments: {}, customMeta: {}, usage: { total_tokens: 25 } }));
    return service;
}
it('runs the strict applicability prompt only for the isolated admin preview and never invokes a legacy writer', async () => {
    const service = fixture();
    await expect(service.analyzeQualityPreview('123', '1', false)).rejects.toThrow('Admin preview required');
    expect(service.analyzeTranscription).not.toHaveBeenCalled();
    expect(await service.analyzeQualityPreview('123', '1', true)).toEqual({ evaluation: 'isolated' });
    expect(service.analyzeTranscription.mock.calls[0][4]).toEqual({ llmDiarize: false, qualityPreview: true });
    const input = service.qualityPreview.scoring.writeAnalysis.mock.calls[0][0];
    expect(input).toMatchObject({ userId: '99', projectId: 5, operationId: 'operation', inputSnapshot: { transcription: 'frozen' },
        fields: { metrics: { custom_metrics: { speed: 4 }, _preview_source_hash: 'original-hash', _topics: { tags: ['service'] } } } });
    expect(input.fields.metrics).not.toHaveProperty('_quality_card');
    expect(input.fields.metrics).not.toHaveProperty('_quality_input');
    expect(service.qualityPreviewJobs.size).toBe(0);
});
it('retains the prior preview and releases its job lock when the provider fails', async () => {
    const service = fixture();
    service.analyzeTranscription.mockRejectedValue(new Error('Synthetic timeout'));
    await expect(service.analyzeQualityPreview('123', '1', true)).rejects.toThrow('Synthetic timeout');
    expect(service.qualityPreview.scoring.writeAnalysis).not.toHaveBeenCalled();
    expect(service.qualityPreviewJobs.size).toBe(0);
});

it('reads encoded historical objects while rejecting unsupported shapes without inventing scores', () => {
    expect(previewMetrics(JSON.stringify({ greeting_quality: 75, rationale: 'a\u0000b' }))).toEqual({ greeting_quality: 75, rationale: 'ab' });
    expect(previewMetrics(JSON.stringify(JSON.stringify({ greeting_quality: 50 })))).toEqual({ greeting_quality: 50 });
    expect(previewMetrics('bad json')).toEqual({});
    expect(previewMetrics([100])).toEqual({});
});

it('does not report a newly saved analysis complete until its quality projection is published', async () => {
    const service = fixture();
    service.aiAnalyticsRepository = { create: jest.fn(async () => ({ channelId: 'one' })), sequelize: { getDialect: () => 'postgres' } };
    let publish!: () => void;
    service.qualityPreview.ensure.mockReturnValue(new Promise<void>(resolve => { publish = resolve; }));
    let complete = false;
    const saved = service.persistAnalysisProjection({ channelId: 'one', metrics: {} }, '99', 5).then(() => { complete = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(service.qualityPreview.ensure).toHaveBeenCalledWith('one', '99');
    expect(complete).toBe(false);
    publish(); await saved;
    expect(complete).toBe(true);
});
