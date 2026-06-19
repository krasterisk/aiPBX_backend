/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../../app.module';
import { OperatorAnalyticsService } from '../operator-analytics.service';
import { buildEvalReport, EvalItem, PredictedValues } from './eval-metrics';
import { loadGoldenSet } from './golden-set.types';

/**
 * Offline analytics-quality eval runner.
 *
 * Runs the analysis LLM over the expert-labeled golden set WITHOUT creating
 * billing records (dry-run), then reports MAE / accuracy / Cohen's kappa of the
 * model vs human reference scores. Run on prompt/model changes.
 *
 *   npm run eval:operator
 *   npm run eval:operator -- --out=eval-report.json
 *
 * Requires the same env as the app (DB + LLM provider reachable).
 */
async function main(): Promise<void> {
    const outArg = process.argv.find(a => a.startsWith('--out='));
    const outPath = outArg ? outArg.slice('--out='.length) : null;

    const cases = loadGoldenSet();
    if (!cases.length) {
        console.error('No golden-set fixtures found in src/operator-analytics/eval/golden-set. Nothing to evaluate.');
        process.exit(1);
        return;
    }
    console.log(`Loaded ${cases.length} golden case(s). Bootstrapping app context...`);

    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const service = app.get(OperatorAnalyticsService);

    const items: EvalItem[] = [];
    let failures = 0;

    for (const c of cases) {
        try {
            const result = await service.dryRunAnalyze(c.transcript);
            const predicted = flattenPrediction(result.metrics, result.customMetricsResult);
            items.push({ id: c.id, reference: c.reference, predicted });
            console.log(`  ✓ ${c.id} (model=${result.modelName}, prompt=${result.promptVersion})`);
        } catch (e) {
            failures++;
            console.error(`  ✗ ${c.id}: ${(e as Error).message}`);
        }
    }

    const report = buildEvalReport(items);

    console.log('\n=== Operator Analytics Eval Report ===');
    console.log(`Cases evaluated: ${report.casesEvaluated}/${cases.length} (failures: ${failures})`);
    console.log(`Overall MAE (numeric, lower=better): ${report.overallMae ?? 'n/a'}`);
    console.log(`Overall accuracy (categorical, higher=better): ${report.overallAccuracy ?? 'n/a'}`);

    console.log('\nNumeric metrics (MAE):');
    for (const m of report.numeric) {
        console.log(`  ${m.metric.padEnd(22)} MAE=${m.mae}  (n=${m.n})`);
    }
    console.log('\nCategorical metrics (accuracy / kappa):');
    for (const m of report.categorical) {
        console.log(`  ${m.metric.padEnd(22)} acc=${m.accuracy}  kappa=${m.kappa ?? 'n/a'}  (n=${m.n})`);
    }

    if (outPath) {
        const abs = path.resolve(outPath);
        fs.writeFileSync(abs, JSON.stringify({ generatedAt: new Date().toISOString(), report, items }, null, 2));
        console.log(`\nReport written to ${abs}`);
    }

    await app.close();
    process.exit(failures > 0 ? 2 : 0);
}

function flattenPrediction(metrics: Record<string, any>, customMetricsResult: any): PredictedValues {
    const numericKeys = [
        'greeting_quality', 'script_compliance', 'politeness_empathy',
        'active_listening', 'objection_handling', 'product_knowledge',
        'problem_resolution', 'speech_clarity_pace', 'closing_quality',
    ];
    const predicted: PredictedValues = {};
    for (const k of numericKeys) {
        if (typeof metrics[k] === 'number') (predicted as any)[k] = metrics[k];
    }
    if (typeof metrics.csat === 'number') predicted.csat = metrics.csat;
    if (typeof metrics.customer_sentiment === 'string') predicted.customer_sentiment = metrics.customer_sentiment;
    if (typeof metrics.success === 'boolean') predicted.success = metrics.success;
    predicted.custom_metrics = customMetricsResult ?? null;
    return predicted;
}

main().catch(e => {
    console.error('Eval runner crashed:', e);
    process.exit(1);
});
