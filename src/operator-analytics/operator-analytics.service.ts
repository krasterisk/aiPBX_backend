import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OperatorAnalytics, AnalyticsSource, AnalyticsStatus } from './operator-analytics.model';
import { OperatorApiToken } from './operator-api-token.model';
import { OperatorProject } from './operator-project.model';
import { MetricValue, MetricValueOrigin } from './operator-metric-value.model';
import { MetricOverride, MetricOverrideOrigin } from './operator-metric-override.model';
import { parseKeywordList, spotKeywords } from './lib/keyword-spotting';
import { computeAudioSha256 } from './lib/audio-hash';
import {
    aggregateMetricsFromSql,
    buildDashboardCdrWhere,
    countLowQualityCdrs,
    DASHBOARD_PAGE_SIZE,
} from './lib/dashboard-aggregation';
import { OpenAiTranscriptionProvider } from './providers/openai-transcription.provider';
import { ExternalSttProvider } from './providers/external-stt.provider';
import { WhisperService } from '../whisper/whisper.service';
import { Prices } from '../prices/prices.model';
import { UsersService } from '../users/users.service';
import { User } from '../users/users.model';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../ai-analytics/ai-analytics.model';
import { BillingRecord } from '../billing/billing-record.model';
import { BillingFxService } from '../billing/billing-fx.service';
import { isRubTenant } from '../shared/tenant/tenant-currency';
import {
    OperatorMetrics, CustomMetricDef, ITranscriptionProvider, TranscriptionResult,
    MetricDefinition, DefaultMetricKey, WebhookEvent, BatchStatus,
    TranscriptionQualityLevel, StoredMetricMeta, ALL_DEFAULT_METRIC_KEYS,
} from './interfaces/operator-metrics.interface';
import {
    assessTranscriptionQuality,
    combineTranscriptionQuality,
    TranscriptionQualityAssessment,
    TranscriptionQualityThresholds,
    DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS,
} from './lib/assess-transcription-quality';
import {
    AnalysisSchemaValidationError,
    buildAnalysisContext,
    buildAnalysisPrompt,
    buildCustomMetricMeta,
    buildOpenAiJsonSchema,
    parseAndValidateAnalysisResponse,
    MetricAssessment,
    PROMPT_VERSION,
} from './lib/analysis-schema';
import { PROJECT_TEMPLATES } from './project-templates';
import { OPERATOR_CDR_SOURCE } from './lib/analytics-source';
import { Op, Sequelize } from 'sequelize';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

@Injectable()
export class OperatorAnalyticsService {
    private readonly logger = new Logger(OperatorAnalyticsService.name);
    private readonly openAiClient: OpenAI;
    private readonly ollamaClient: OpenAI | null = null;
    private readonly analyticsModel: string;
    private readonly fallbackModel: string;
    private readonly minAnalysisDurationSec: number;
    private readonly qualityThresholds: TranscriptionQualityThresholds;
    private readonly keywordSpottingList: string[];
    private readonly dedupByHashEnabled: boolean;
    private readonly stuckMinutes: number;
    private readonly sttProviders: Map<string, ITranscriptionProvider> = new Map();

    // ─── Batch Processing Tracker ─────────────────────────────────────
    private readonly batches = new Map<string, BatchStatus>();
    private readonly BATCH_TTL = 60 * 60 * 1000; // 1 hour

    constructor(
        @InjectModel(OperatorAnalytics) private readonly analyticsRepository: typeof OperatorAnalytics,
        @InjectModel(AiCdr) private readonly aiCdrRepository: typeof AiCdr,
        @InjectModel(AiAnalytics) private readonly aiAnalyticsRepository: typeof AiAnalytics,
        @InjectModel(BillingRecord) private readonly billingRecordRepository: typeof BillingRecord,
        @InjectModel(OperatorApiToken) private readonly apiTokenRepository: typeof OperatorApiToken,
        @InjectModel(OperatorProject) private readonly projectRepository: typeof OperatorProject,
        @InjectModel(MetricValue) private readonly metricValueRepository: typeof MetricValue,
        @InjectModel(MetricOverride) private readonly metricOverrideRepository: typeof MetricOverride,
        @InjectModel(Prices) private readonly pricesRepository: typeof Prices,
        @InjectModel(User) private readonly userRepository: typeof User,
        private readonly usersService: UsersService,
        private readonly configService: ConfigService,
        private readonly openAiSttProvider: OpenAiTranscriptionProvider,
        private readonly externalSttProvider: ExternalSttProvider,
        private readonly whisperService: WhisperService,
        private readonly billingFx: BillingFxService,
    ) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
        this.openAiClient = new OpenAI({
            apiKey,
            baseURL: process.env.OPENAI_BASE_URL || undefined,
        });

        // Ollama fallback client
        const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
        this.ollamaClient = new OpenAI({
            baseURL: `${ollamaUrl}/v1`,
            apiKey: 'ollama',
        });

        this.analyticsModel = process.env.ANALYTICS_LLM_MODEL || 'gpt-4o-mini';
        this.fallbackModel = process.env.ANALYTICS_FALLBACK_MODEL || process.env.DEFAULT_OLLAMA_MODEL || 'gemma4:e4b';
        const configuredMinDuration = Number(
            this.configService.get<string>('OPERATOR_ANALYSIS_MIN_DURATION_SEC')
            || process.env.OPERATOR_ANALYSIS_MIN_DURATION_SEC,
        );
        this.minAnalysisDurationSec = Number.isFinite(configuredMinDuration) && configuredMinDuration > 0
            ? configuredMinDuration
            : 10;

        this.qualityThresholds = {
            minWords: this.readPositiveEnv('OPERATOR_QUALITY_MIN_WORDS', DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS.minWords),
            avgLogprobMin: this.readNumericEnv('OPERATOR_QUALITY_AVG_LOGPROB_MIN', DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS.avgLogprobMin),
            avgLogprobUnusable: this.readNumericEnv('OPERATOR_QUALITY_AVG_LOGPROB_UNUSABLE', DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS.avgLogprobUnusable),
            maxNoSpeech: this.readNumericEnv('OPERATOR_QUALITY_MAX_NOSPEECH', DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS.maxNoSpeech),
            maxNoSpeechUnusable: this.readNumericEnv('OPERATOR_QUALITY_MAX_NOSPEECH_UNUSABLE', DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS.maxNoSpeechUnusable),
            maxCompression: this.readNumericEnv('OPERATOR_QUALITY_MAX_COMPRESSION', DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS.maxCompression),
            minCompression: this.readNumericEnv('OPERATOR_QUALITY_MIN_COMPRESSION', DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS.minCompression),
            minLanguageProbability: this.readNumericEnv('OPERATOR_QUALITY_MIN_LANGUAGE_PROB', DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS.minLanguageProbability),
        };

