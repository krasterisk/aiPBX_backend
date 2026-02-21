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
import { OperatorMetrics, CustomMetricDef, ITranscriptionProvider, TranscriptionResult } from './interfaces/operator-metrics.interface';
import { Op } from 'sequelize';
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

    /**
     * Runs STT with automatic fallback to OpenAI Whisper if the primary provider fails.
     * If STT_API_URL is not set, goes straight to OpenAI.
     */
    private async transcribeWithFallback(
        buffer: Buffer,
        filename: string,
        language: string,
        preferredProvider?: string,
    ): Promise<TranscriptionResult> {
        // Determine primary provider
        const primaryName = preferredProvider || 'external';
        const primary = this.sttProviders.get(primaryName);

        if (primary && primaryName !== 'openai') {
            try {
                this.logger.log(`[STT] Trying primary provider: ${primaryName}`);
                const result = await primary.transcribe(buffer, filename, language);
                this.logger.log(`[STT] Primary provider "${primaryName}" succeeded`);
                return result;
            } catch (err) {
                this.logger.warn(
                    `[STT] Primary provider "${primaryName}" failed: ${err.message}. Falling back to OpenAI Whisper.`,
                );
            }
        }

        // Fallback to OpenAI Whisper
        this.logger.log('[STT] Using OpenAI Whisper (fallback)');
        return this.openAiSttProvider.transcribe(buffer, filename, language);
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
        });

        if (options.customMetrics?.length) {
            await record.update({ customMetricsDef: options.customMetrics });
        }

        try {
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
            });

            // 4. Analyze metrics via LLM
            const { metrics, customMetricsResult, usage } = await this.analyzeTranscription(
                sttResult.text,
                options.customMetrics,
            );

            // 5. Calculate cost and charge (LLM tokens + STT duration)
            const totalTokens = usage?.total_tokens || 0;
            const { totalCost, llmCost, sttCost } = await this.chargeCost(userId, totalTokens, sttResult.duration);

            // 6. Save results
            await record.update({
                metrics,
                customMetrics: customMetricsResult || null,
                tokens: totalTokens,
                cost: totalCost,
                llmCost,
                sttCost,
                status: AnalyticsStatus.COMPLETED,
            });

            this.logger.log(`Analysis completed for "${filename}" (id=${record.id}), cost=${totalCost} (llm=${llmCost}, stt=${sttCost}), tokens=${totalTokens}`);
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

        return this.analyzeFile(buffer, filename, userId, AnalyticsSource.API, options);
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
            customMetricsDef: options.customMetrics?.length ? options.customMetrics : null,
            projectId: options.projectId || null,
        });
    }

    async processInBackground(recordId: number, buffer: Buffer, provider?: string): Promise<void> {
        try {
            const record = await this.analyticsRepository.findByPk(recordId);
            if (!record) return;

            await this.checkBalance(record.userId);

            const sttResult = await this.transcribeWithFallback(
                buffer,
                record.filename,
                record.language || 'auto',
                provider,
            );

            await record.update({ transcription: sttResult.text, duration: sttResult.duration });

            const { metrics, customMetricsResult, usage } = await this.analyzeTranscription(
                sttResult.text,
                record.customMetricsDef,
            );

            const totalTokens = usage?.total_tokens || 0;
            const { totalCost, llmCost, sttCost } = await this.chargeCost(record.userId, totalTokens, sttResult.duration);

            await record.update({
                metrics,
                customMetrics: customMetricsResult || null,
                tokens: totalTokens,
                cost: totalCost,
                llmCost,
                sttCost,
                status: AnalyticsStatus.COMPLETED,
            });

            this.logger.log(`Background analysis completed for record #${recordId}`);
        } catch (e) {
            this.logger.error(`Background analysis failed for record #${recordId}: ${e.message}`);
            const record = await this.analyticsRepository.findByPk(recordId);
            if (record) {
                await record.update({ status: AnalyticsStatus.ERROR, errorMessage: e.message });
            }
        }
    }

    // ─── Read Endpoints ──────────────────────────────────────────────

    async getById(id: number, userId?: string): Promise<OperatorAnalytics> {
        const where: any = { id };
        if (userId) where.userId = userId;

        const record = await this.analyticsRepository.findOne({ where });
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
            where.operatorName = { [Op.iLike]: `%${query.operatorName}%` };
        }

        if (query.projectId) {
            where.projectId = query.projectId;
        }

        // Only completed records
        where.status = AnalyticsStatus.COMPLETED;

        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 20;
        const offset = (page - 1) * limit;

        const { rows: data, count: total } = await this.analyticsRepository.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit,
            offset,
            attributes: { exclude: ['transcription'] }, // Exclude heavy field from list
        });

        return { data, total, page, limit };
    }

    async getDashboard(query: {
        startDate?: string;
        endDate?: string;
        operatorName?: string;
        projectId?: number;
    }, isAdmin: boolean, realUserId: string) {
        const where: any = { status: AnalyticsStatus.COMPLETED };

        if (!isAdmin) {
            where.userId = realUserId;
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
            where.operatorName = { [Op.iLike]: `%${query.operatorName}%` };
        }

        if (query.projectId) {
            where.projectId = query.projectId;
        }

        const records = await this.analyticsRepository.findAll({
            where,
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
            const m = r.metrics;
            if (!m) return;
            numericKeys.forEach(k => { sums[k] += (m[k] || 0); });
            if (m.success) successCount++;
            const sentiment = (m.customer_sentiment || '').toLowerCase();
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
        const where = isAdmin ? {} : { userId };
        return this.projectRepository.findAll({
            where,
            order: [['createdAt', 'DESC']],
        });
    }

    async createProject(userId: string, name: string, description?: string): Promise<OperatorProject> {
        if (!name?.trim()) {
            throw new HttpException('Project name is required', HttpStatus.BAD_REQUEST);
        }
        return this.projectRepository.create({ name: name.trim(), description, userId });
    }

    async updateProject(id: number, userId: string, name?: string, description?: string): Promise<OperatorProject> {
        const project = await this.projectRepository.findOne({ where: { id, userId } });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);
        if (name !== undefined) project.name = name.trim();
        if (description !== undefined) project.description = description;
        await project.save();
        return project;
    }

    async deleteProject(id: number, userId: string) {
        const project = await this.projectRepository.findOne({ where: { id, userId } });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);
        await project.destroy();
        return { success: true };
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
        const llmCost = totalTokens > 0 ? parseFloat((totalTokens * (price.analytic / 1_000_000)).toFixed(6)) : 0;

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
    ): Promise<{ metrics: OperatorMetrics; customMetricsResult: any; usage: any }> {

        let customMetricsPromptBlock = '';
        if (customMetricsDef?.length) {
            const customDefs = customMetricsDef.map(m =>
                `  "${m.name}": <${m.type}> — ${m.description}`
            ).join('\n');
            customMetricsPromptBlock = `

Additionally, analyze these CUSTOM metrics and include them in the "custom_metrics" field:
{
${customDefs}
}`;
        }

        const prompt = `
You are a senior call center quality assurance analyst. Analyze the following transcription of a call between a LIVE HUMAN OPERATOR and a customer. Generate a JSON report with metrics.

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
  "summary": "<string>",
  "success": <boolean>${customMetricsDef?.length ? ',\n  "custom_metrics": { ... }' : ''}
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

    private buildTimeSeries(records: OperatorAnalytics[], startDate?: string, endDate?: string) {
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

            if (r.metrics) {
                const avg = numericKeys.reduce((s, k) => s + (r.metrics[k] || 0), 0) / numericKeys.length;
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
