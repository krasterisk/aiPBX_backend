import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OperatorAnalytics, AnalyticsSource, AnalyticsStatus } from './operator-analytics.model';
import { OperatorApiToken } from './operator-api-token.model';
import { OperatorProject } from './operator-project.model';
import { OpenAiTranscriptionProvider } from './providers/openai-transcription.provider';
import { ExternalSttProvider } from './providers/external-stt.provider';
import { Prices } from '../prices/prices.model';
import { UsersService } from '../users/users.service';
import { User } from '../users/users.model';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../ai-analytics/ai-analytics.model';
import { BillingRecord } from '../billing/billing-record.model';
import {
    OperatorMetrics, CustomMetricDef, ITranscriptionProvider, TranscriptionResult,
    MetricDefinition, DefaultMetricKey, WebhookEvent,
} from './interfaces/operator-metrics.interface';
import { PROJECT_TEMPLATES } from './project-templates';
import { Op, Sequelize } from 'sequelize';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

@Injectable()
export class OperatorAnalyticsService {
    private readonly logger = new Logger(OperatorAnalyticsService.name);
    private readonly openAiClient: OpenAI;
    private readonly sttProviders: Map<string, ITranscriptionProvider> = new Map();

    constructor(
        @InjectModel(OperatorAnalytics) private readonly analyticsRepository: typeof OperatorAnalytics,
        @InjectModel(AiCdr) private readonly aiCdrRepository: typeof AiCdr,
        @InjectModel(AiAnalytics) private readonly aiAnalyticsRepository: typeof AiAnalytics,
        @InjectModel(BillingRecord) private readonly billingRecordRepository: typeof BillingRecord,
        @InjectModel(OperatorApiToken) private readonly apiTokenRepository: typeof OperatorApiToken,
        @InjectModel(OperatorProject) private readonly projectRepository: typeof OperatorProject,
        @InjectModel(Prices) private readonly pricesRepository: typeof Prices,
        @InjectModel(User) private readonly userRepository: typeof User,
        private readonly usersService: UsersService,
        private readonly configService: ConfigService,
        private readonly openAiSttProvider: OpenAiTranscriptionProvider,
        private readonly externalSttProvider: ExternalSttProvider,
    ) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
        this.openAiClient = new OpenAI({ apiKey });

