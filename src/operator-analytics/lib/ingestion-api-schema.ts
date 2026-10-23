import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const callType: SchemaObject = { type: 'string', enum: ['incoming', 'outgoing', 'internal'], default: 'incoming', nullable: true };
const common: Record<string, SchemaObject> = {
    operatorName: { type: 'string' }, operatorId: { type: 'string' }, operatorExtension: { type: 'string' }, clientPhone: { type: 'string' }, callType,
    language: { type: 'string', default: 'auto' }, provider: { type: 'string' },
    projectId: { type: 'number', description: 'Overrides the token project on ingestion' },
    consentObtained: { type: 'boolean' }, consentSource: { type: 'string' },
    customMetrics: { type: 'array', items: { type: 'object', additionalProperties: true } },
};

export const multipartAnalyzeSchema: SchemaObject = {
    type: 'object', required: ['file'],
    properties: {
        ...common,
        projectId: { type: 'string' }, consentObtained: { type: 'string' },
        customMetrics: { type: 'string', description: 'JSON array of metric definitions' },
        file: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'One or more audio files, at most 50 MiB each' },
        sync: { type: 'string', enum: ['true', 'false'], default: 'false', description: 'Only a single file can be synchronous' },
    },
};

export const urlAnalyzeSchema: SchemaObject = {
    type: 'object',
    description: 'Legacy URL endpoint: always asynchronous. Send url or urls. Use /analyze for sync=true.',
    anyOf: [{ required: ['url'] }, { required: ['urls'] }],
    properties: { ...common, url: { type: 'string', format: 'uri' }, urls: { type: 'array', items: { type: 'string', format: 'uri' } } },
};
