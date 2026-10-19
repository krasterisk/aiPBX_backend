/** Refresh affected DTO/model schemas without starting DB, telephony or workers. */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { readFileSync, writeFileSync } from 'fs';
import { AnalyzeRequestDto } from '../src/operator-analytics/dto/analyze.dto';
import { OperatorEvidenceResponseDto } from '../src/operator-analytics/dto/operator-evidence.dto';
import { OperatorTopicStatsDto } from '../src/operator-analytics/dto/operator-topic-stats.dto';
import { AiCdr } from '../src/ai-cdr/ai-cdr.model';

@Module({})
class SchemaOnlyModule {}

async function main() {
    const app = await NestFactory.create(SchemaOnlyModule, { logger: false });
    try {
        const affected = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Schema only').setVersion('1').build(), {
            extraModels: [AnalyzeRequestDto, OperatorEvidenceResponseDto, OperatorTopicStatsDto, AiCdr],
        });
        const document: OpenAPIObject = JSON.parse(readFileSync('openapi.json', 'utf8'));
        Object.assign(document.components.schemas, affected.components?.schemas);
        const prefix = Object.keys(document.paths).some(path => path.startsWith('/api/')) ? '/api' : '';
        const identity = { type: 'string', maxLength: 128, description: 'Stable source-namespaced employee ID; scoped by account' };
        for (const [path, verbs] of Object.entries(document.paths)) {
            if (!path.includes('/operator-analytics/')) continue;
            for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
                const operation = verbs[method];
                if (!operation || typeof operation !== 'object') continue;
                const filterEndpoint = method === 'get' && /\/(cdrs|dashboard|operator-evidence|insights)$/.test(path);
                if (filterEndpoint && !operation.parameters) operation.parameters = [];
                if (!Array.isArray(operation.parameters)) continue;
                if ((filterEndpoint || operation.parameters.some(p => 'in' in p && p.in === 'query' && p.name === 'operatorName')) &&
                    !operation.parameters.some(p => 'name' in p && p.name === 'operatorId')) {
                    operation.parameters.push({ name: 'operatorId', in: 'query', required: false, schema: identity });
                }
            }
        }
        const path = `${prefix}/operator-analytics/analyze`;
        if (document.paths[path]?.post) document.paths[path].post.requestBody = {
            required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AnalyzeRequestDto' } } },
        };
        writeFileSync('openapi.json', JSON.stringify(document, null, 2) + '\n');
        console.log('Updated affected schemas using actual decorators; no external services started');
    } finally { await app.close(); }
}
main().catch(() => { console.error('Offline schema export failed'); process.exitCode = 1; });