        // Register STT providers
        const openaiSttEnabled = (this.configService.get<string>('OPENAI_STT_ENABLED') || process.env.OPENAI_STT_ENABLED || 'false').toLowerCase() === 'true';
        if (openaiSttEnabled) {
            this.sttProviders.set('openai', this.openAiSttProvider);
            this.logger.log('OpenAI STT provider: ENABLED');
        } else {
            this.logger.log('OpenAI STT provider: DISABLED (set OPENAI_STT_ENABLED=true to enable)');
        }
        this.sttProviders.set('external', this.externalSttProvider);
        this.sttProviders.set('whisper', this.whisperService);
        this.keywordSpottingList = parseKeywordList(
            this.configService.get<string>('OPERATOR_KEYWORD_SPOTTING') || process.env.OPERATOR_KEYWORD_SPOTTING,
        );
        this.dedupByHashEnabled = this.readBooleanEnv('OPERATOR_DEDUP_BY_HASH', false);
        this.stuckMinutes = this.readNumericEnv('OPERATOR_STUCK_MINUTES', 0);
    }

    // ─── LLM with fallback ─────────────────────────────────────────

    /**
     * Call LLM with automatic fallback: OpenAI (gpt-4o-mini) → Ollama (gemma4:e4b)
     */
    private async chatWithFallback(
        messages: any[],
        options: {
            jsonSchema?: Record<string, unknown>;
            schemaName?: string;
            temperature?: number;
            jsonObject?: boolean;
        } = {},
    ): Promise<{ content: string; usage?: any; model: string }> {
        const temperature = options.temperature ?? 0;
        // Primary: OpenAI
        try {
            const params: any = {
                messages,
                model: this.analyticsModel,
                temperature,
            };
            if (options.jsonSchema) {
                params.response_format = {
                    type: 'json_schema',
                    json_schema: {
                        name: options.schemaName || 'operator_analysis',
                        strict: true,
                        schema: options.jsonSchema,
                    },
                };
            } else if (options.jsonObject !== false) {
                params.response_format = { type: 'json_object' };
            }

            const completion = await this.openAiClient.chat.completions.create(params);
            return {
                content: completion.choices[0]?.message?.content || '{}',
                usage: completion.usage,
                model: this.analyticsModel,
            };
        } catch (err) {
            this.logger.warn(`[Analytics LLM] OpenAI (${this.analyticsModel}) failed: ${err.message}. Falling back to Ollama...`);
        }

        // Fallback: Ollama
        if (!this.ollamaClient) {
            throw new Error('Both OpenAI and Ollama are unavailable for analytics');
        }

        try {
            const params: any = {
                messages,
                model: this.fallbackModel,
                temperature,
                response_format: { type: 'json_object' },
            };

            const completion = await this.ollamaClient.chat.completions.create(params);
            const raw = completion.choices[0]?.message?.content || '{}';
            const content = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

            this.logger.log(`[Analytics LLM] Ollama fallback (${this.fallbackModel}) succeeded`);
            return { content, usage: completion.usage, model: this.fallbackModel };
        } catch (fallbackErr) {
            this.logger.error(`[Analytics LLM] Ollama fallback also failed: ${fallbackErr.message}`);
            throw fallbackErr;
        }
    }

    // ─── Dialect-aware SQL helpers ───
    private q(name: string): string {
        const dialect = this.analyticsRepository.sequelize.getDialect();
        return dialect === 'postgres' ? `"${name}"` : `\`${name}\``;
    }

    private sqlJsonExtract(column: string, jsonPath: string, pgPath: string): string {
        const dialect = this.analyticsRepository.sequelize.getDialect();
        // Assuming table alias in query is OperatorAnalytics
        const table = 'OperatorAnalytics';
        return dialect === 'postgres'
            ? `(${this.q(table)}.${this.q(column)}::jsonb${pgPath})`
            : `JSON_EXTRACT(${this.q(table)}.${this.q(column)}, '${jsonPath}')`;
    }

    private likeOp(value: string): Record<string, string> {
        const dialect = this.analyticsRepository.sequelize.getDialect();
        const op = dialect === 'postgres' ? Op.iLike : Op.like;
        return { [op]: value };
    }

    /**
     * Sanitize a URL:
     * - strip duplicate protocol prefixes (http://http://... → http://...)
     * - replace spaces with %20 (handles + being decoded to space in phone numbers)
     */
    private sanitizeUrl(url: string): string {
        let sanitized = url.replace(/^(https?:\/\/)+/i, (match) => {
            const proto = match.toLowerCase().includes('https') ? 'https://' : 'http://';
            return proto;
        });
        // Replace spaces that may appear from decoded '+' signs
        sanitized = sanitized.replace(/ /g, '%2B');
        return sanitized;
    }

    /**
     * Runs STT with automatic fallback to OpenAI Whisper if the primary provider fails.
     * If STT_API_URL is not set, goes straight to OpenAI.
     */
    private async transcribeWithFallback(
        buffer: Buffer,
        filename: string,
        language: string,
        preferredProvider?: string,
    ): Promise<TranscriptionResult & { provider: string }> {
        const providerName = preferredProvider
            || this.configService.get<string>('DEFAULT_STT_PROVIDER')
            || process.env.DEFAULT_STT_PROVIDER
            || 'whisper';
        const provider = this.sttProviders.get(providerName);

        if (!provider) {
            throw new Error(`STT provider "${providerName}" is not registered`);
        }

        this.logger.log(`[STT] Using provider: ${providerName}`);
        const result = await provider.transcribe(buffer, filename, language);
        this.logger.log(`[STT] Provider "${providerName}" succeeded`);
        return { ...result, provider: providerName };
    }

    // ─── Core Analysis Pipeline ──────────────────────────────────────

    async analyzeFile(
        buffer: Buffer,
        filename: string,
        userId: string,
        source: AnalyticsSource,
        options: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: CustomMetricDef[];
            provider?: string;
            projectId?: number;
            recordUrl?: string;
            consentObtained?: boolean;
            consentSource?: string;
        } = {},
    ): Promise<OperatorAnalytics> {
        // 1. Pre-check balance
        await this.checkBalance(userId);

        const audioSha256 = computeAudioSha256(buffer);
        if (this.dedupByHashEnabled && options.projectId) {
            const duplicate = await this.findCompletedDuplicate(userId, options.projectId, audioSha256);
            if (duplicate) {
                this.logger.log(
                    `Dedup: reusing completed analysis #${duplicate.id} for "${filename}" (hash=${audioSha256.slice(0, 8)}…)`,
                );
                return duplicate;
            }
        }

        // 2. Create record
        const record = await this.analyticsRepository.create({
            userId,
            filename,
            source,
            status: AnalyticsStatus.PROCESSING,
            operatorName: options.operatorName,
            clientPhone: options.clientPhone,
            language: options.language || 'auto',
            projectId: options.projectId || null,
            recordUrl: options.recordUrl || null,
            consentObtained: options.consentObtained ?? null,
            consentSource: options.consentSource ?? null,
            audioSha256,
        });

        if (options.customMetrics?.length) {
            // customMetricsDef is removed from OperatorAnalytics model
        }

        try {
            // Resolve project for context-aware analysis
            let project: OperatorProject | null = null;
            if (options.projectId) {
                project = await this.projectRepository.findByPk(options.projectId);
            }

            // Snapshot the project schema version onto the record for honest historical trends.
            const schemaVersion = project?.currentSchemaVersion ?? null;
            await this.persistSchemaVersion(record, schemaVersion);

            // 3. Transcribe (external first, fallback to OpenAI Whisper)
            const sttResult = await this.transcribeWithFallback(
                buffer,
                filename,
                options.language || 'auto',
                options.provider,
            );

            if (await this.rejectIfUnusable(record, sttResult)) {
                throw new HttpException(
                    { message: record.errorMessage || this.getTooShortMessage(sttResult.duration) },
                    HttpStatus.BAD_REQUEST,
                );
            }

            const sttQuality = this.assessSttQuality(sttResult);
            await this.saveQualityOnRecord(record, sttResult, sttQuality);

            await record.update({
                transcription: sttResult.text,
                duration: sttResult.duration,
                sttProvider: sttResult.provider,
            });

            // 4. Analyze metrics via LLM (with project context if available)
            const { metrics, customMetricsResult, usage, diarizedText, analysisConfidence, insufficientContent, assessments, customMeta, customMetricsInvalid, modelName } =
                await this.analyzeTranscription(
                    sttResult.text,
                    options.customMetrics,
                    project,
                    sttQuality.quality === 'low' ? sttQuality : undefined,
                );

            const finalQuality = combineTranscriptionQuality(sttQuality, {
                analysis_confidence: analysisConfidence,
                insufficient_content: insufficientContent,
            });
            await this.saveQualityOnRecord(record, sttResult, finalQuality);

            // 5. Update transcription with speaker-labeled version if available
            if (diarizedText) {
                await record.update({ transcription: diarizedText });
            }

            // 6. Calculate cost and charge (LLM tokens + STT duration)
            const totalTokens = usage?.total_tokens || 0;
            const { inTokens: textTokensIn, outTokens: textTokensOut } = this.extractTokenSplit(usage);
            const { totalCost, llmCost, sttCost } = await this.chargeCost(userId, totalTokens, sttResult.duration, sttResult.provider);

            // 7. Save results locally
            await record.update({
                status: AnalyticsStatus.COMPLETED,
            });

            const channelId = record.id.toString();
            const cdrSource = source === AnalyticsSource.API ? OPERATOR_CDR_SOURCE.EXTERNAL_API : OPERATOR_CDR_SOURCE.EXTERNAL_FRONT;
            const assistantName = options.operatorName || 'Unknown Operator';
            const mergedMetrics = this.enrichStoredMetrics(
                customMetricsResult ? { ...metrics, custom_metrics: customMetricsResult } : metrics,
                finalQuality,
                { assessments, customMeta, model: modelName, schemaVersion, customInvalid: customMetricsInvalid, promptVersion: PROMPT_VERSION, topics: this.spotTopicKeywords(sttResult.text) },
            );

            const cdrCost = await this.cdrCostFields(totalCost);
            const billingFx = await this.billingFx.fieldsForUsdAmount(totalCost);

            await this.aiCdrRepository.create({
                channelId,
                projectId: record.projectId,
                duration: Math.round(sttResult.duration),
                userId: record.userId,
                ...cdrCost,
                tokens: totalTokens,
                assistantName: assistantName,
                callerId: options.clientPhone || '',
                source: cdrSource,
                recordUrl: record.recordUrl || '',
            });

            await this.aiAnalyticsRepository.create({
                channelId,
                metrics: mergedMetrics,
                summary: metrics.summary || '',
                sentiment: metrics.customer_sentiment || '',
                csat: metrics.csat || null,
                cost: totalCost,
                tokens: totalTokens,
            });
            await this.writeMetricValues(channelId, record.userId, record.projectId, schemaVersion, mergedMetrics);

            await this.billingRecordRepository.create({
                channelId,
                type: 'analytic',
                userId: record.userId,
                description: 'File analysis',
                totalTokens: totalTokens,
                textTokens: totalTokens,
                textTokensIn,
                textTokensOut,
                audioTokens: 0,
                totalCost: totalCost,
                sttCost: sttCost,
                textCost: llmCost,
                ...billingFx,
            });
            await this.checkProjectBudget(project, record.userId);

            this.logger.log(`Analysis completed for "${filename}" (id=${record.id}), cost=${totalCost} (llm=${llmCost}, stt=${sttCost}), tokens=${totalTokens}`);

            // 7. Call webhook if configured
            if (project) {
                this.callWebhook(project, 'analysis.completed', {
                    recordId: record.id, filename, metrics, customMetrics: customMetricsResult,
                }).catch(err => this.logger.warn(`Webhook error: ${err.message}`));
            }

            return record.reload();
        } catch (e) {
            const tooShortResponse = e instanceof HttpException
                && e.getStatus() === HttpStatus.BAD_REQUEST
                && String((e.getResponse() as { message?: string })?.message || '').includes('too short');

            const invalidAnalysis = e instanceof AnalysisSchemaValidationError;

            const errorMessage = tooShortResponse
                ? String((e.getResponse() as { message?: string }).message)
                : invalidAnalysis
                    ? `Invalid LLM analysis output: ${e.message}`
                    : e.message;

            this.logger.error(`Analysis failed for "${filename}" (id=${record.id}): ${errorMessage}`);

            if (!tooShortResponse) {
                await record.update({
                    status: AnalyticsStatus.ERROR,
                    errorMessage,
                });
            }
            throw e;
        }
    }

    async analyzeUrl(
        rawUrl: string,
        userId: string,
        options: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: CustomMetricDef[];
            provider?: string;
            projectId?: number;
        } = {},
    ): Promise<OperatorAnalytics> {
        await this.checkBalance(userId);

        const url = this.sanitizeUrl(rawUrl);
        this.logger.log(`Downloading file from URL: ${url}`);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 120_000, // 2 min
            maxContentLength: 50 * 1024 * 1024, // 50 MB
            maxRedirects: 5,
        });

        const buffer = Buffer.from(response.data);
        const contentLength = response.headers['content-length'];
        this.logger.log(`Downloaded ${buffer.length} bytes (Content-Length: ${contentLength || 'unknown'}) from ${url}`);
        if (contentLength && buffer.length < parseInt(contentLength, 10)) {
            this.logger.warn(`Partial download detected: got ${buffer.length} of ${contentLength} bytes`);
        }
        const filename = this.extractFilenameFromUrl(url);

        return this.analyzeFile(buffer, filename, userId, AnalyticsSource.API, {
            ...options,
            recordUrl: url,
        });
    }

    async processUrlInBackground(recordId: number, rawUrl: string, provider?: string): Promise<void> {
        const record = await this.analyticsRepository.findByPk(recordId);
        if (!record) return;

        const url = this.sanitizeUrl(rawUrl);
        try {
            await this.checkBalance(record.userId);

            this.logger.log(`Background: downloading file from URL: ${url}`);
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 120_000,
                maxContentLength: 50 * 1024 * 1024,
            });
            const buffer = Buffer.from(response.data);
            const contentLength = response.headers['content-length'];
            this.logger.log(`Downloaded ${buffer.length} bytes (Content-Length: ${contentLength || 'unknown'}) from ${url}`);
            if (contentLength && buffer.length < parseInt(contentLength, 10)) {
                this.logger.warn(`Partial download detected: got ${buffer.length} of ${contentLength} bytes`);
            }
            await this.processInBackground(recordId, buffer, provider);
        } catch (e) {
            const isBalanceError = e instanceof HttpException && e.getStatus() === HttpStatus.PAYMENT_REQUIRED;
            const errorMessage = isBalanceError
                ? ((e.getResponse() as { message?: string })?.message || e.message)
                : e.message;
            const logLabel = isBalanceError ? 'Background analysis failed' : 'Background URL download failed';
            this.logger.error(`${logLabel} for record #${recordId}: ${errorMessage}`);
            const recordOnError = await this.analyticsRepository.findByPk(recordId);
            if (recordOnError) {
                await recordOnError.update({ status: AnalyticsStatus.ERROR, errorMessage });

                if (recordOnError.projectId) {
                    const project = await this.projectRepository.findByPk(recordOnError.projectId);
                    if (project) {
                        this.callWebhook(project, 'analysis.error', {
                            recordId, error: errorMessage,
                        }).catch(() => { });
                    }
                }
            }
        }
    }

    // ─── Background Processing (Batch) ───────────────────────────────

    /**
     * Start a batch: process files sequentially (concurrency=1) with progress tracking.
     * Returns batchId immediately; processing runs in background.
     */
    startBatch(
        batchId: string,
        userId: string,
        items: { recordId: number; buffer: Buffer; filename: string }[],
        provider?: string,
    ): void {
        const batch: BatchStatus = {
            batchId,
            userId,
            total: items.length,
            completed: 0,
            failed: 0,
            items: items.map(i => ({
                id: i.recordId,
                filename: i.filename,
                status: 'pending' as const,
            })),
            startedAt: new Date(),
        };
        this.batches.set(batchId, batch);
        this.cleanupOldBatches();

        // Fire-and-forget sequential processing
        this.processBatchSequentially(batch, items, provider)
            .catch(e => this.logger.error(`Batch ${batchId} fatal error: ${e.message}`));
    }

    getBatchStatus(batchId: string, userId?: string, isAdmin = false): BatchStatus | null {
        const batch = this.batches.get(batchId);
        if (!batch) return null;
        // Ownership check — prevent cross-user batch enumeration (IDOR)
        if (!isAdmin && userId != null && String(batch.userId) !== String(userId)) {
            return null;
        }
        return batch;
    }

    getActiveBatches(userId: string): BatchStatus[] {
        this.cleanupOldBatches();
        const result: BatchStatus[] = [];
        for (const batch of this.batches.values()) {
            if (batch.userId === userId && !batch.finishedAt) {
                result.push(batch);
            }
        }
        return result;
    }

    private async processBatchSequentially(
        batch: BatchStatus,
        items: { recordId: number; buffer: Buffer; filename: string }[],
        provider?: string,
    ): Promise<void> {
        this.logger.log(`Batch ${batch.batchId}: starting ${items.length} files sequentially`);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            batch.items[i].status = 'processing';

            try {
                const status = await this.processInBackground(item.recordId, item.buffer, provider);
                if (status === AnalyticsStatus.COMPLETED) {
                    batch.items[i].status = 'completed';
                    batch.completed++;
                } else {
                    batch.items[i].status = 'error';
                    batch.failed++;
                    this.logger.warn(`Batch ${batch.batchId} item #${item.recordId} did not complete (status: ${status})`);
                }
            } catch (e) {
                batch.items[i].status = 'error';
                batch.failed++;
                this.logger.error(`Batch ${batch.batchId} item #${item.recordId} failed: ${e.message}`);
            }

            this.logger.log(`Batch ${batch.batchId}: ${batch.completed + batch.failed}/${batch.total} done`);
        }

        batch.finishedAt = new Date();
        this.logger.log(`Batch ${batch.batchId}: finished (${batch.completed} ok, ${batch.failed} failed)`);
    }

    private cleanupOldBatches(): void {
        const now = Date.now();
        for (const [id, batch] of this.batches) {
            if (batch.finishedAt && now - batch.finishedAt.getTime() > this.BATCH_TTL) {
                this.batches.delete(id);
            }
        }
    }

    async createProcessingRecord(
        filename: string,
        userId: string,
        source: AnalyticsSource,
        options: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: CustomMetricDef[];
            projectId?: number;
            recordUrl?: string;
            consentObtained?: boolean;
            consentSource?: string;
        } = {},
    ): Promise<OperatorAnalytics> {
        return this.analyticsRepository.create({
            userId,
            filename,
            source,
            status: AnalyticsStatus.PROCESSING,
            operatorName: options.operatorName,
            clientPhone: options.clientPhone,
            language: options.language || 'auto',
            projectId: options.projectId || null,
            recordUrl: options.recordUrl || null,
            consentObtained: options.consentObtained ?? null,
            consentSource: options.consentSource ?? null,
        });
    }

    async processInBackground(recordId: number, buffer: Buffer, provider?: string): Promise<AnalyticsStatus> {
        try {
            const record = await this.analyticsRepository.findByPk(recordId);
            if (!record) return AnalyticsStatus.ERROR;

            await this.checkBalance(record.userId);

            const audioSha256 = computeAudioSha256(buffer);
            await this.persistAudioSha256(record, audioSha256);

            if (this.dedupByHashEnabled && record.projectId) {
                const duplicate = await this.findCompletedDuplicate(
                    record.userId,
                    record.projectId,
                    audioSha256,
                    record.id,
                );
                if (duplicate) {
                    await this.completeFromDuplicate(record, duplicate);
                    return AnalyticsStatus.COMPLETED;
                }
            }

            // Resolve project
            let project: OperatorProject | null = null;
            if (record.projectId) {
                project = await this.projectRepository.findByPk(record.projectId);
            }
            const schemaVersion = project?.currentSchemaVersion ?? null;
            await this.persistSchemaVersion(record, schemaVersion);

            const sttResult = await this.transcribeWithFallback(
                buffer,
                record.filename,
                record.language || 'auto',
                provider,
            );

            if (await this.rejectIfUnusable(record, sttResult)) {
                this.logger.warn(
                    `Background analysis skipped for record #${recordId}: ${record.errorMessage || 'unusable transcript'}`,
                );
                return AnalyticsStatus.ERROR;
            }

            const sttQuality = this.assessSttQuality(sttResult);
            await this.saveQualityOnRecord(record, sttResult, sttQuality);

            await record.update({
                transcription: sttResult.text,
                duration: sttResult.duration,
                sttProvider: sttResult.provider,
            });

            const { metrics, customMetricsResult, usage, diarizedText, analysisConfidence, insufficientContent, assessments, customMeta, customMetricsInvalid, modelName } =
                await this.analyzeTranscription(
                    sttResult.text,
                    undefined,
                    project,
                    sttQuality.quality === 'low' ? sttQuality : undefined,
                );

            const finalQuality = combineTranscriptionQuality(sttQuality, {
                analysis_confidence: analysisConfidence,
                insufficient_content: insufficientContent,
            });
            await this.saveQualityOnRecord(record, sttResult, finalQuality);

            // Update transcription with speaker-labeled version if available
            if (diarizedText) {
                await record.update({ transcription: diarizedText });
            }

            const totalTokens = usage?.total_tokens || 0;
            const { inTokens: textTokensIn, outTokens: textTokensOut } = this.extractTokenSplit(usage);
            const { totalCost, llmCost, sttCost } = await this.chargeCost(record.userId, totalTokens, sttResult.duration, sttResult.provider);

            await record.update({
                status: AnalyticsStatus.COMPLETED,
            });

            const channelId = record.id.toString();
            // Source is frontend or api depending on what's set
            const cdrSource = record.source === AnalyticsSource.API ? OPERATOR_CDR_SOURCE.EXTERNAL_API : OPERATOR_CDR_SOURCE.EXTERNAL_FRONT;
            const assistantName = record.operatorName || 'Unknown Operator';
            const mergedMetrics = this.enrichStoredMetrics(
                customMetricsResult ? { ...metrics, custom_metrics: customMetricsResult } : metrics,
                finalQuality,
                { assessments, customMeta, model: modelName, schemaVersion, customInvalid: customMetricsInvalid, promptVersion: PROMPT_VERSION, topics: this.spotTopicKeywords(sttResult.text) },
            );

            const cdrCost = await this.cdrCostFields(totalCost);
            const billingFx = await this.billingFx.fieldsForUsdAmount(totalCost);

            await this.aiCdrRepository.create({
                channelId,
                projectId: record.projectId,
                duration: Math.round(sttResult.duration),
                userId: record.userId,
                ...cdrCost,
                tokens: totalTokens,
                assistantName: assistantName,
                callerId: record.clientPhone || '',
                source: cdrSource,
                recordUrl: record.recordUrl || '',
            });

            await this.aiAnalyticsRepository.create({
                channelId,
                metrics: mergedMetrics,
                summary: metrics.summary || '',
                sentiment: metrics.customer_sentiment || '',
                csat: metrics.csat || null,
                cost: totalCost,
                tokens: totalTokens,
            });
            await this.writeMetricValues(channelId, record.userId, record.projectId, schemaVersion, mergedMetrics);

            await this.billingRecordRepository.create({
                channelId,
                type: 'analytic',
                userId: record.userId,
                description: 'File analysis (background)',
                totalTokens: totalTokens,
                textTokens: totalTokens,
                textTokensIn,
                textTokensOut,
                audioTokens: 0,
                totalCost: totalCost,
                sttCost: sttCost,
                textCost: llmCost,
                ...billingFx,
            });
            await this.checkProjectBudget(project, record.userId);

            this.logger.log(`Background analysis completed for record #${recordId}`);

            // Webhook
            if (project) {
                this.callWebhook(project, 'analysis.completed', {
                    recordId, filename: record.filename, metrics, customMetrics: customMetricsResult,
                }).catch(err => this.logger.warn(`Webhook error: ${err.message}`));
            }

            return AnalyticsStatus.COMPLETED;
        } catch (e) {
            this.logger.error(`Background analysis failed for record #${recordId}: ${e.message}`);
            const record = await this.analyticsRepository.findByPk(recordId);
            if (record) {
                await record.update({ status: AnalyticsStatus.ERROR, errorMessage: e.message });

                // Webhook for error
                if (record.projectId) {
                    const project = await this.projectRepository.findByPk(record.projectId);
                    if (project) {
                        this.callWebhook(project, 'analysis.error', {
                            recordId, error: e.message,
                        }).catch(() => { });
                    }
                }
            }
            return AnalyticsStatus.ERROR;
        }
    }

    async regenerateAnalysis(channelId: string, userId: string, isAdmin: boolean): Promise<AiCdr> {
        const recordId = Number(channelId);
        if (!Number.isFinite(recordId)) {
            throw new HttpException('Invalid channelId', HttpStatus.BAD_REQUEST);
        }

        const record = await this.analyticsRepository.findByPk(recordId);
        if (!record) {
            throw new HttpException('Operator analysis record not found', HttpStatus.NOT_FOUND);
        }

        if (!isAdmin && String(record.userId) !== String(userId)) {
            throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        }

        const aiCdr = await this.aiCdrRepository.findOne({
            where: { channelId: String(recordId) },
            include: [
                { model: AiAnalytics, as: 'analytics' },
                { model: BillingRecord, as: 'billingRecords' },
            ],
        });
        if (!aiCdr) {
            throw new HttpException('Call record not found', HttpStatus.NOT_FOUND);
        }

        const recordUrl = record.recordUrl || aiCdr.recordUrl;
        if (!recordUrl) {
            throw new HttpException('Recording URL is missing', HttpStatus.BAD_REQUEST);
        }

        await this.checkBalance(record.userId);
        await record.update({ status: AnalyticsStatus.PROCESSING, errorMessage: null });

        try {
        const url = this.sanitizeUrl(recordUrl);
        this.logger.log(`Regenerating analysis for record #${recordId}: downloading ${url}`);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 120_000,
            maxContentLength: 50 * 1024 * 1024,
            maxRedirects: 5,
        });
        const buffer = Buffer.from(response.data);

        let project: OperatorProject | null = null;
        if (record.projectId) {
            project = await this.projectRepository.findByPk(record.projectId);
        }
        const schemaVersion = project?.currentSchemaVersion ?? null;
        await this.persistSchemaVersion(record, schemaVersion);

        const sttResult = await this.transcribeWithFallback(
            buffer,
            record.filename,
            record.language || 'auto',
            record.sttProvider || undefined,
        );

        if (await this.rejectIfUnusable(record, sttResult)) {
            throw new HttpException(
                { message: record.errorMessage || this.getTooShortMessage(sttResult.duration) },
                HttpStatus.BAD_REQUEST,
            );
        }

        const sttQuality = this.assessSttQuality(sttResult);
        await this.saveQualityOnRecord(record, sttResult, sttQuality);

        await record.update({
            transcription: sttResult.text,
            duration: sttResult.duration,
            sttProvider: sttResult.provider,
        });

        const { metrics, customMetricsResult, usage, diarizedText, analysisConfidence, insufficientContent, assessments, customMeta, customMetricsInvalid, modelName } =
            await this.analyzeTranscription(
                sttResult.text,
                undefined,
                project,
                sttQuality.quality === 'low' ? sttQuality : undefined,
            );

        const finalQuality = combineTranscriptionQuality(sttQuality, {
            analysis_confidence: analysisConfidence,
            insufficient_content: insufficientContent,
        });
        await this.saveQualityOnRecord(record, sttResult, finalQuality);

        if (diarizedText) {
            await record.update({ transcription: diarizedText });
        }

        const totalTokens = usage?.total_tokens || 0;
        const { inTokens: textTokensIn, outTokens: textTokensOut } = this.extractTokenSplit(usage);
        const { totalCost, llmCost, sttCost } = await this.chargeCost(
            record.userId,
            totalTokens,
            sttResult.duration,
            sttResult.provider,
        );

        await record.update({ status: AnalyticsStatus.COMPLETED });

        const mergedMetrics = this.enrichStoredMetrics(
            customMetricsResult ? { ...metrics, custom_metrics: customMetricsResult } : metrics,
            finalQuality,
            { assessments, customMeta, model: modelName, schemaVersion, customInvalid: customMetricsInvalid, promptVersion: PROMPT_VERSION, topics: this.spotTopicKeywords(sttResult.text) },
        );
        const cdrCost = await this.cdrCostFields(totalCost);
        const billingFx = await this.billingFx.fieldsForUsdAmount(totalCost);
        const channelIdStr = String(recordId);

        // Regenerate cost policy: by default keep legacy accumulation (BC); when
        // OPERATOR_REGEN_REPLACE_COST=true, the displayed AiCdr/AiAnalytics aggregate
        // reflects only the latest run instead of silently summing every regenerate.
        // Either way the per-charge BillingRecord history is preserved for audit.
        const replaceCost = this.readBooleanEnv('OPERATOR_REGEN_REPLACE_COST', false);

        const prevCdrAmountCurrency = Number(aiCdr.amountCurrency) || 0;
        await aiCdr.update({
            duration: Math.round(sttResult.duration),
            cost: replaceCost
                ? totalCost
                : parseFloat((Number(aiCdr.cost || 0) + totalCost).toFixed(6)),
            tokens: replaceCost ? totalTokens : (aiCdr.tokens || 0) + totalTokens,
            amountCurrency: replaceCost
                ? Number(cdrCost.amountCurrency || 0)
                : parseFloat((prevCdrAmountCurrency + Number(cdrCost.amountCurrency || 0)).toFixed(4)),
            costCurrency: cdrCost.costCurrency || aiCdr.costCurrency,
        });

        const existingAnalytics = await this.aiAnalyticsRepository.findOne({
            where: { channelId: channelIdStr },
        });
        if (existingAnalytics) {
            await existingAnalytics.update({
                metrics: mergedMetrics,
                summary: metrics.summary || '',
                sentiment: metrics.customer_sentiment || '',
                csat: metrics.csat || null,
                cost: replaceCost
                    ? totalCost
                    : parseFloat((Number(existingAnalytics.cost || 0) + totalCost).toFixed(6)),
                tokens: replaceCost ? totalTokens : (existingAnalytics.tokens || 0) + totalTokens,
            });
        } else {
            await this.aiAnalyticsRepository.create({
                channelId: channelIdStr,
                metrics: mergedMetrics,
                summary: metrics.summary || '',
                sentiment: metrics.customer_sentiment || '',
                csat: metrics.csat || null,
                cost: totalCost,
                tokens: totalTokens,
            });
        }
        await this.writeMetricValues(channelIdStr, record.userId, record.projectId, schemaVersion, mergedMetrics);

        await this.billingRecordRepository.create({
            channelId: channelIdStr,
            type: 'analytic_regen',
            userId: record.userId,
            description: 'File analysis (regenerated)',
            totalTokens,
            textTokens: totalTokens,
            textTokensIn,
            textTokensOut,
            audioTokens: 0,
            totalCost,
            sttCost,
            textCost: llmCost,
            ...billingFx,
        });
        await this.checkProjectBudget(project, record.userId);

        this.logger.log(
            `Analysis regenerated for record #${recordId}, added cost=${totalCost} (llm=${llmCost}, stt=${sttCost})`,
        );

        if (project) {
            this.callWebhook(project, 'analysis.completed', {
                recordId,
                filename: record.filename,
                metrics,
                customMetrics: customMetricsResult,
                regenerated: true,
            }).catch(err => this.logger.warn(`Webhook error: ${err.message}`));
        }

        return aiCdr.reload({
            include: [
                { model: AiAnalytics, as: 'analytics' },
                { model: BillingRecord, as: 'billingRecords' },
            ],
        });
        } catch (e) {
            const invalidAnalysis = e instanceof AnalysisSchemaValidationError;
            const errorMessage = invalidAnalysis
                ? `Invalid LLM analysis output: ${e.message}`
                : e.message;
            await record.update({ status: AnalyticsStatus.ERROR, errorMessage });
            throw e;
        }
    }

    // ─── Read Endpoints ──────────────────────────────────────────────

    async getById(id: number, userId?: string, projectId?: number): Promise<AiCdr> {
        const where: any = { channelId: String(id) };
        if (userId) where.userId = userId;
        // Project-scoped API tokens may only read records of their project (least privilege)
        if (projectId != null) where.projectId = projectId;

        const record = await this.aiCdrRepository.findOne({
            where,
            include: [
                { model: AiAnalytics, as: 'analytics' },
                { model: BillingRecord, as: 'billingRecords' }
            ]
        });
        if (!record) {
            throw new HttpException('Analysis not found', HttpStatus.NOT_FOUND);
        }
        // Compliance: audit every full-record (transcript) read.
        this.logTranscriptAccess(userId, id, 'read');
        return record;
    }

    /**
     * Structured access audit for PII reads (transcript/recording).
     * Emitted as a JSON log line so it can be shipped to a SIEM without a new table.
     */
    private logTranscriptAccess(actorUserId: string | undefined, recordId: number, action: 'read'): void {
        try {
            this.logger.log(`AUDIT ${JSON.stringify({
                kind: 'operator_transcript_access',
                action,
                recordId,
                actorUserId: actorUserId ?? null,
                at: new Date().toISOString(),
            })}`);
        } catch {
            // never let audit logging break the read path
        }
    }

    // ─── Human-in-the-loop metric overrides ──────────────────────────
    // Supervisor corrections stored SEPARATELY from LLM values (calibration set).

    private async assertRecordAccess(channelId: string, userId?: string, isAdmin?: boolean): Promise<AiCdr> {
        const where: any = { channelId: String(channelId) };
        if (!isAdmin && userId) where.userId = String(userId);
        const record = await this.aiCdrRepository.findOne({ where });
        if (!record) {
            throw new HttpException('Analysis not found', HttpStatus.NOT_FOUND);
        }
        return record;
    }

    async getMetricOverrides(channelId: string, userId?: string, isAdmin?: boolean): Promise<MetricOverride[]> {
        await this.assertRecordAccess(channelId, userId, isAdmin);
        return this.metricOverrideRepository.findAll({
            where: { channelId: String(channelId) },
            order: [['metricId', 'ASC']],
        });
    }

    async saveMetricOverrides(
        channelId: string,
        actorUserId: string,
        isAdmin: boolean,
        overrides: Array<{
            metricId: string;
            origin?: MetricOverrideOrigin;
            numValue?: number | null;
            boolValue?: boolean | null;
            strValue?: string | null;
            note?: string | null;
        }>,
    ): Promise<MetricOverride[]> {
        const record = await this.assertRecordAccess(channelId, actorUserId, isAdmin);
        const ownerUserId = String(record.userId);

        if (!Array.isArray(overrides) || overrides.length === 0) {
            throw new HttpException('No overrides provided', HttpStatus.BAD_REQUEST);
        }

        for (const o of overrides) {
            if (!o || typeof o.metricId !== 'string' || !o.metricId) {
                throw new HttpException('Each override requires a metricId', HttpStatus.BAD_REQUEST);
            }
            const payload = {
                channelId: String(channelId),
                userId: ownerUserId,
                actorUserId: String(actorUserId),
                metricId: o.metricId,
                origin: (o.origin || 'default') as MetricOverrideOrigin,
                numValue: o.numValue ?? null,
                boolValue: o.boolValue ?? null,
                strValue: o.strValue ?? null,
                note: o.note ?? null,
            };
            const existing = await this.metricOverrideRepository.findOne({
                where: { channelId: String(channelId), metricId: o.metricId },
            });
            if (existing) {
                await existing.update(payload);
            } else {
                await this.metricOverrideRepository.create(payload as any);
            }
        }

        this.logger.log(`AUDIT ${JSON.stringify({
            kind: 'operator_metric_override',
            channelId: String(channelId),
            actorUserId: String(actorUserId),
            metrics: overrides.map(o => o.metricId),
            at: new Date().toISOString(),
        })}`);

        return this.metricOverrideRepository.findAll({
            where: { channelId: String(channelId) },
            order: [['metricId', 'ASC']],
        });
    }

    async deleteMetricOverride(
        channelId: string,
        metricId: string,
        userId: string,
        isAdmin: boolean,
    ): Promise<{ deleted: number }> {
        await this.assertRecordAccess(channelId, userId, isAdmin);
        const deleted = await this.metricOverrideRepository.destroy({
            where: { channelId: String(channelId), metricId },
        });
        return { deleted };
    }

    async getCdrs(query: {
        userId?: string;
        startDate?: string;
        endDate?: string;
        operatorName?: string;
        projectId?: number;
        page?: number;
        limit?: number;
        search?: string;
        sortField?: string;
        sortOrder?: string;
    }, isAdmin: boolean, realUserId: string) {
        const where: any = {};

        // Access control
        if (!isAdmin) {
            where.userId = realUserId;
        } else if (query.userId) {
            where.userId = query.userId;
        }

        if (query.startDate && query.endDate) {
            where.createdAt = {
                [Op.between]: [
                    new Date(`${query.startDate}T00:00:00`),
                    new Date(`${query.endDate}T23:59:59`),
                ],
            };
        } else if (query.startDate) {
            where.createdAt = { [Op.gte]: new Date(`${query.startDate}T00:00:00`) };
        } else if (query.endDate) {
            where.createdAt = { [Op.lte]: new Date(`${query.endDate}T23:59:59`) };
        }

        if (query.operatorName) {
            where.assistantName = this.likeOp(`%${query.operatorName}%`);
        }

        if (query.projectId) {
            where.projectId = query.projectId;
        }

        // Search logic (name, phone, transcription — additive)
        if (query.search && query.search.trim() !== '') {
            const searchStr = `%${query.search.trim()}%`;
            const searchConditions: any[] = [
                { assistantName: this.likeOp(searchStr) },
                { callerId: this.likeOp(searchStr) },
            ];
            const oaWhere: any = { transcription: this.likeOp(searchStr) };
            if (!isAdmin) oaWhere.userId = realUserId;
            if (query.projectId) oaWhere.projectId = query.projectId;
            const matchingOa = await this.analyticsRepository.findAll({
                where: oaWhere,
                attributes: ['id'],
                limit: 500,
            });
            if (matchingOa.length) {
                searchConditions.push({ channelId: { [Op.in]: matchingOa.map(r => String(r.id)) } });
            }
            where[Op.or] = searchConditions;
        }

        const sortField = query.sortField || 'createdAt';
        const sortOrder = query.sortOrder || 'DESC';
        const orderClause: any[] = [[sortField, sortOrder]];

        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 20;
        const offset = (page - 1) * limit;

        const { rows: data, count: total } = await this.aiCdrRepository.findAndCountAll({
            where,
            order: orderClause,
            limit,
            offset,
            include: [{ model: AiAnalytics, as: 'analytics' }]
        });

        // Attach transcription from operator_analytics records
        const analyticsIds = data.map(d => Number(d.channelId)).filter(id => !isNaN(id));
        const oaRecords = analyticsIds.length > 0
            ? await this.analyticsRepository.findAll({
                where: { id: { [Op.in]: analyticsIds } },
                attributes: [
                    'id', 'transcription', 'transcriptionQuality', 'transcriptionConfidence',
                    'detectedLanguage', 'qualityReasons',
                ],
            })
            : [];
        const oaMap = new Map(oaRecords.map(r => [String(r.id), r]));

        const enrichedData = data.map(row => {
            const json = row.toJSON() as any;
            const oa = oaMap.get(row.channelId);
            json.transcription = oa?.transcription || null;
            json.transcriptionQuality = oa?.transcriptionQuality || json.analytics?.metrics?._quality?.quality || null;
            json.transcriptionConfidence = oa?.transcriptionConfidence ?? json.analytics?.metrics?._quality?.confidence ?? null;
            json.detectedLanguage = oa?.detectedLanguage || null;
            json.qualityReasons = oa?.qualityReasons || json.analytics?.metrics?._quality?.reasons || null;
            return json;
        });

        return { data: enrichedData, total, page, limit };
    }

    async getDashboard(query: {
        userId?: string;
        startDate?: string;
        endDate?: string;
        operatorName?: string;
        projectId?: number;
    }, isAdmin: boolean, realUserId: string) {
        const where = buildDashboardCdrWhere(query, isAdmin, realUserId, (v) => this.likeOp(v));
        const numericKeys = [
            'greeting_quality', 'script_compliance', 'politeness_empathy',
            'active_listening', 'objection_handling', 'product_knowledge',
            'problem_resolution', 'speech_clarity_pace', 'closing_quality',
        ] as const;

        const totalAnalyzed = await this.aiCdrRepository.count({ where });
        if (totalAnalyzed === 0) {
            return {
                totalAnalyzed: 0, totalCost: 0, averageDuration: 0,
                averageScore: 0, successRate: 0,
                aggregatedMetrics: this.emptyAggregatedMetrics(),
                customMetricsAggregated: {},
                sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
                timeSeries: { monthly: [], daily: [] },
                excludedLowQualityCount: 0,
                agentScorecards: [],
            };
        }

        const excludedLowQualityCount = await countLowQualityCdrs(
            this.aiCdrRepository.sequelize,
            query,
            isAdmin,
            realUserId,
        );

        const totalsRow = await this.aiCdrRepository.findOne({
            where,
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('cost')), 'totalCostUsd'],
                [Sequelize.fn('SUM', Sequelize.col('amountCurrency')), 'totalAmountCurrency'],
                [Sequelize.fn('AVG', Sequelize.col('duration')), 'avgDuration'],
            ],
            raw: true,
        }) as { totalCostUsd?: string | number; totalAmountCurrency?: string | number; avgDuration?: string | number } | null;

        const totalCostUsd = Number(totalsRow?.totalCostUsd ?? 0);
        const totalAmountCurrency = isRubTenant()
            ? Number(totalsRow?.totalAmountCurrency ?? 0)
            : null;
        const totalCost = isRubTenant() && totalAmountCurrency != null && totalAmountCurrency > 0
            ? totalAmountCurrency
            : totalCostUsd;

        let sqlAgg = await aggregateMetricsFromSql(
            this.aiCdrRepository.sequelize,
            query,
            isAdmin,
            realUserId,
            excludedLowQualityCount > 0,
        );

        const aggregationRecords = await this.loadDashboardCdrPages(where);
        const eligibleRecords = aggregationRecords.filter(r => {
            const quality = (r.analytics?.metrics as any)?._quality?.quality as TranscriptionQualityLevel | undefined;
            return quality !== 'low' && quality !== 'unusable';
        });
        const recordsForDerived = eligibleRecords.length > 0 ? eligibleRecords : aggregationRecords;
        const aggregationCount = recordsForDerived.length;

        let aggregatedMetrics: Record<string, number>;
        let averageScore: number;
        let successRate: number;
        let sentimentDistribution: { positive: number; neutral: number; negative: number };

        if (sqlAgg.usedSql && sqlAgg.aggregationCount > 0) {
            aggregatedMetrics = { ...sqlAgg.numericAverages };
            averageScore = parseFloat(
                (numericKeys.reduce((s, k) => s + (aggregatedMetrics[k] || 0), 0) / numericKeys.length).toFixed(2),
            );
            const denom = sqlAgg.aggregationCount || 1;
            successRate = parseFloat(((sqlAgg.successCount / denom) * 100).toFixed(2));
            const sentimentTotal = sqlAgg.positiveCount + sqlAgg.neutralCount + sqlAgg.negativeCount || denom;
            sentimentDistribution = {
                positive: parseFloat(((sqlAgg.positiveCount / sentimentTotal) * 100).toFixed(2)),
                neutral: parseFloat(((sqlAgg.neutralCount / sentimentTotal) * 100).toFixed(2)),
                negative: parseFloat(((sqlAgg.negativeCount / sentimentTotal) * 100).toFixed(2)),
            };
        } else {
            const sums: Record<string, number> = {};
            numericKeys.forEach(k => { sums[k] = 0; });
            let successCount = 0;
            let positiveCount = 0;
            let neutralCount = 0;
            let negativeCount = 0;

            recordsForDerived.forEach(r => {
                const m = r.analytics?.metrics;
                if (!m) return;
                numericKeys.forEach(k => { sums[k] += (m[k] || 0); });
                if (m.success) successCount++;
                const sentiment = (r.analytics?.sentiment || '').toLowerCase();
                if (sentiment === 'positive') positiveCount++;
                else if (sentiment === 'neutral') neutralCount++;
                else if (sentiment === 'negative') negativeCount++;
            });

            aggregatedMetrics = {};
            numericKeys.forEach(k => {
                aggregatedMetrics[k] = parseFloat((sums[k] / aggregationCount).toFixed(2));
            });
            averageScore = parseFloat(
                (numericKeys.reduce((s, k) => s + aggregatedMetrics[k], 0) / numericKeys.length).toFixed(2),
            );
            successRate = parseFloat(((successCount / aggregationCount) * 100).toFixed(2));
            sentimentDistribution = {
                positive: parseFloat(((positiveCount / aggregationCount) * 100).toFixed(2)),
                neutral: parseFloat(((neutralCount / aggregationCount) * 100).toFixed(2)),
                negative: parseFloat(((negativeCount / aggregationCount) * 100).toFixed(2)),
            };
        }

        const averageDuration = recordsForDerived.reduce((sum, r) => sum + (r.duration || 0), 0) / aggregationCount;
        const timeSeries = this.buildTimeSeries(recordsForDerived, query.startDate, query.endDate);

        let customMetricsAggregated: Record<string, { type: string; value?: number; distribution?: Record<string, number> }> = {};
        if (query.projectId) {
            const project = await this.projectRepository.findByPk(query.projectId);
            if (project?.customMetricsSchema?.length) {
                customMetricsAggregated = this.aggregateCustomMetrics(recordsForDerived, project.customMetricsSchema);
            }
        }

        const agentScorecards = this.buildAgentScorecards(recordsForDerived);

        return {
            totalAnalyzed,
            totalCost: parseFloat(totalCost.toFixed(isRubTenant() ? 2 : 4)),
            totalAmountCurrency: totalAmountCurrency != null
                ? parseFloat(totalAmountCurrency.toFixed(2))
                : null,
            averageDuration: parseFloat(averageDuration.toFixed(2)),
            averageScore,
            successRate,
            aggregatedMetrics,
            customMetricsAggregated,
            sentimentDistribution,
            timeSeries,
            insightsAvailable: aggregationCount >= 5,
            excludedLowQualityCount,
            agentScorecards,
        };
    }

    /**
     * Marks operator-analytics records stuck in `processing` as ERROR (no extra billing).
     * Enabled when OPERATOR_STUCK_MINUTES > 0.
     */
    async reapStuckProcessing(): Promise<{ enabled: boolean; cutoffMinutes: number; reaped: number }> {
        const cutoffMinutes = this.stuckMinutes;
        if (cutoffMinutes <= 0) {
            return { enabled: false, cutoffMinutes: 0, reaped: 0 };
        }

        const cutoff = new Date(Date.now() - cutoffMinutes * 60 * 1000);
        const [reaped] = await this.analyticsRepository.update(
            {
                status: AnalyticsStatus.ERROR,
                errorMessage: `Processing timeout after ${cutoffMinutes} minutes (automatic cleanup)`,
            },
            {
                where: {
                    status: AnalyticsStatus.PROCESSING,
                    createdAt: { [Op.lt]: cutoff },
                },
            },
        );

        return { enabled: true, cutoffMinutes, reaped };
    }

    /**
     * Scheduled anomaly detection across projects with `anomaly.detected` webhook.
     * Compares the recent window vs the prior baseline window (CSAT drop / negativity spike).
     */
    async checkAnomalies(): Promise<{ enabled: boolean; checked: number; alerted: number }> {
        const enabled = this.readBooleanEnv('OPERATOR_ANOMALY_ENABLED', false);
        if (!enabled) return { enabled: false, checked: 0, alerted: 0 };

        const windowDays = this.readPositiveEnv('OPERATOR_ANOMALY_WINDOW_DAYS', 7);
        const csatDropPct = this.readPositiveEnv('OPERATOR_ANOMALY_CSAT_DROP_PCT', 20);
        const negativeSpikePct = this.readPositiveEnv('OPERATOR_ANOMALY_NEGATIVE_SPIKE_PCT', 15);
        const minCalls = this.readPositiveEnv('OPERATOR_ANOMALY_MIN_CALLS', 5);

        const now = new Date();
        const recentStart = new Date(now);
        recentStart.setUTCDate(recentStart.getUTCDate() - windowDays);
        const baselineEnd = new Date(recentStart);
        const baselineStart = new Date(recentStart);
        baselineStart.setUTCDate(baselineStart.getUTCDate() - windowDays);

        const projects = await this.projectRepository.findAll({
            where: { webhookUrl: { [Op.ne]: null } },
        });

        let alerted = 0;
        for (const project of projects) {
            if (!project.webhookEvents?.includes('anomaly.detected')) continue;

            const recent = await this.computeAnomalyWindowStats(project.id, recentStart, now);
            const baseline = await this.computeAnomalyWindowStats(project.id, baselineStart, baselineEnd);
            if (recent.count < minCalls || baseline.count < minCalls) continue;

            const csatDrop = baseline.avgCsat != null && recent.avgCsat != null
                ? ((baseline.avgCsat - recent.avgCsat) / baseline.avgCsat) * 100
                : null;
            const negativeSpike = recent.negativeRate - baseline.negativeRate;

            const csatTriggered = csatDrop != null && csatDrop >= csatDropPct;
            const negativeTriggered = negativeSpike >= negativeSpikePct;
            if (!csatTriggered && !negativeTriggered) continue;

            const last = project.anomalyLastAlertAt ? new Date(project.anomalyLastAlertAt) : null;
            if (last && last >= recentStart) continue;

            await project.update({ anomalyLastAlertAt: now });
            alerted++;

            const payload = {
                projectId: project.id,
                projectName: project.name,
                windowDays,
                recent,
                baseline,
                triggers: {
                    csatDrop: csatTriggered ? parseFloat((csatDrop as number).toFixed(2)) : null,
                    negativeSpike: negativeTriggered ? parseFloat(negativeSpike.toFixed(2)) : null,
                },
            };
            this.logger.warn(`Anomaly detected for project #${project.id}: ${JSON.stringify(payload.triggers)}`);
            await this.callWebhook(project, 'anomaly.detected', payload).catch(() => { });
        }

        return { enabled: true, checked: projects.length, alerted };
    }

    private async computeAnomalyWindowStats(
        projectId: number,
        from: Date,
        to: Date,
    ): Promise<{ count: number; avgCsat: number | null; negativeRate: number }> {
        const records = await this.aiCdrRepository.findAll({
            where: {
                projectId,
                createdAt: { [Op.gte]: from, [Op.lt]: to },
            },
            include: [{ model: AiAnalytics, as: 'analytics' }],
        });

        let csatSum = 0;
        let csatCount = 0;
        let negativeCount = 0;
        for (const r of records) {
            const m = r.analytics?.metrics as any;
            const quality = m?._quality?.quality as TranscriptionQualityLevel | undefined;
            if (quality === 'low' || quality === 'unusable') continue;

            const csat = r.analytics?.csat ?? m?.csat;
            if (typeof csat === 'number') {
                csatSum += csat;
                csatCount++;
            }
            const sentiment = (r.analytics?.sentiment || m?.customer_sentiment || '').toLowerCase();
            if (sentiment === 'negative') negativeCount++;
        }

        const eligible = records.length || 1;
        return {
            count: records.length,
            avgCsat: csatCount ? parseFloat((csatSum / csatCount).toFixed(2)) : null,
            negativeRate: parseFloat(((negativeCount / eligible) * 100).toFixed(2)),
        };
    }

    private buildAgentScorecards(records: AiCdr[]): Array<{
        operatorName: string;
        callsCount: number;
        averageScore: number;
        successRate: number;
        avgCsat: number | null;
        negativeRate: number;
    }> {
        const numericKeys = [
            'greeting_quality', 'script_compliance', 'politeness_empathy',
            'active_listening', 'objection_handling', 'product_knowledge',
            'problem_resolution', 'speech_clarity_pace', 'closing_quality',
        ];
        const byOperator = new Map<string, AiCdr[]>();
        for (const r of records) {
            const name = (r.assistantName || '').trim() || 'Unknown Operator';
            if (!byOperator.has(name)) byOperator.set(name, []);
            byOperator.get(name)!.push(r);
        }

        const scorecards = Array.from(byOperator.entries()).map(([operatorName, rows]) => {
            const sums: Record<string, number> = {};
            numericKeys.forEach(k => { sums[k] = 0; });
            let successCount = 0;
            let negativeCount = 0;
            let csatSum = 0;
            let csatCount = 0;
            let scored = 0;

            for (const r of rows) {
                const m = r.analytics?.metrics;
                if (!m) continue;
                scored++;
                numericKeys.forEach(k => { sums[k] += (m[k] || 0); });
                if (m.success) successCount++;
                const sentiment = (r.analytics?.sentiment || m.customer_sentiment || '').toLowerCase();
                if (sentiment === 'negative') negativeCount++;
                const csat = r.analytics?.csat ?? m.csat;
                if (typeof csat === 'number') {
                    csatSum += csat;
                    csatCount++;
                }
            }

            const denom = scored || 1;
            const aggregated = numericKeys.reduce((s, k) => s + (sums[k] / denom), 0) / numericKeys.length;
            return {
                operatorName,
                callsCount: rows.length,
                averageScore: parseFloat(aggregated.toFixed(2)),
                successRate: parseFloat(((successCount / denom) * 100).toFixed(2)),
                avgCsat: csatCount ? parseFloat((csatSum / csatCount).toFixed(2)) : null,
                negativeRate: parseFloat(((negativeCount / denom) * 100).toFixed(2)),
            };
        });

        return scorecards.sort((a, b) => b.callsCount - a.callsCount);
    }

    private spotTopicKeywords(transcription: string): string[] | null {
        const hits = spotKeywords(transcription, this.keywordSpottingList);
        return hits.length ? hits : null;
    }

    // ─── Projects ────────────────────────────────────────────────────

    async getProjects(userId: string, isAdmin: boolean) {
        // // Ensure default project exists for this user
        // if (!isAdmin) {
        //     await this.resolveDefaultProject(userId);
        // }

        const where = isAdmin ? {} : { userId };
        const projects = await this.projectRepository.findAll({
            where,
            order: [['createdAt', 'DESC']],
        });

        return projects;
    }

    async createProject(
        userId: string,
        data: {
            name: string;
            description?: string;
            templateId?: string;
            systemPrompt?: string;
            customMetricsSchema?: MetricDefinition[];
            visibleDefaultMetrics?: string[];
            webhookUrl?: string;
            webhookEvents?: string[];
            webhookHeaders?: Record<string, string>;
            monthlyBudgetUsd?: number | null;
            budgetAlertEmails?: string[] | null;
        },
    ): Promise<OperatorProject> {
        if (!data.name?.trim()) {
            throw new HttpException('Project name is required', HttpStatus.BAD_REQUEST);
        }

        const createData: any = { name: data.name.trim(), description: data.description, userId };

        // Apply template as a base if provided
        if (data.templateId) {
            const template = PROJECT_TEMPLATES.find(t => t.id === data.templateId);
            if (template) {
                createData.systemPrompt = template.systemPrompt;
                createData.customMetricsSchema = template.customMetricsSchema;
                createData.visibleDefaultMetrics = template.visibleDefaultMetrics;
            }
        }

        // Explicit body values override template values
        if (data.systemPrompt !== undefined) createData.systemPrompt = data.systemPrompt || null;
        if (data.customMetricsSchema !== undefined) createData.customMetricsSchema = data.customMetricsSchema;
        if (data.visibleDefaultMetrics !== undefined) createData.visibleDefaultMetrics = data.visibleDefaultMetrics;
        if (data.webhookUrl !== undefined) createData.webhookUrl = data.webhookUrl || null;
        if (data.webhookEvents !== undefined) createData.webhookEvents = data.webhookEvents;
        if (data.webhookHeaders !== undefined) createData.webhookHeaders = data.webhookHeaders;
        if (data.monthlyBudgetUsd !== undefined) createData.monthlyBudgetUsd = this.normalizeBudget(data.monthlyBudgetUsd);
        if (data.budgetAlertEmails !== undefined) createData.budgetAlertEmails = data.budgetAlertEmails;

        return this.projectRepository.create(createData);
    }

    async updateProject(
        id: number,
        userId: string,
        data: {
            name?: string;
            description?: string;
            systemPrompt?: string;
            customMetricsSchema?: MetricDefinition[];
            visibleDefaultMetrics?: string[];
            webhookUrl?: string;
            webhookEvents?: string[];
            webhookHeaders?: Record<string, string>;
            monthlyBudgetUsd?: number | null;
            budgetAlertEmails?: string[] | null;
        },
    ): Promise<OperatorProject> {
        const project = await this.projectRepository.findOne({ where: { id, userId } });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);
        if (project.isDefault && data.name !== undefined) {
            throw new HttpException('Cannot rename default project', HttpStatus.BAD_REQUEST);
        }
        if (data.name !== undefined) project.name = data.name.trim();
        if (data.description !== undefined) project.description = data.description;
        if (data.systemPrompt !== undefined) project.systemPrompt = data.systemPrompt || null;
        if (data.customMetricsSchema !== undefined) {
            project.customMetricsSchema = data.customMetricsSchema;
            project.currentSchemaVersion = (project.currentSchemaVersion || 1) + 1;
        }
        if (data.visibleDefaultMetrics !== undefined) project.visibleDefaultMetrics = data.visibleDefaultMetrics as DefaultMetricKey[];
        if (data.webhookUrl !== undefined) project.webhookUrl = data.webhookUrl || null;
        if (data.webhookEvents !== undefined) project.webhookEvents = data.webhookEvents as WebhookEvent[];
        if (data.webhookHeaders !== undefined) project.webhookHeaders = data.webhookHeaders;
        if (data.monthlyBudgetUsd !== undefined) {
            const next = this.normalizeBudget(data.monthlyBudgetUsd);
            // Re-arm alerting when the budget changes so a new limit can fire this month.
            if (next !== project.monthlyBudgetUsd) project.budgetLastAlertAt = null;
            project.monthlyBudgetUsd = next;
        }
        if (data.budgetAlertEmails !== undefined) project.budgetAlertEmails = data.budgetAlertEmails;
        await project.save();
        return project;
    }

    /** Coerce a budget input to a positive number, or null to disable. */
    private normalizeBudget(value: number | null | undefined): number | null {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    async deleteProject(id: number, userId: string, isAdmin = false) {
        const where: any = { id };
        if (!isAdmin) where.userId = userId;
        const project = await this.projectRepository.findOne({ where });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);
        if (project.isDefault && !isAdmin) {
            throw new HttpException('Cannot delete default project', HttpStatus.BAD_REQUEST);
        }
        await project.destroy();
        return { success: true };
    }

    // ─── Default Project ─────────────────────────────────────────────

    async resolveDefaultProject(userId: string): Promise<OperatorProject> {
        let defaultProject = await this.projectRepository.findOne({
            where: { userId, isDefault: true },
        });

        if (!defaultProject) {
            defaultProject = await this.projectRepository.create({
                name: 'Default',
                description: 'Auto-created default project',
                userId,
                isDefault: true,
            });
            this.logger.log(`Created default project for user ${userId}`);

            // Migrate orphaned records
            await this.migrateOrphanedRecords(userId, defaultProject.id);
        }

        return defaultProject;
    }

    private async migrateOrphanedRecords(userId: string, defaultProjectId: number): Promise<void> {
        const [affectedCount] = await this.aiCdrRepository.update(
            { projectId: defaultProjectId },
            { where: { userId: String(userId), projectId: null } },
        );
        if (affectedCount > 0) {
            this.logger.log(`Migrated ${affectedCount} orphaned records to default project ${defaultProjectId} for user ${userId}`);
        }
    }



    // ─── Schema Management ───────────────────────────────────────────

    async generateMetricsSchema(
        messages: { role: string; content: string }[],
        systemPrompt?: string,
    ): Promise<MetricDefinition[]> {
        const llmMessages: any[] = [
            {
                role: 'system',
                content: `You are a call center analytics expert. Based on the business context provided in the conversation, generate a list of custom metrics for call quality evaluation.

Return a JSON object with a "metrics" array. Each metric must have:
- "id": snake_case identifier
- "name": human-readable name (in the same language as the conversation)
- "type": one of "boolean", "number", "enum", "string"
- "description": clear instruction for LLM evaluator (in the same language as the conversation, max 200 chars)
- "enumValues": array of strings (only if type is "enum")

Generate 3-6 metrics most relevant to the described business. Focus on actionable, measurable aspects.
${systemPrompt ? `\nBusiness context: ${systemPrompt}` : ''}`,
            },
            ...messages.map(m => ({ role: m.role === 'ai' ? 'assistant' : m.role, content: m.content || (m as any).text || '' })),
            {
                role: 'user',
                content: 'Based on our conversation, generate the custom metrics schema. Return only valid JSON.',
            },
        ];

        const result = await this.chatWithFallback(llmMessages);
        const parsed = JSON.parse(this.sanitizeJsonResponse(result.content));
        return parsed.metrics || [];
    }


    // ─── Project Dashboard ───────────────────────────────────────────

    async getProjectDashboard(
        projectId: number,
        userId: string,
        isAdmin: boolean,
        query: { startDate?: string; endDate?: string; operatorName?: string },
    ) {
        const project = await this.projectRepository.findOne({
            where: isAdmin ? { id: projectId } : { id: projectId, userId },
        });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);

        // Reuse existing getDashboard with forced projectId
        const dashboard = await this.getDashboard(
            { ...query, projectId },
            isAdmin,
            userId,
        );

        return {
            ...dashboard,
            project: {
                id: project.id,
                name: project.name,
                dashboardConfig: project.dashboardConfig,
                visibleDefaultMetrics: project.visibleDefaultMetrics,
                customMetricsSchema: project.customMetricsSchema,
            },
        };
    }

    // ─── Preview Metric ──────────────────────────────────────────────

    async previewMetric(
        projectId: number,
        userId: string,
        metricDef: MetricDefinition,
    ): Promise<{ metricId: string; result: any; explanation: string }> {
        const project = await this.projectRepository.findOne({ where: { id: projectId, userId } });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);

        const mockTranscription = `Оператор: Добрый день! Компания "Тест", меня зовут Анна, чем могу помочь?
Клиент: Здравствуйте, я хотел бы узнать о ваших услугах.
Оператор: Конечно! Расскажите, что именно вас интересует?
Клиент: Меня интересует подключение нового тарифа.
Оператор: Отлично, у нас есть несколько вариантов. Давайте подберём оптимальный для ваших нужд.
Клиент: Хорошо, какие есть варианты?
Оператор: Есть базовый за 500 рублей и премиум за 1200. Премиум включает дополнительные возможности. Рекомендую попробовать премиум — многие клиенты довольны.
Клиент: Спасибо, я подумаю.
Оператор: Конечно! Я могу перезвонить вам завтра, чтобы уточнить решение. Хорошего дня!`;

        const prompt = `Analyze this call transcription and evaluate ONLY this specific metric:

Metric: "${metricDef.name}" (id: ${metricDef.id})
Type: ${metricDef.type}
Description: ${metricDef.description}
${metricDef.enumValues ? `Possible values: ${metricDef.enumValues.join(', ')}` : ''}
${project.systemPrompt ? `Business context: ${project.systemPrompt}` : ''}

TRANSCRIPTION:
${mockTranscription}

Return JSON: { "result": <value>, "explanation": "<brief explanation in the conversation language>" }`;

        const result = await this.chatWithFallback([
            { role: 'system', content: 'You are a call center quality analysis system. Respond only in JSON format.' },
            { role: 'user', content: prompt },
        ]);
        const parsed = JSON.parse(this.sanitizeJsonResponse(result.content));

        return {
            metricId: metricDef.id,
            result: parsed.result,
            explanation: parsed.explanation || '',
        };
    }

    // ─── AI Insights ─────────────────────────────────────────────────

    private insightsCache: Map<string, { data: any; expiry: number }> = new Map();
    private readonly INSIGHTS_TTL = 60 * 60 * 1000; // 1 hour

    async getProjectInsights(
        projectId: number,
        userId: string,
        isAdmin: boolean,
        query: { startDate?: string; endDate?: string },
    ): Promise<{ insights: string[]; generatedAt: string }> {
        const cacheKey = `${projectId}:${query.startDate || ''}:${query.endDate || ''}`;
        const cached = this.insightsCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return cached.data;
        }

        const project = await this.projectRepository.findOne({
            where: isAdmin ? { id: projectId } : { id: projectId, userId },
        });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);

        const dashboard = await this.getDashboard(
            { ...query, projectId },
            isAdmin,
            userId,
        );

        if (dashboard.totalAnalyzed === 0) {
            return { insights: [], generatedAt: new Date().toISOString() };
        }

        const prompt = `You are a call center analytics expert. Based on the following aggregated data, generate 3-5 actionable insights.

Project: ${project.name}
${project.systemPrompt ? `Business context: ${project.systemPrompt}` : ''}
Period: ${query.startDate || 'all time'} — ${query.endDate || 'now'}

Data:
- Total calls analyzed: ${dashboard.totalAnalyzed}
- Average score: ${dashboard.averageScore}
- Success rate: ${dashboard.successRate}%
- Sentiment: ${JSON.stringify(dashboard.sentimentDistribution)}
- Metrics breakdown: ${JSON.stringify(dashboard.aggregatedMetrics)}

Return JSON: { "insights": ["insight1", "insight2", ...] }
Write insights in Russian. Be specific and actionable.`;

        const llmResult = await this.chatWithFallback([
            { role: 'system', content: 'You are a call center analytics AI. Respond only in JSON.' },
            { role: 'user', content: prompt },
        ]);
        const parsed = JSON.parse(this.sanitizeJsonResponse(llmResult.content));

        // Charge for insight generation
        const totalTokens = llmResult.usage?.total_tokens || 0;
        await this.chargeInsightCost(userId, totalTokens, `Project insight: ${project.name}`);

        const result = {
            insights: parsed.insights || [],
            generatedAt: new Date().toISOString(),
        };

        this.insightsCache.set(cacheKey, { data: result, expiry: Date.now() + this.INSIGHTS_TTL });
        return result;
    }

    /**
     * Get AI Insights without requiring a project.
     * Works with the same filters as getDashboard().
     * If projectId is provided, uses project's systemPrompt as business context.
     */
    async getInsights(
        query: {
            userId?: string;
            startDate?: string;
            endDate?: string;
            operatorName?: string;
            projectId?: number;
        },
        isAdmin: boolean,
        userId: string,
    ): Promise<{ insights: string[]; generatedAt: string }> {
        const cacheKey = `insights:${userId}:${query.projectId || 'all'}:${query.startDate || ''}:${query.endDate || ''}:${query.operatorName || ''}`;
        const cached = this.insightsCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return cached.data;
        }

        const dashboard = await this.getDashboard(query, isAdmin, userId);

        if (dashboard.totalAnalyzed < 5) {
            return { insights: [], generatedAt: new Date().toISOString() };
        }

        // Optionally load project context
        let projectContext = '';
        if (query.projectId) {
            const project = await this.projectRepository.findByPk(query.projectId);
            if (project) {
                projectContext = `\nProject: ${project.name}`;
                if (project.systemPrompt) {
                    projectContext += `\nBusiness context: ${project.systemPrompt}`;
                }
            }
        }

        const prompt = `You are a call center analytics expert. Based on the following aggregated data, generate 3-5 actionable insights.
${projectContext}
Period: ${query.startDate || 'all time'} — ${query.endDate || 'now'}

Data:
- Total calls analyzed: ${dashboard.totalAnalyzed}
- Average score: ${dashboard.averageScore}
- Success rate: ${dashboard.successRate}%
- Average call duration: ${dashboard.averageDuration}s
- Sentiment: ${JSON.stringify(dashboard.sentimentDistribution)}
- Metrics breakdown: ${JSON.stringify(dashboard.aggregatedMetrics)}

Return JSON: { "insights": ["insight1", "insight2", ...] }
Write insights in Russian. Be specific and actionable.`;

        const completion = await this.openAiClient.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a call center analytics AI. Respond only in JSON.' },
                { role: 'user', content: prompt },
            ],
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(this.sanitizeJsonResponse(content));

        // Charge for insight generation
        const totalTokens = completion.usage?.total_tokens || 0;
        await this.chargeInsightCost(userId, totalTokens, 'Dashboard insight');

        const result = {
            insights: parsed.insights || [],
            generatedAt: new Date().toISOString(),
        };

        this.insightsCache.set(cacheKey, { data: result, expiry: Date.now() + this.INSIGHTS_TTL });
        return result;
    }

    private async cdrCostFields(totalCostUsd: number) {
        const snap = await this.billingFx.captureSnapshot(totalCostUsd);
        return {
            cost: totalCostUsd,
            costCurrency: snap.currency,
            amountCurrency: snap.amountCurrency,
        };
    }

    /**
     * Charge user for insight generation using price.analytic rate.
     * Creates a BillingRecord and decrements user balance.
     */
    private async chargeInsightCost(userId: string, totalTokens: number, description: string): Promise<void> {
        if (totalTokens <= 0) return;

        const price = await this.pricesRepository.findOne({ where: { userId: Number(userId) } });
        if (!price || !price.analytic) {
            this.logger.warn(`Price not found for userId: ${userId}, skipping insight billing`);
            return;
        }

        const cost = parseFloat((totalTokens * (price.analytic / 1_000_000)).toFixed(6));

        if (cost > 0) {
            const billingFx = await this.billingFx.fieldsForUsdAmount(cost);
            const rec = await this.billingRecordRepository.create({
                channelId: `insight-${Date.now()}`,
                type: 'insight',
                userId: String(userId),
                description,
                textTokens: totalTokens,
                totalTokens,
                textCost: cost,
                totalCost: cost,
                ...billingFx,
            });

            await this.usersService.decrementUserBalance(userId, cost, {
                source: 'usage_analytics',
                externalId: `usage_insight_${rec.id}`,
            });

            this.logger.log(`Insight charged userId=${userId}: tokens=${totalTokens}, cost=${cost}, desc="${description}"`);
        }
    }

    // ─── Webhook ─────────────────────────────────────────────────────

    private monthStartUtc(d: Date = new Date()): Date {
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    }

    /**
     * Per-project monthly budget guard. Mirrors the balance-threshold-alert pattern
     * (threshold crossing + dedupe via a "last alerted" timestamp), scoped to a project.
     * Disabled unless the project has a positive `monthlyBudgetUsd` (BC-safe default).
     * Best-effort: never throws into the analysis pipeline.
     */
    private async checkProjectBudget(project: OperatorProject | null | undefined, userId: string): Promise<void> {
        try {
            const budget = project?.monthlyBudgetUsd;
            if (!project || budget == null || !(budget > 0)) return;

            const monthStart = this.monthStartUtc();
            const spentRaw = await this.aiCdrRepository.sum('cost', {
                where: { projectId: project.id, createdAt: { [Op.gte]: monthStart } },
            });
            const spent = Number(spentRaw) || 0;
            if (spent < budget) return;

            // Dedupe: at most one alert per calendar month.
            const last = project.budgetLastAlertAt ? new Date(project.budgetLastAlertAt) : null;
            if (last && last >= monthStart) return;

            await project.update({ budgetLastAlertAt: new Date() });

            const month = monthStart.toISOString().slice(0, 7);
            this.logger.warn(
                `Project budget exceeded: project #${project.id} "${project.name}" ` +
                `spent=${spent.toFixed(4)} USD >= budget=${budget} USD (month ${month}, user ${userId})`,
            );
            await this.callWebhook(project, 'budget.exceeded', {
                projectId: project.id,
                projectName: project.name,
                monthlyBudgetUsd: budget,
                spentUsd: parseFloat(spent.toFixed(6)),
                month,
                alertEmails: project.budgetAlertEmails || [],
            }).catch(() => { });
        } catch (e) {
            this.logger.warn(`Budget check failed for project #${project?.id}: ${(e as Error).message}`);
        }
    }

    async callWebhook(
        project: OperatorProject,
        event: WebhookEvent,
        payload: any,
    ): Promise<void> {
        if (!project.webhookUrl || !project.webhookEvents?.includes(event)) {
            return;
        }

        const body = {
            event,
            projectId: project.id,
            timestamp: new Date().toISOString(),
            data: payload,
        };

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await axios.post(project.webhookUrl, body, {
                    timeout: 10_000,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(project.webhookHeaders || {}),
                    },
                });
                this.logger.log(`Webhook delivered: ${event} → ${project.webhookUrl}`);
                return;
            } catch (err) {
                this.logger.warn(`Webhook attempt ${attempt}/${maxRetries} failed for ${project.webhookUrl}: ${err.message}`);
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, attempt * 1000));
                }
            }
        }
        this.logger.error(`Webhook delivery failed after ${maxRetries} retries: ${project.webhookUrl}`);
    }

    // ─── Bulk Move CDRs ──────────────────────────────────────────────

    async bulkMoveCdrs(
        userId: string,
        ids: number[],
        targetProjectId: number,
    ): Promise<{ moved: number; skipped: number }> {
        const targetProject = await this.projectRepository.findOne({
            where: { id: targetProjectId, userId },
        });
        if (!targetProject) throw new HttpException('Target project not found', HttpStatus.NOT_FOUND);

        // Find records owned by this user
        const records = await this.aiCdrRepository.findAll({
            where: { id: ids, userId: String(userId) },
            include: [{ model: AiAnalytics, as: 'analytics' }]
        });

        let moved = 0;
        let skipped = 0;

        for (const record of records) {
            // Skip records with custom metrics if target has a different schema
            if (
                record.analytics?.metrics?.custom_metrics &&
                Object.keys(record.analytics.metrics.custom_metrics).length > 0 &&
                targetProject.customMetricsSchema?.length > 0
            ) {
                // Check basic compatibility — custom metric keys should match
                const recordKeys = Object.keys(record.analytics.metrics.custom_metrics);
                const schemaKeys = targetProject.customMetricsSchema.map(m => m.id);
                const compatible = recordKeys.every(k => schemaKeys.includes(k));
                if (!compatible) {
                    skipped++;
                    continue;
                }
            }

            await record.update({ projectId: targetProjectId });
            moved++;
        }

        return { moved, skipped };
    }

    // ─── API Tokens ──────────────────────────────────────────────────

    async generateApiToken(userId: string, name: string, projectId?: number): Promise<{ token: string; id: number; projectId?: number }> {
        const rawToken = `oa_${uuidv4().replace(/-/g, '')}`;

        const record = await this.apiTokenRepository.create({
            token: rawToken,
            userId,
            name: name || 'API Token',
            projectId: projectId || null,
        });

        return { token: rawToken, id: record.id, projectId: record.projectId };
    }

    async getApiTokens(userId: string) {
        const tokens = await this.apiTokenRepository.findAll({
            where: { userId },
            attributes: ['id', 'name', 'isActive', 'lastUsedAt', 'createdAt', 'projectId'],
            order: [['createdAt', 'DESC']],
        });

        // Enrich with projectName
        const projectIds = [...new Set(tokens.map(t => t.projectId).filter(Boolean))];
        let projectMap: Record<number, string> = {};
        if (projectIds.length) {
            const projects = await this.projectRepository.findAll({
                where: { id: projectIds },
                attributes: ['id', 'name'],
            });
            projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
        }

        return tokens.map(t => ({
            id: t.id,
            name: t.name,
            isActive: t.isActive,
            lastUsedAt: t.lastUsedAt,
            createdAt: t.createdAt,
            projectId: t.projectId ?? null,
            projectName: t.projectId ? (projectMap[t.projectId] ?? null) : null,
        }));
    }

    async revokeApiToken(tokenId: number, userId: string) {
        const token = await this.apiTokenRepository.findOne({
            where: { id: tokenId, userId },
        });
        if (!token) throw new HttpException('Token not found', HttpStatus.NOT_FOUND);
        await token.update({ isActive: false });
        return { success: true };
    }

    async deleteApiToken(tokenId: number, userId: string) {
        const token = await this.apiTokenRepository.findOne({
            where: { id: tokenId, userId },
        });
        if (!token) throw new HttpException('Token not found', HttpStatus.NOT_FOUND);
        await token.destroy();
        return { success: true };
    }

    // ─── Data Retention (PII lifecycle) ──────────────────────────────

    /**
     * Apply the configured retention policy to old operator-analytics data.
     *
     * Controlled by env (safe defaults — disabled in prod until enabled):
     *  - OPERATOR_RETENTION_DAYS  (default 0 → disabled, no-op)
     *  - OPERATOR_RETENTION_MODE  ('anonymize' default | 'delete')
     *  - OPERATOR_RETENTION_BATCH (default 500 → bounds load per run)
     *
     * BillingRecord rows are NEVER deleted (financial record); only PII is stripped.
     */
    async applyRetention(): Promise<{
        enabled: boolean;
        mode: 'anonymize' | 'delete';
        cutoff: string | null;
        scanned: number;
        affected: number;
    }> {
        const days = Number(this.configService.get<string>('OPERATOR_RETENTION_DAYS') || process.env.OPERATOR_RETENTION_DAYS || 0);
        const mode = ((this.configService.get<string>('OPERATOR_RETENTION_MODE') || process.env.OPERATOR_RETENTION_MODE || 'anonymize')
            .toLowerCase() === 'delete') ? 'delete' : 'anonymize';
        const batch = this.readPositiveEnv('OPERATOR_RETENTION_BATCH', 500);

        if (!Number.isFinite(days) || days <= 0) {
            return { enabled: false, mode, cutoff: null, scanned: 0, affected: 0 };
        }

        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Only pick rows that still hold PII (so re-runs are cheap and idempotent for anonymize).
        const where: any = { createdAt: { [Op.lt]: cutoff } };
        if (mode === 'anonymize') {
            where[Op.or] = [
                { transcription: { [Op.ne]: null } },
                { clientPhone: { [Op.ne]: null } },
            ];
        }

        const records = await this.analyticsRepository.findAll({
            where,
            attributes: ['id'],
            limit: batch,
            order: [['createdAt', 'ASC']],
        });
        const scanned = records.length;
        if (scanned === 0) {
            return { enabled: true, mode, cutoff: cutoff.toISOString(), scanned: 0, affected: 0 };
        }

        const ids = records.map(r => r.id);
        const channelIds = ids.map(id => String(id));
        let affected = 0;

        if (mode === 'delete') {
            // Cascade: operator_analytics + AiAnalytics + AiCdr + metric_values. Keep BillingRecord (finance).
            await this.aiAnalyticsRepository.destroy({ where: { channelId: { [Op.in]: channelIds } } });
            await this.aiCdrRepository.destroy({ where: { channelId: { [Op.in]: channelIds } } });
            await this.metricValueRepository.destroy({ where: { channelId: { [Op.in]: channelIds } } });
            affected = await this.analyticsRepository.destroy({ where: { id: { [Op.in]: ids } } });
        } else {
            // Anonymize PII in place; keep scores/aggregates and billing intact.
            const [oaCount] = await this.analyticsRepository.update(
                { transcription: null, clientPhone: null },
                { where: { id: { [Op.in]: ids } } },
            );
            await this.aiCdrRepository.update(
                { callerId: null },
                { where: { channelId: { [Op.in]: channelIds } } },
            );
            affected = oaCount;
        }

        this.logger.log(`Retention (${mode}): cutoff=${cutoff.toISOString()} scanned=${scanned} affected=${affected}`);
        return { enabled: true, mode, cutoff: cutoff.toISOString(), scanned, affected };
    }

    // ─── Private Helpers ─────────────────────────────────────────────

    private async loadDashboardCdrPages(where: Record<string, unknown>): Promise<AiCdr[]> {
        const records: AiCdr[] = [];
        let offset = 0;
        for (;;) {
            const page = await this.aiCdrRepository.findAll({
                where,
                include: [{ model: AiAnalytics, as: 'analytics' }],
                order: [['createdAt', 'ASC']],
                limit: DASHBOARD_PAGE_SIZE,
                offset,
            });
            records.push(...page);
            if (page.length < DASHBOARD_PAGE_SIZE) break;
            offset += DASHBOARD_PAGE_SIZE;
        }
        return records;
    }

    private async findCompletedDuplicate(
        userId: string,
        projectId: number,
        audioSha256: string,
        excludeId?: number,
    ): Promise<OperatorAnalytics | null> {
        if (!audioSha256) return null;
        const where: Record<string, unknown> = {
            userId: String(userId),
            projectId,
            audioSha256,
            status: AnalyticsStatus.COMPLETED,
        };
        if (excludeId != null) {
            where.id = { [Op.ne]: excludeId };
        }
        return this.analyticsRepository.findOne({
            where,
            order: [['id', 'DESC']],
        });
    }

    /**
     * Copy a completed analysis onto a new record without STT/LLM/billing (dedup path).
     */
    private async completeFromDuplicate(
        target: OperatorAnalytics,
        source: OperatorAnalytics,
    ): Promise<void> {
        const sourceChannelId = String(source.id);
        const sourceCdr = await this.aiCdrRepository.findOne({
            where: { channelId: sourceChannelId },
            include: [{ model: AiAnalytics, as: 'analytics' }],
        });
        if (!sourceCdr?.analytics) {
            throw new Error(`Dedup source #${source.id} has no CDR/analytics`);
        }

        await target.update({
            status: AnalyticsStatus.COMPLETED,
            transcription: source.transcription,
            duration: source.duration,
            sttProvider: source.sttProvider,
            transcriptionQuality: source.transcriptionQuality,
            transcriptionConfidence: source.transcriptionConfidence,
            detectedLanguage: source.detectedLanguage,
            qualityReasons: source.qualityReasons,
            schemaVersion: source.schemaVersion,
            promptVersion: source.promptVersion,
            audioSha256: source.audioSha256,
            errorMessage: null,
        });

        const channelId = String(target.id);
        const cdrSource = target.source === AnalyticsSource.API
            ? OPERATOR_CDR_SOURCE.EXTERNAL_API
            : OPERATOR_CDR_SOURCE.EXTERNAL_FRONT;
        const assistantName = target.operatorName || source.operatorName || 'Unknown Operator';
        const metrics = sourceCdr.analytics.metrics;

        await this.aiCdrRepository.create({
            channelId,
            projectId: target.projectId,
            duration: sourceCdr.duration ?? Math.round(source.duration || 0),
            userId: target.userId,
            cost: 0,
            amountCurrency: 0,
            tokens: 0,
            assistantName,
            callerId: target.clientPhone || source.clientPhone || '',
            source: cdrSource,
            recordUrl: target.recordUrl || source.recordUrl || '',
        });

        await this.aiAnalyticsRepository.create({
            channelId,
            metrics,
            summary: sourceCdr.analytics.summary || '',
            sentiment: sourceCdr.analytics.sentiment || '',
            csat: sourceCdr.analytics.csat ?? null,
            cost: 0,
            tokens: 0,
        });
        await this.writeMetricValues(
            channelId,
            target.userId,
            target.projectId,
            source.schemaVersion ?? null,
            metrics,
        );

        this.logger.log(`Dedup: record #${target.id} completed from source #${source.id} (no billing)`);

        if (target.projectId) {
            const project = await this.projectRepository.findByPk(target.projectId);
            if (project) {
                this.callWebhook(project, 'analysis.completed', {
                    recordId: target.id,
                    filename: target.filename,
                    deduplicatedFrom: source.id,
                }).catch(err => this.logger.warn(`Webhook error: ${err.message}`));
            }
        }
    }

    private async persistAudioSha256(record: OperatorAnalytics, audioSha256: string): Promise<void> {
        if (!audioSha256) return;
        try {
            await record.update({ audioSha256 });
        } catch (e) {
            this.logger.warn(
                `Could not persist audioSha256 on record #${record.id} ` +
                `(apply migration 2026-06-18-operator-audio-hash): ${(e as Error).message}`,
            );
        }
    }

    private readPositiveEnv(key: string, fallback: number): number {
        const raw = Number(this.configService.get<string>(key) || process.env[key]);
        return Number.isFinite(raw) && raw > 0 ? raw : fallback;
    }

    private readNumericEnv(key: string, fallback: number): number {
        const raw = Number(this.configService.get<string>(key) || process.env[key]);
        return Number.isFinite(raw) ? raw : fallback;
    }

    private readBooleanEnv(key: string, fallback = false): boolean {
        const raw = (this.configService.get<string>(key) ?? process.env[key] ?? '').toString().trim().toLowerCase();
        if (raw === '') return fallback;
        return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
    }

    private assessSttQuality(sttResult: TranscriptionResult): TranscriptionQualityAssessment {
        return assessTranscriptionQuality({
            text: sttResult.text,
            avgLogprob: sttResult.avgLogprob,
            noSpeechProb: sttResult.noSpeechProb,
            compressionRatio: sttResult.compressionRatio,
            languageProbability: sttResult.languageProbability,
            wordsCount: sttResult.wordsCount,
            segmentsCount: sttResult.segmentsCount,
        }, this.qualityThresholds);
    }

    private async saveQualityOnRecord(
        record: OperatorAnalytics,
        sttResult: TranscriptionResult,
        assessment: TranscriptionQualityAssessment,
    ): Promise<void> {
        await record.update({
            transcriptionQuality: assessment.quality,
            transcriptionConfidence: assessment.confidence,
            detectedLanguage: sttResult.language || record.detectedLanguage || null,
            qualityReasons: assessment.reasons,
        });
    }

    private enrichStoredMetrics(
        metrics: Record<string, any>,
        assessment: TranscriptionQualityAssessment,
        extras?: {
            assessments?: Record<string, MetricAssessment> | null;
            model?: string;
            customMeta?: Record<string, StoredMetricMeta> | null;
            schemaVersion?: number | null;
            customInvalid?: string[] | null;
            promptVersion?: string | null;
            topics?: string[] | null;
        },
    ) {
        return {
            ...metrics,
            ...(extras?.assessments ? { _assessments: extras.assessments } : {}),
            ...(extras?.customMeta && Object.keys(extras.customMeta).length
                ? { _custom_meta: extras.customMeta }
                : {}),
            ...(extras?.model || extras?.promptVersion
                ? { _model: { ...(extras?.model ? { name: extras.model } : {}), ...(extras?.promptVersion ? { promptVersion: extras.promptVersion } : {}) } }
                : {}),
            ...(extras?.topics && extras.topics.length ? { _topics: { keywords: extras.topics } } : {}),
            ...(extras?.schemaVersion != null ? { _schema_version: extras.schemaVersion } : {}),
            ...(extras?.customInvalid && extras.customInvalid.length
                ? { _custom_invalid: extras.customInvalid }
                : {}),
            _quality: {
                quality: assessment.quality,
                confidence: assessment.confidence,
                reasons: assessment.reasons,
            },
        };
    }

    /**
     * Persist the project schema version onto the record. Best-effort: the value is
     * also mirrored inside the metrics JSON (`_schema_version`), so a missing DB column
     * (un-applied migration) must not abort the whole analysis.
     */
    private async persistSchemaVersion(record: OperatorAnalytics, schemaVersion: number | null): Promise<void> {
        if (schemaVersion != null) {
            try {
                await record.update({ schemaVersion });
            } catch (e) {
                this.logger.warn(
                    `Could not persist schemaVersion on record #${record.id} ` +
                    `(apply migration 2026-06-18-operator-schema-version): ${(e as Error).message}`,
                );
            }
        }
        // Persisted separately so a missing promptVersion column never blocks schemaVersion.
        try {
            await record.update({ promptVersion: PROMPT_VERSION });
        } catch (e) {
            this.logger.warn(
                `Could not persist promptVersion on record #${record.id} ` +
                `(apply migration 2026-06-18-operator-prompt-version): ${(e as Error).message}`,
            );
        }
    }

    /**
     * Dual-write metric values into the normalized table alongside the JSON blob.
     * Best-effort: never throws (JSON remains the source of truth).
     * Idempotent per channel (clears prior rows first) so regenerate stays consistent.
     */
    private async writeMetricValues(
        channelId: string,
        userId: string | null,
        projectId: number | null,
        schemaVersion: number | null,
        metrics: Record<string, any>,
    ): Promise<void> {
        try {
            const base = {
                channelId,
                userId: userId ?? null,
                projectId: projectId ?? null,
                schemaVersion: schemaVersion ?? null,
            };
            const rows: Array<Record<string, any>> = [];
            const add = (metricId: string, origin: MetricValueOrigin, value: { numValue?: number; boolValue?: boolean; strValue?: string }) =>
                rows.push({ ...base, metricId, origin, numValue: null, boolValue: null, strValue: null, ...value });

            for (const key of ALL_DEFAULT_METRIC_KEYS) {
                const v = metrics[key];
                if (typeof v === 'number') add(key, 'default', { numValue: v });
            }
            if (typeof metrics.csat === 'number') add('csat', 'summary', { numValue: metrics.csat });
            if (typeof metrics.success === 'boolean') add('success', 'summary', { boolValue: metrics.success });
            if (typeof metrics.customer_sentiment === 'string' && metrics.customer_sentiment) {
                add('customer_sentiment', 'summary', { strValue: metrics.customer_sentiment });
            }

            const custom = metrics.custom_metrics;
            if (custom && typeof custom === 'object') {
                for (const [id, raw] of Object.entries(custom)) {
                    if (raw === null || raw === undefined) continue;
                    if (typeof raw === 'boolean') add(id, 'custom', { boolValue: raw });
                    else if (typeof raw === 'number') add(id, 'custom', { numValue: raw });
                    else add(id, 'custom', { strValue: String(raw) });
                }
            }

            await this.metricValueRepository.destroy({ where: { channelId } });
            if (rows.length) {
                await this.metricValueRepository.bulkCreate(rows as any);
            }
        } catch (e) {
            this.logger.warn(`metric_values dual-write failed for channel ${channelId}: ${(e as Error).message}`);
        }
    }

    private isRecordingTooShort(durationSeconds: number): boolean {
        return durationSeconds < this.minAnalysisDurationSec;
    }

    private getTooShortMessage(durationSeconds: number): string {
        const roundedDuration = Math.round(durationSeconds * 10) / 10;
        return `Recording is too short for analysis (minimum ${this.minAnalysisDurationSec} seconds, got ${roundedDuration}s)`;
    }

    private getUnusableMessage(assessment: TranscriptionQualityAssessment, durationSeconds: number): string {
        if (assessment.reasons.includes('INSUFFICIENT_CONTENT') && this.isRecordingTooShort(durationSeconds)) {
            return this.getTooShortMessage(durationSeconds);
        }
        if (assessment.reasons.includes('INSUFFICIENT_CONTENT')) {
            return 'Transcription has insufficient content for reliable analysis';
        }
        return 'Transcription quality is too low for reliable analysis';
    }

    private async rejectIfUnusable(
        record: OperatorAnalytics,
        sttResult: TranscriptionResult & { provider: string },
    ): Promise<boolean> {
        if (this.isRecordingTooShort(sttResult.duration)) {
            const errorMessage = this.getTooShortMessage(sttResult.duration);
            await record.update({
                transcription: sttResult.text,
                duration: sttResult.duration,
                sttProvider: sttResult.provider,
                status: AnalyticsStatus.ERROR,
                errorMessage,
                transcriptionQuality: 'unusable',
                transcriptionConfidence: 0,
                qualityReasons: ['INSUFFICIENT_CONTENT'],
                detectedLanguage: sttResult.language || null,
            });
            this.logger.warn(`Analysis skipped for record #${record.id}: ${errorMessage}`);
            return true;
        }

        const assessment = this.assessSttQuality(sttResult);
        if (assessment.quality !== 'unusable') {
            return false;
        }

        const errorMessage = this.getUnusableMessage(assessment, sttResult.duration);
        await record.update({
            transcription: sttResult.text,
            duration: sttResult.duration,
            sttProvider: sttResult.provider,
            status: AnalyticsStatus.ERROR,
            errorMessage,
            transcriptionQuality: assessment.quality,
            transcriptionConfidence: assessment.confidence,
            qualityReasons: assessment.reasons,
            detectedLanguage: sttResult.language || null,
        });
        this.logger.warn(`Analysis skipped for record #${record.id}: ${errorMessage}`);
        return true;
    }

    private async checkBalance(userId: string): Promise<void> {
        const user = await this.userRepository.findByPk(userId, { attributes: ['balance'] });
        if (!user || user.balance <= 0) {
            throw new HttpException(
                { message: 'Insufficient balance', balance: user?.balance || 0 },
                HttpStatus.PAYMENT_REQUIRED,
            );
        }
    }

    /**
     * Pull the input/output token split out of an LLM usage object.
     * Supports both Chat Completions (prompt_tokens/completion_tokens) and the
     * newer responses shape (input_tokens/output_tokens). Returns null when absent.
     */
    private extractTokenSplit(usage: any): { inTokens: number | null; outTokens: number | null } {
        const inTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? null;
        const outTokens = usage?.completion_tokens ?? usage?.output_tokens ?? null;
        return {
            inTokens: typeof inTokens === 'number' ? inTokens : null,
            outTokens: typeof outTokens === 'number' ? outTokens : null,
        };
    }

    private async chargeCost(
        userId: string,
        totalTokens: number,
        durationSeconds: number = 0,
        sttProvider?: string,
    ): Promise<{ totalCost: number; llmCost: number; sttCost: number }> {
        const price = await this.pricesRepository.findOne({ where: { userId: Number(userId) } });
        if (!price) {
            this.logger.warn(`Price not found for userId: ${userId}, using default rate`);
            return { totalCost: 0, llmCost: 0, sttCost: 0 };
        }

        // LLM cost: tokens × (analytic price per 1M tokens)
        const llmCost = totalTokens > 0 ? parseFloat((totalTokens * ((price.analytic || 0) / 1_000_000)).toFixed(6)) : 0;

        // STT cost: duration in minutes × stt price per minute
        // Local Whisper is free — only charge for external API (OpenAI, external-stt)
        const isLocalStt = sttProvider === 'whisper';
        const durationMinutes = durationSeconds / 60;
        const sttCost = (!isLocalStt && durationMinutes > 0) ? parseFloat((durationMinutes * (price.stt || 0)).toFixed(6)) : 0;

        const totalCost = parseFloat((llmCost + sttCost).toFixed(6));

        this.logger.log(`Billing: LLM=${llmCost} (${totalTokens} tokens) + STT=${sttCost} (${durationMinutes.toFixed(2)} min, provider=${sttProvider || 'unknown'}) = ${totalCost}`);

        if (totalCost > 0) {
            await this.usersService.decrementUserBalance(userId, totalCost, {
                source: 'usage_analytics',
                externalId: `usage_operator_${Date.now()}_${userId}`,
            });
        }

        return { totalCost, llmCost, sttCost };
    }

    private getProvider(providerName?: string): ITranscriptionProvider {
        const name = providerName || 'openai';
        const provider = this.sttProviders.get(name);
        if (!provider) {
            throw new HttpException(`STT provider "${name}" not found`, HttpStatus.BAD_REQUEST);
        }
        return provider;
    }

    private async analyzeTranscription(
        transcription: string,
        customMetricsDef?: CustomMetricDef[],
        project?: OperatorProject,
        qualityHint?: TranscriptionQualityAssessment,
    ): Promise<{
        metrics: OperatorMetrics;
        customMetricsResult: any;
        usage: any;
        diarizedText: string | null;
        analysisConfidence?: number;
        insufficientContent?: boolean;
        assessments?: Record<string, MetricAssessment> | null;
        customMeta?: Record<string, StoredMetricMeta> | null;
        customMetricsInvalid?: string[];
        modelName: string;
    }> {
        const ctx = buildAnalysisContext(project, customMetricsDef);
        const jsonSchema = buildOpenAiJsonSchema(ctx);
        const prompt = buildAnalysisPrompt(transcription, ctx, {
            systemPrompt: project?.systemPrompt,
            qualityHintConfidence: qualityHint?.confidence,
        });

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: 'You are a call center quality analysis system. Respond only in JSON format.' },
            { role: 'user', content: prompt },
        ];

        const requestValidated = async (
            requestMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        ) => {
            const llmResult = await this.chatWithFallback(requestMessages, {
                jsonSchema,
                schemaName: 'operator_analysis',
                temperature: 0,
            });
            const parsed = parseAndValidateAnalysisResponse(
                llmResult.content,
                ctx,
                raw => this.sanitizeJsonResponse(raw),
            );
            return { ...parsed, usage: llmResult.usage, modelName: llmResult.model };
        };

        let parsedResult;
        try {
            parsedResult = await requestValidated(messages);
        } catch (firstErr) {
            if (!(firstErr instanceof AnalysisSchemaValidationError)) {
                throw firstErr;
            }
            this.logger.warn(`[Analytics LLM] Invalid analysis JSON, retrying once: ${firstErr.message}`);
            parsedResult = await requestValidated([
                ...messages,
                {
                    role: 'assistant',
                    content: this.sanitizeJsonResponse(firstErr.rawContent || '{}'),
                },
                {
                    role: 'user',
                    content: 'Your previous JSON was invalid or incomplete. Return ONLY corrected JSON that matches the required schema exactly, including all required fields and per-metric assessments (rationale + quote).',
                },
            ]);
        }

        let diarizedText: string | null = null;
        if (Array.isArray(parsedResult.diarizedRaw) && parsedResult.diarizedRaw.length > 0) {
            diarizedText = JSON.stringify(parsedResult.diarizedRaw);
        } else if (typeof parsedResult.diarizedRaw === 'string' && parsedResult.diarizedRaw.length > 0) {
            diarizedText = parsedResult.diarizedRaw;
        }

        return {
            metrics: parsedResult.metrics as OperatorMetrics,
            customMetricsResult: parsedResult.customMetricsResult,
            usage: parsedResult.usage,
            diarizedText,
            analysisConfidence: parsedResult.analysisConfidence,
            insufficientContent: parsedResult.insufficientContent,
            assessments: parsedResult.assessments,
            customMeta: buildCustomMetricMeta(ctx),
            customMetricsInvalid: parsedResult.customMetricsInvalid,
            modelName: parsedResult.modelName,
        };
    }

    /**
     * Run the analysis LLM over a transcript WITHOUT persisting anything or
     * creating billing records. Used by the offline eval runner (golden set).
     * Note: it still calls the real LLM provider (provider-side tokens), but no
     * internal balance deduction / BillingRecord is created — "dry-run, no charge"
     * from the platform's accounting perspective.
     */
    async dryRunAnalyze(
        transcription: string,
        opts?: { project?: OperatorProject | null; customMetrics?: CustomMetricDef[] },
    ): Promise<{
        metrics: Record<string, any>;
        customMetricsResult: any;
        analysisConfidence?: number;
        insufficientContent?: boolean;
        modelName: string;
        promptVersion: string;
    }> {
        const { metrics, customMetricsResult, analysisConfidence, insufficientContent, modelName } =
            await this.analyzeTranscription(transcription, opts?.customMetrics, opts?.project ?? undefined);
        return {
            metrics,
            customMetricsResult,
            analysisConfidence,
            insufficientContent,
            modelName,
            promptVersion: PROMPT_VERSION,
        };
    }

    private sanitizeJsonResponse(raw: string): string {
        if (!raw) return '{}';
        let cleaned = raw;
        cleaned = cleaned.replace(/^\uFEFF/, '');
        cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        cleaned = cleaned.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
        cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
        return cleaned.trim();
    }

    private extractFilenameFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const name = pathname.split('/').pop() || 'download.mp3';
            return decodeURIComponent(name);
        } catch {
            return 'download.mp3';
        }
    }

    private emptyAggregatedMetrics() {
        return {
            greeting_quality: 0, script_compliance: 0, politeness_empathy: 0,
            active_listening: 0, objection_handling: 0, product_knowledge: 0,
            problem_resolution: 0, speech_clarity_pace: 0, closing_quality: 0,
        };
    }

    private static readonly KNOWN_METRIC_TOP_KEYS = new Set([
        'greeting_quality', 'script_compliance', 'politeness_empathy',
        'active_listening', 'objection_handling', 'product_knowledge',
        'problem_resolution', 'speech_clarity_pace', 'closing_quality',
        'customer_sentiment', 'summary', 'success', 'csat',
    'custom_metrics', 'metrics', '_quality', '_evidence', '_assessments', '_custom_meta', '_model', '_schema_version', '_custom_invalid', '_topics',
]);

    private extractCustomMetrics(metrics: Record<string, any> | null | undefined): Record<string, any> {
        if (!metrics || typeof metrics !== 'object') return {};
        if (metrics.custom_metrics && typeof metrics.custom_metrics === 'object' && !Array.isArray(metrics.custom_metrics)) {
            return metrics.custom_metrics;
        }
        if (metrics.metrics && typeof metrics.metrics === 'object' && !Array.isArray(metrics.metrics)) {
            const nested = metrics.metrics as Record<string, any>;
            if (typeof nested.greeting_quality !== 'number') {
                return nested;
            }
        }
        const legacy: Record<string, any> = {};
        for (const [key, value] of Object.entries(metrics)) {
            if (!OperatorAnalyticsService.KNOWN_METRIC_TOP_KEYS.has(key)) {
                legacy[key] = value;
            }
        }
        return legacy;
    }

    private aggregateCustomMetrics(
        records: AiCdr[],
        schema: MetricDefinition[],
    ): Record<string, { type: MetricDefinition['type']; value?: number; distribution?: Record<string, number> }> {
        const result: Record<string, {
            type: MetricDefinition['type'];
            value?: number;
            distribution?: Record<string, number>;
        }> = {};

        for (const def of schema) {
            const values: any[] = [];
            for (const r of records) {
                const custom = this.extractCustomMetrics(r.analytics?.metrics as Record<string, any>);
                if (custom[def.id] !== undefined && custom[def.id] !== null) {
                    values.push(custom[def.id]);
                }
            }
            if (!values.length) continue;

            if (def.type === 'boolean') {
                const trueCount = values.filter(v => v === true).length;
                result[def.id] = {
                    type: 'boolean',
                    value: parseFloat(((trueCount / values.length) * 100).toFixed(2)),
                };
            } else if (def.type === 'number') {
                const sum = values.reduce((acc, v) => acc + Number(v), 0);
                result[def.id] = {
                    type: 'number',
                    value: parseFloat((sum / values.length).toFixed(2)),
                };
            } else {
                const distribution: Record<string, number> = {};
                for (const v of values) {
                    const key = String(v);
                    distribution[key] = (distribution[key] || 0) + 1;
                }
                result[def.id] = { type: def.type, distribution };
            }
        }

        return result;
    }

    private buildTimeSeries(records: AiCdr[], startDate?: string, endDate?: string) {
        if (!records.length) return { monthly: [], daily: [] };

        const start = startDate ? new Date(startDate) : new Date(records[0].createdAt);
        const end = endDate ? new Date(endDate) : new Date(records[records.length - 1].createdAt);
        const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        const numericKeys = [
            'greeting_quality', 'script_compliance', 'politeness_empathy',
            'active_listening', 'objection_handling', 'product_knowledge',
            'problem_resolution', 'speech_clarity_pace', 'closing_quality',
        ];

        const buildMonthly = daysDiff > 60;
        const dailyGroups: Record<string, { calls: number; totalScore: number; totalDuration: number }> = {};
        const monthlyGroups: Record<string, { calls: number; totalScore: number; totalDuration: number }> = {};

        records.forEach(r => {
            const date = new Date(r.createdAt);
            const dailyLabel = date.toISOString().split('T')[0];

            if (!dailyGroups[dailyLabel]) {
                dailyGroups[dailyLabel] = { calls: 0, totalScore: 0, totalDuration: 0 };
            }
            dailyGroups[dailyLabel].calls++;
            dailyGroups[dailyLabel].totalDuration += r.duration || 0;

            let avg = 0;
            if (r.analytics?.metrics) {
                avg = numericKeys.reduce((s, k) => s + (r.analytics.metrics[k] || 0), 0) / numericKeys.length;
                dailyGroups[dailyLabel].totalScore += avg;
            }

            if (buildMonthly) {
                const monthlyLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyGroups[monthlyLabel]) {
                    monthlyGroups[monthlyLabel] = { calls: 0, totalScore: 0, totalDuration: 0 };
                }
                monthlyGroups[monthlyLabel].calls++;
                monthlyGroups[monthlyLabel].totalDuration += r.duration || 0;
                monthlyGroups[monthlyLabel].totalScore += avg;
            }
        });

        const mapToOutput = (groups: Record<string, any>) => Object.entries(groups).map(([label, g]) => ({
            label,
            callsCount: g.calls,
            avgScore: parseFloat((g.totalScore / g.calls).toFixed(2)),
            avgDuration: parseFloat((g.totalDuration / g.calls).toFixed(2)),
        }));

        const daily = mapToOutput(dailyGroups);
        const monthly = buildMonthly ? mapToOutput(monthlyGroups) : daily;

        return { monthly, daily };
    }
}