        // Register STT providers — 'external' is default, 'openai' is fallback
        this.sttProviders.set('openai', this.openAiSttProvider);
        this.sttProviders.set('external', this.externalSttProvider);
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
        const providerName = preferredProvider || 'openai';
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
        } = {},
    ): Promise<OperatorAnalytics> {
        // 1. Pre-check balance
        await this.checkBalance(userId);

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

            // schemaVersion from project removed
            if (project?.currentSchemaVersion) {
                // not updating record with schemaVersion anymore
            }

            // 3. Transcribe (external first, fallback to OpenAI Whisper)
            const sttResult = await this.transcribeWithFallback(
                buffer,
                filename,
                options.language || 'auto',
                options.provider,
            );

            await record.update({
                transcription: sttResult.text,
                duration: sttResult.duration,
                sttProvider: sttResult.provider,
            });

            // 4. Analyze metrics via LLM (with project context if available)
            const { metrics, customMetricsResult, usage } = await this.analyzeTranscription(
                sttResult.text,
                options.customMetrics,
                project,
            );

            // 5. Calculate cost and charge (LLM tokens + STT duration)
            const totalTokens = usage?.total_tokens || 0;
            const { totalCost, llmCost, sttCost } = await this.chargeCost(userId, totalTokens, sttResult.duration);

            // 6. Save results locally
            await record.update({
                status: AnalyticsStatus.COMPLETED,
            });

            const channelId = record.id.toString();
            const cdrSource = source === AnalyticsSource.API ? 'external-api' : 'external-front';
            const assistantName = options.operatorName || 'Unknown Operator';
            const mergedMetrics = customMetricsResult ? { ...metrics, metrics: customMetricsResult } : metrics;

            await this.aiCdrRepository.create({
                channelId,
                projectId: record.projectId,
                duration: sttResult.duration,
                userId: record.userId,
                cost: totalCost,
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

            await this.billingRecordRepository.create({
                channelId,
                type: 'analytic',
                totalTokens: totalTokens,
                textTokens: totalTokens,
                audioTokens: 0,
                totalCost: totalCost,
                sttCost: sttCost,
                textCost: llmCost,
            });

            this.logger.log(`Analysis completed for "${filename}" (id=${record.id}), cost=${totalCost} (llm=${llmCost}, stt=${sttCost}), tokens=${totalTokens}`);

            // 7. Call webhook if configured
            if (project) {
                this.callWebhook(project, 'analysis.completed', {
                    recordId: record.id, filename, metrics, customMetrics: customMetricsResult,
                }).catch(err => this.logger.warn(`Webhook error: ${err.message}`));
            }

            return record.reload();
        } catch (e) {
            this.logger.error(`Analysis failed for "${filename}" (id=${record.id}): ${e.message}`);
            await record.update({
                status: AnalyticsStatus.ERROR,
                errorMessage: e.message,
            });
            throw e;
        }
    }

    async analyzeUrl(
        url: string,
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
        this.logger.log(`Downloading file from URL: ${url}`);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 120_000, // 2 min
            maxContentLength: 50 * 1024 * 1024, // 50 MB
        });

        const buffer = Buffer.from(response.data);
        const filename = this.extractFilenameFromUrl(url);

        return this.analyzeFile(buffer, filename, userId, AnalyticsSource.API, {
            ...options,
            recordUrl: url,
        });
    }

    async processUrlInBackground(recordId: number, url: string, provider?: string): Promise<void> {
        try {
            this.logger.log(`Background: downloading file from URL: ${url}`);
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 120_000,
                maxContentLength: 50 * 1024 * 1024,
            });
            const buffer = Buffer.from(response.data);
            await this.processInBackground(recordId, buffer, provider);
        } catch (e) {
            this.logger.error(`Background URL download failed for record #${recordId}: ${e.message}`);
            const record = await this.analyticsRepository.findByPk(recordId);
            if (record) {
                await record.update({ status: AnalyticsStatus.ERROR, errorMessage: e.message });

                if (record.projectId) {
                    const project = await this.projectRepository.findByPk(record.projectId);
                    if (project) {
                        this.callWebhook(project, 'analysis.error', {
                            recordId, error: e.message,
                        }).catch(() => { });
                    }
                }
            }
        }
    }

    // ─── Background Processing (Batch) ───────────────────────────────

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
        });
    }

    async processInBackground(recordId: number, buffer: Buffer, provider?: string): Promise<void> {
        try {
            const record = await this.analyticsRepository.findByPk(recordId);
            if (!record) return;

            await this.checkBalance(record.userId);

            // Resolve project
            let project: OperatorProject | null = null;
            if (record.projectId) {
                project = await this.projectRepository.findByPk(record.projectId);
                if (project?.currentSchemaVersion) {
                    // not updating record with schemaVersion anymore
                }
            }

            const sttResult = await this.transcribeWithFallback(
                buffer,
                record.filename,
                record.language || 'auto',
                provider,
            );

            await record.update({ transcription: sttResult.text, duration: sttResult.duration, sttProvider: sttResult.provider });

            const { metrics, customMetricsResult, usage } = await this.analyzeTranscription(
                sttResult.text,
                undefined,
                project,
            );

            const totalTokens = usage?.total_tokens || 0;
            const { totalCost, llmCost, sttCost } = await this.chargeCost(record.userId, totalTokens, sttResult.duration);

            await record.update({
                status: AnalyticsStatus.COMPLETED,
            });

            const channelId = record.id.toString();
            // Source is frontend or api depending on what's set
            const cdrSource = record.source === AnalyticsSource.API ? 'external-api' : 'external-front';
            const assistantName = record.operatorName || 'Unknown Operator';
            const mergedMetrics = customMetricsResult ? { ...metrics, metrics: customMetricsResult } : metrics;

            await this.aiCdrRepository.create({
                channelId,
                projectId: record.projectId,
                duration: sttResult.duration,
                userId: record.userId,
                cost: totalCost,
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

            await this.billingRecordRepository.create({
                channelId,
                type: 'analytic',
                totalTokens: totalTokens,
                textTokens: totalTokens,
                audioTokens: 0,
                totalCost: totalCost,
                sttCost: sttCost,
                textCost: llmCost,
            });

            this.logger.log(`Background analysis completed for record #${recordId}`);

            // Webhook
            if (project) {
                this.callWebhook(project, 'analysis.completed', {
                    recordId, filename: record.filename, metrics, customMetrics: customMetricsResult,
                }).catch(err => this.logger.warn(`Webhook error: ${err.message}`));
            }
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
        }
    }

    // ─── Read Endpoints ──────────────────────────────────────────────

    async getById(id: number, userId?: string): Promise<AiCdr> {
        const where: any = { channelId: String(id) };
        if (userId) where.userId = userId;

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
        return record;
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
            where.assistantName = { [Op.iLike || Op.like]: `%${query.operatorName}%` };
        }

        if (query.projectId) {
            where.projectId = query.projectId;
        }

        // Search logic
        if (query.search && query.search.trim() !== '') {
            const searchStr = `%${query.search.trim()}%`;
            const searchConditions = [
                { assistantName: { [Op.iLike || Op.like]: searchStr } },
                { callerId: { [Op.iLike || Op.like]: searchStr } },
            ];
            // subquery issues in sqlite/postgres generally require true JSON query or left join. 
            // We just let the search logic from aiCdrService apply here.
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

        return { data, total, page, limit };
    }

    async getDashboard(query: {
        startDate?: string;
        endDate?: string;
        operatorName?: string;
        projectId?: number;
    }, isAdmin: boolean, realUserId: string) {
        const where: any = {};

        if (!isAdmin) {
            where.userId = String(realUserId);
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
            where.assistantName = { [Op.iLike || Op.like]: `%${query.operatorName}%` };
        }

        if (query.projectId) {
            where.projectId = query.projectId;
        }

        const records = await this.aiCdrRepository.findAll({
            where,
            include: [{ model: AiAnalytics, as: 'analytics' }],
            order: [['createdAt', 'ASC']],
            limit: 50000,
        });

        const totalAnalyzed = records.length;
        if (totalAnalyzed === 0) {
            return {
                totalAnalyzed: 0, totalCost: 0, averageDuration: 0,
                averageScore: 0, successRate: 0,
                aggregatedMetrics: this.emptyAggregatedMetrics(),
                sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
                timeSeries: [],
            };
        }

        const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
        const averageDuration = records.reduce((sum, r) => sum + (r.duration || 0), 0) / totalAnalyzed;

        // Aggregate metrics
        const numericKeys = [
            'greeting_quality', 'script_compliance', 'politeness_empathy',
            'active_listening', 'objection_handling', 'product_knowledge',
            'problem_resolution', 'speech_clarity_pace', 'closing_quality',
        ];

        const sums: Record<string, number> = {};
        numericKeys.forEach(k => sums[k] = 0);
        let successCount = 0;
        let positiveCount = 0, neutralCount = 0, negativeCount = 0;

        records.forEach(r => {
            const m = r.analytics?.metrics;
            if (!m) return;
            numericKeys.forEach(k => { sums[k] += (m[k] || 0); });
            if (m.success) successCount++;
            const sentiment = (r.analytics?.sentiment || '').toLowerCase();
            if (sentiment === 'positive') positiveCount++;
            else if (sentiment === 'neutral') neutralCount++;
            else if (sentiment === 'negative') negativeCount++;
        });

        const aggregatedMetrics: any = {};
        numericKeys.forEach(k => {
            aggregatedMetrics[k] = parseFloat((sums[k] / totalAnalyzed).toFixed(2));
        });

        const averageScore = parseFloat(
            (numericKeys.reduce((s, k) => s + aggregatedMetrics[k], 0) / numericKeys.length).toFixed(2),
        );

        const successRate = parseFloat(((successCount / totalAnalyzed) * 100).toFixed(2));

        const sentimentDistribution = {
            positive: parseFloat(((positiveCount / totalAnalyzed) * 100).toFixed(2)),
            neutral: parseFloat(((neutralCount / totalAnalyzed) * 100).toFixed(2)),
            negative: parseFloat(((negativeCount / totalAnalyzed) * 100).toFixed(2)),
        };

        // Time series
        const timeSeries = this.buildTimeSeries(records, query.startDate, query.endDate);

        return {
            totalAnalyzed,
            totalCost: parseFloat(totalCost.toFixed(2)),
            averageDuration: parseFloat(averageDuration.toFixed(2)),
            averageScore,
            successRate,
            aggregatedMetrics,
            sentimentDistribution,
            timeSeries,
        };
    }

    // ─── Projects ────────────────────────────────────────────────────

    async getProjects(userId: string, isAdmin: boolean) {
        // Ensure default project exists for this user
        if (!isAdmin) {
            await this.resolveDefaultProject(userId);
        }

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
        await project.save();
        return project;
    }

    async deleteProject(id: number, userId: string) {
        const project = await this.projectRepository.findOne({ where: { id, userId } });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);
        if (project.isDefault) {
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

        const completion = await this.openAiClient.chat.completions.create({
            messages: llmMessages,
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(this.sanitizeJsonResponse(content));
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

        const completion = await this.openAiClient.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a call center quality analysis system. Respond only in JSON format.' },
                { role: 'user', content: prompt },
            ],
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(this.sanitizeJsonResponse(content));

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

        const completion = await this.openAiClient.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a call center analytics AI. Respond only in JSON.' },
                { role: 'user', content: prompt },
            ],
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(this.sanitizeJsonResponse(content));

        const result = {
            insights: parsed.insights || [],
            generatedAt: new Date().toISOString(),
        };

        this.insightsCache.set(cacheKey, { data: result, expiry: Date.now() + this.INSIGHTS_TTL });
        return result;
    }

    // ─── Webhook ─────────────────────────────────────────────────────

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

    // ─── Private Helpers ─────────────────────────────────────────────

    private async checkBalance(userId: string): Promise<void> {
        const user = await this.userRepository.findByPk(userId, { attributes: ['balance'] });
        if (!user || user.balance <= 0) {
            throw new HttpException(
                { message: 'Insufficient balance', balance: user?.balance || 0 },
                HttpStatus.PAYMENT_REQUIRED,
            );
        }
    }

    private async chargeCost(
        userId: string,
        totalTokens: number,
        durationSeconds: number = 0,
    ): Promise<{ totalCost: number; llmCost: number; sttCost: number }> {
        const price = await this.pricesRepository.findOne({ where: { userId: Number(userId) } });
        if (!price) {
            this.logger.warn(`Price not found for userId: ${userId}, using default rate`);
            return { totalCost: 0, llmCost: 0, sttCost: 0 };
        }

        // LLM cost: tokens × (analytic price per 1M tokens)
        const llmCost = totalTokens > 0 ? parseFloat((totalTokens * ((price.analytic || 0) / 1_000_000)).toFixed(6)) : 0;

        // STT cost: duration in minutes × stt price per minute
        const durationMinutes = durationSeconds / 60;
        const sttCost = durationMinutes > 0 ? parseFloat((durationMinutes * (price.stt || 0)).toFixed(6)) : 0;

        const totalCost = parseFloat((llmCost + sttCost).toFixed(6));

        this.logger.log(`Billing: LLM=${llmCost} (${totalTokens} tokens) + STT=${sttCost} (${durationMinutes.toFixed(2)} min) = ${totalCost}`);

        if (totalCost > 0) {
            await this.usersService.decrementUserBalance(userId, totalCost);
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
    ): Promise<{ metrics: OperatorMetrics; customMetricsResult: any; usage: any }> {

        // Build custom metrics block: prefer project schema, fall back to ad-hoc defs
        const effectiveMetrics: { name: string; id?: string; type: string; description: string; enumValues?: string[] }[] =
            project?.customMetricsSchema?.length
                ? project.customMetricsSchema
                : (customMetricsDef || []).map(m => ({ ...m, id: m.name }));

        let customMetricsPromptBlock = '';
        if (effectiveMetrics.length) {
            const customDefs = effectiveMetrics.map(m => {
                let typeDef = `<${m.type}>`;
                if (m.type === 'enum' && (m as any).enumValues?.length) {
                    typeDef = `one of: ${(m as any).enumValues.join(', ')}`;
                }
                return `  "${m.id || m.name}": ${typeDef} — ${m.description}`;
            }).join('\n');
            customMetricsPromptBlock = `

Additionally, analyze these CUSTOM metrics and include them in the "custom_metrics" field:
{
${customDefs}
}`;
        }

        // System prompt from project
        const businessContext = project?.systemPrompt
            ? `\nBUSINESS CONTEXT: ${project.systemPrompt}\n`
            : '';

        const prompt = `
You are a senior call center quality assurance analyst. Analyze the following transcription of a call between a LIVE HUMAN OPERATOR and a customer. Generate a JSON report with metrics.
${businessContext}
TRANSCRIPTION:
${transcription}

Analyze the dialogue and return a JSON object with EXACTLY this structure:

{
  "greeting_quality": <0-100>,
  "script_compliance": <0-100>,
  "politeness_empathy": <0-100>,
  "active_listening": <0-100>,
  "objection_handling": <0-100>,
  "product_knowledge": <0-100>,
  "problem_resolution": <0-100>,
  "speech_clarity_pace": <0-100>,
  "closing_quality": <0-100>,
  "customer_sentiment": "<Positive|Neutral|Negative>",
  "csat": <1-5 integer>,
  "summary": "<string>",
  "success": <boolean>${effectiveMetrics.length ? ',\n  "custom_metrics": { ... }' : ''}
}

Metric descriptions:
1. greeting_quality: How well did the operator greet and identify themselves and the customer? Did they follow standard opening protocol?
2. script_compliance: Did the operator follow the conversation script/guidelines? Were required steps followed?
3. politeness_empathy: Was the operator polite, empathetic? Did they acknowledge the customer's emotions?
4. active_listening: Did the operator actively listen, paraphrase, and confirm understanding?
5. objection_handling: How well did the operator handle objections, complaints, or negative emotions?
6. product_knowledge: Did the operator demonstrate competent knowledge of the product/service?
7. problem_resolution: Was the customer's issue resolved? First Call Resolution quality.
8. speech_clarity_pace: Was the operator's speech clear, well-paced, and professional?
9. closing_quality: Did the operator properly close the call with next steps and farewell?
10. customer_sentiment: Overall customer sentiment at the end of the call.
11. csat: Customer Satisfaction Score from 1 to 5 based on the customer's apparent satisfaction during the call.
- summary: Brief summary of what the call was about and its outcome.
- success: Was the customer's question or problem resolved?
${customMetricsPromptBlock}

IMPORTANT LANGUAGE RULES:
- "summary" field MUST be written in the same language as the conversation (e.g. Russian if the call is in Russian).
- "customer_sentiment" MUST be one of these exact English values: "Positive", "Neutral", or "Negative" — do NOT translate it.
- All numeric metric values (0-100) are language-neutral.
Return ONLY valid JSON without markdown formatting.
`;

        const messages = [
            { role: 'system' as const, content: 'You are a call center quality analysis system. Respond only in JSON format.' },
            { role: 'user' as const, content: prompt },
        ];

        const completion = await this.openAiClient.chat.completions.create({
            messages,
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content || '{}';
        const sanitized = this.sanitizeJsonResponse(content);
        const parsed = JSON.parse(sanitized);

        const customMetricsResult = parsed.custom_metrics || null;
        delete parsed.custom_metrics;

        return {
            metrics: parsed as OperatorMetrics,
            customMetricsResult,
            usage: completion.usage,
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

    private buildTimeSeries(records: AiCdr[], startDate?: string, endDate?: string) {
        if (!records.length) return [];

        const start = startDate ? new Date(startDate) : new Date(records[0].createdAt);
        const end = endDate ? new Date(endDate) : new Date(records[records.length - 1].createdAt);
        const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        const numericKeys = [
            'greeting_quality', 'script_compliance', 'politeness_empathy',
            'active_listening', 'objection_handling', 'product_knowledge',
            'problem_resolution', 'speech_clarity_pace', 'closing_quality',
        ];

        const groups: Record<string, { calls: number; totalScore: number; totalDuration: number }> = {};

        records.forEach(r => {
            const date = new Date(r.createdAt);
            let label: string;

            if (daysDiff <= 31) {
                label = date.toISOString().split('T')[0];
            } else if (daysDiff <= 366) {
                label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            } else {
                label = `${date.getFullYear()}`;
            }

            if (!groups[label]) {
                groups[label] = { calls: 0, totalScore: 0, totalDuration: 0 };
            }
            groups[label].calls++;
            groups[label].totalDuration += r.duration || 0;

            if (r.analytics?.metrics) {
                const avg = numericKeys.reduce((s, k) => s + (r.analytics.metrics[k] || 0), 0) / numericKeys.length;
                groups[label].totalScore += avg;
            }
        });

        return Object.entries(groups).map(([label, g]) => ({
            label,
            callsCount: g.calls,
            avgScore: parseFloat((g.totalScore / g.calls).toFixed(2)),
            avgDuration: parseFloat((g.totalDuration / g.calls).toFixed(2)),
        }));
    }
}
