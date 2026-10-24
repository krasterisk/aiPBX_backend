/** Refresh only the analytics controller contract without opening a database/network connection. */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { OperatorAnalyticsController } from '../src/operator-analytics/operator-analytics.controller';
import { OperatorAnalyticsService } from '../src/operator-analytics/operator-analytics.service';
import { OperatorDigestService } from '../src/operator-analytics/operator-digest.service';
import { OperatorAlertService } from '../src/operator-analytics/operator-alert.service';
import { ApiTokenGuard } from '../src/operator-analytics/guards/api-token.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AiCdr } from '../src/ai-cdr/ai-cdr.model';
import { OperatorAnalytics } from '../src/operator-analytics/operator-analytics.model';
import { TopicSchemeController } from '../src/operator-analytics/topic-scheme.controller';
import { TopicSchemeService } from '../src/operator-analytics/topic-scheme.service';

async function main() {
    const module = await Test.createTestingModule({
        controllers: [OperatorAnalyticsController, TopicSchemeController],
        providers: [OperatorAnalyticsService, OperatorDigestService, OperatorAlertService, TopicSchemeService].map(provide => ({ provide, useValue: {} })),
    }).overrideGuard(ApiTokenGuard).useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard).useValue({ canActivate: () => true }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build(), { extraModels: [AiCdr, OperatorAnalytics] });
    const target = resolve(__dirname, '../openapi.json');
    const existing = JSON.parse(readFileSync(target, 'utf8'));
    for (const [key, value] of Object.entries(document.paths)) existing.paths[key] = value;
    Object.assign(existing.components.schemas, document.components?.schemas);
    writeFileSync(target, JSON.stringify(existing, null, 2) + '\n');
    await app.close();
    console.log('Updated analytics OpenAPI paths and schemas without DB access');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
