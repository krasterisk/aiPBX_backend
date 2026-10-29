import { QualityPreviewAnalytics } from '../operator-analytics/quality/quality-preview-analytics.model';
import { currentQualityProjection } from '../operator-analytics/quality/current-quality-projection';
import { journalOrderExpression } from './journal-order';
import { postgresJsonbCast } from '../operator-analytics/lib/dashboard-aggregation';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { AiCdrDto } from "./dto/ai-cdr.dto";
import sequelize, { Op } from "sequelize";
import { GetAiCdrDto } from "./dto/getAiCdr.dto";
import { AiCdr } from "./ai-cdr.model";
import { AiEvents } from "./ai-events.model";
import { AiEventDto } from "./dto/ia-events.dto";
import { GetDashboardAllData, GetDashboardData, GetDashboardDoneData, GetDashboardDto } from "./dto/getDashboardDto";
import { BillingService } from "../billing/billing.service";
import { Assistant } from '../assistants/assistants.model';
import { SipAccounts } from '../pbx-servers/sip-accounts.model';
import { AiAnalytics } from "../ai-analytics/ai-analytics.model";
import { BillingRecord } from "../billing/billing-record.model";
import { AiAnalyticsService } from "../ai-analytics/ai-analytics.service";
import { forwardRef } from "@nestjs/common";
import { OperatorAnalytics } from "../operator-analytics/operator-analytics.model";
import { CallTag } from "../operator-analytics/operator-call-tag.model";
import { isOperatorAnalyticsSource } from "../operator-analytics/lib/analytics-source";
import { isRubTenant } from '../shared/tenant/tenant-currency';
import { buildCsatWhereCondition, parseCsatFilter } from './parse-csat-filter';
import { applyJournalSelection, journalDateWhere, journalOption, journalTags, JournalQuery } from './journal-selection';

interface AudioTranscriptionEvent {
    type: 'conversation.item.input_audio_transcription.completed';
    transcript: string;
}

interface AssistantResponseEvent {
    type: 'response.done';
    response?: {
        output: {
            content: { transcript: string }[];
        }[];
    };
}

type AiEventItem = AudioTranscriptionEvent | AssistantResponseEvent;

@Injectable()
export class AiCdrService {
    private readonly logger = new Logger(AiCdrService.name);
    private readonly dialect: string;

    constructor(
        @InjectModel(AiCdr) private aiCdrRepository: typeof AiCdr,
        @InjectModel(AiEvents) private aiEventsRepository: typeof AiEvents,
        @InjectModel(AiAnalytics) private aiAnalyticsRepository: typeof AiAnalytics,
        @InjectModel(BillingRecord) private billingRecordRepository: typeof BillingRecord,
        @InjectModel(Assistant) private readonly assistantRepository: typeof Assistant,
        @InjectModel(OperatorAnalytics) private readonly operatorAnalyticsRepository: typeof OperatorAnalytics,
        @InjectModel(CallTag) private readonly callTagRepository: typeof CallTag,
        private readonly billingService: BillingService,
        @Inject(forwardRef(() => AiAnalyticsService)) private readonly aiAnalyticsService: AiAnalyticsService
    ) {
        this.dialect = this.aiCdrRepository.sequelize.getDialect();
    }

    // ─── Dialect-aware SQL helpers ───

    /** Quote identifier: backticks for MySQL, double quotes for Postgres */
    private q(name: string): string {
        return this.dialect === 'postgres' ? `"${name}"` : `\`${name}\``;
    }

    /** DATE(col) — extract date from timestamp */
    private sqlDate(col: string): string {
        return this.dialect === 'postgres' ? `${col}::date` : `DATE(${col})`;
    }

    /** Use billing FX snapshot on CDR row when aiCdr.amountCurrency was not persisted (legacy / migration gap). */
    private applyBillingFxToCdrRow(row: {
        cost?: number;
        amountCurrency?: number | string | null;
        costCurrency?: string | null;
        billingRecords?: Array<{
            totalCost?: number;
            amountCurrency?: number | string | null;
            currency?: string;
        }>;
    }): void {
        const cdrAmount = Number(row.amountCurrency);
        if (Number.isFinite(cdrAmount) && cdrAmount > 0) {
            return;
        }
        const records = row.billingRecords;
        if (!records?.length) {
            return;
        }
        let amountCurrency = 0;
        let currency: string | null = row.costCurrency ?? null;
        for (const br of records) {
            amountCurrency += Number(br.amountCurrency) || 0;
            if (!currency && br.currency) {
                currency = br.currency;
            }
        }
        if (amountCurrency > 0) {
            row.amountCurrency = parseFloat(amountCurrency.toFixed(4));
            row.costCurrency = currency;
        }
    }

    /** Group by day with a label */
    private sqlGroupByDay(col: string): { groupBy: string; label: string } {
        return this.dialect === 'postgres'
            ? { groupBy: `${col}::date`, label: `${col}::date as label` }
            : { groupBy: `DAY(${col})`, label: `DATE(${col}) as label` };
    }

    /** Group by month with a label */
    private sqlGroupByMonth(col: string): { groupBy: string; label: string } {
        return this.dialect === 'postgres'
            ? { groupBy: `TO_CHAR(${col}, 'YYYY-MM')`, label: `TO_CHAR(${col}, 'YYYY-MM') as label` }
            : { groupBy: `MONTH(${col})`, label: `DATE_FORMAT(${col}, '%Y-%m') as label` };
    }

    /** Group by year with a label */
    private sqlGroupByYear(col: string): { groupBy: string; label: string } {
        return this.dialect === 'postgres'
            ? { groupBy: `TO_CHAR(${col}, 'YYYY')`, label: `TO_CHAR(${col}, 'YYYY') as label` }
            : { groupBy: `YEAR(${col})`, label: `DATE_FORMAT(${col}, '%Y') as label` };
    }

    /** JSON_EXTRACT for sorting by nested JSON path */
    private sqlJsonExtract(table: string, column: string, jsonPath: string): string {
        return this.dialect === 'postgres'
            ? `(replace((${this.q(table)}.${this.q(column)})::text, E'\\\\u0000', '')::jsonb->'scenario_analysis'->>'success')`
            : `JSON_EXTRACT(${this.q(table)}.${this.q(column)}, '${jsonPath}')`;
    }

    async cdrCreate(dto: AiCdrDto) {
        try {
            const [aiCdr, created] = await this.aiCdrRepository.findOrCreate({
                where: { channelId: dto.channelId },
                defaults: dto as any,
            });
            if (!created) {
                this.logger.warn(`CDR already exists for ${dto.channelId}, skipping duplicate`);
            }
            return aiCdr;
        } catch (e) {
            throw new HttpException('[AiCdr]: Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getCdr(channelId: string): Promise<AiCdr | null> {
        return this.aiCdrRepository.findOne({ where: { channelId } });
    }

    async cdrUpdate(updates: Partial<AiCdr>) {
        try {
            const aiCdr = await this.aiCdrRepository.findOne({
                where: { channelId: updates.channelId }
            })

            if (!aiCdr) {
                throw new HttpException('aiCdr not found', HttpStatus.NOT_FOUND)
            }
            await aiCdr.update(updates)
            return aiCdr
        } catch (e) {
            throw new HttpException('[AiCdr]: Update error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async cdrHangup(channelId: string, assistantId: number) {
        try {
            const aiCdr = await this.aiCdrRepository.findOne({
                where: { channelId }
            })

            if (!aiCdr) {
                this.logger.error('aiCdr not found')
                throw new HttpException('aiCdr not found', HttpStatus.NOT_FOUND)
            }
            const now = new Date();
            const createdAt = new Date(aiCdr.createdAt);
            const duration = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

            const billingResult = await this.billingService.finalizeCallBilling(channelId);

            // Generate recordUrl
            let recordUrl = '';
            if (assistantId) {
                const assistant = await this.assistantRepository.findOne({
                    where: { id: assistantId },
                    include: [SipAccounts]
                });

                if (assistant?.sipAccount?.records) {
                    const sipUri = assistant.sipAccount.sipUri;
                    const serverUrl = sipUri.split('@')[1];
                    if (serverUrl) {
                        recordUrl = `https://${serverUrl}/records/${assistant.uniqueId}/${channelId}.mp3`;
                    }
                }
            }
            await aiCdr.update({
                duration,
                cost: billingResult.totalCost,
                costCurrency: billingResult.costCurrency,
                amountCurrency: billingResult.amountCurrency,
                recordUrl,
            });

            if (assistantId) {
                const assistant = await this.assistantRepository.findByPk(assistantId);
                if (assistant && assistant.analytic) {
                    // Fire and forget analysis
                    this.aiAnalyticsService.analyzeCall(channelId);
                }
            }
            return aiCdr
        } catch (e) {
            this.logger.error('[AiCdr]: Update error ' + e.message)
            throw new HttpException('[AiCdr]: Update error' + e, HttpStatus.BAD_REQUEST)
        }
    }


    async eventCreate(dto: AiEventDto) {
        try {
            const aiEvent = await this.aiEventsRepository.create(dto)
            return aiEvent
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('AiEvent already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[AiEvent]:  Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getEvents(channelId: string) {
        try {
            const aiEvents = await this.aiEventsRepository.findAll({
                where: { channelId }
            })
            return aiEvents
        } catch (e) {
            throw new HttpException('[AiEvents]: Get events error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getDialogs(channelId: string, ownerId?: string) {
        if (ownerId !== undefined && !await this.aiCdrRepository.findOne({where:{channelId,userId:ownerId}})) throw new HttpException('Call not found',HttpStatus.NOT_FOUND);
        try {
            const aiEvents = await this.aiEventsRepository.findAll({
                where: { channelId },
                order: [['createdAt', 'ASC']],
            });

            if (!aiEvents || aiEvents.length === 0) {
                return [];
            }

            const dialog = aiEvents.flatMap(entry => {
                const parsedEvents = Array.isArray(entry.events) ? entry.events : [entry.events];
                const timestamp = new Date(entry.createdAt).toLocaleTimeString(
                    'ru-RU',
                    {
                        hour12: false,
                        timeZone: process.env.TIMEZONE
                    }
                )

                return parsedEvents.flatMap((event: any) => {
                    if (event.type === 'conversation.item.input_audio_transcription.completed') {
                        return [{
                            timestamp: new Date(entry.createdAt).toISOString(),
                            role: 'User',
                            text: event.transcript
                        }];
                    }

                    if (event.type === 'response.done') {
                        const items = event.response?.output || [];
                        return items.flatMap((item: any) => {
                            const entries = [];
                            if (item?.content) {
                                item.content.forEach((c: any) => {
                                    if (c.transcript) {
                                        entries.push({
                                            timestamp: new Date(entry.createdAt).toISOString(),
                                            role: 'Assistant',
                                            text: c.transcript
                                        });
                                    }
                                });
                            }
                            if (item.type === 'function_call') {
                                entries.push({
                                    timestamp: new Date(entry.createdAt).toISOString(),
                                    role: 'Assistant',
                                    text: `Function call: ${item.name}(${item.arguments})`
                                });
                            }
                            return entries;
                        });
                    }

                    if (event.type === 'conversation.item.created' && event.item?.type === 'function_call_output') {
                        return [{
                            timestamp: new Date(entry.createdAt).toISOString(),
                            role: 'System',
                            text: `Function result: ${event.item.output}`
                        }];
                    }

                    return [];
                });
            });

            return dialog;
        } catch (e) {
            throw new HttpException('[AiEvents]: Get events error: ' + e.message, HttpStatus.BAD_REQUEST);
        }
    }

    /** Shared by journal rows and its people facet, including authenticated account scope. */
    private async cdrSelectionWhere(query: GetAiCdrDto, userId: string | undefined, journalMode: boolean) {
        const search = query.search;
        const startDate = query.startDate;
        const endDate = query.endDate;
        const searchConditions: any[] = [
            {
                callerId: {
                    [sequelize.Op.like]: `%${search}%`
                }
            },
            {
                assistantName: {
                    [sequelize.Op.like]: `%${search}%`
                }
            },
            {
                channelId: {
                    [sequelize.Op.like]: `%${search}%`
                }
            },
        ];

        // Only search in associated analytics.summary when there's actual search text,
        // otherwise Sequelize puts it in a subquery where the JOIN isn't available
        if (search && search.trim() !== '') {
            searchConditions.push({
                '$analytics.summary$': {
                    [sequelize.Op.like]: `%${search}%`
                }
            });
        }

        const whereClause: any = {
            [sequelize.Op.or]: searchConditions
        };

        // Обработка случаев, когда указаны оба параметра startDate и endDate
        if (journalMode) {
            const dates = journalDateWhere(startDate, endDate);
            if (dates) whereClause.createdAt = dates;
            applyJournalSelection(whereClause, query as JournalQuery);
        } else if (startDate && endDate) {
            whereClause.createdAt = {
                // [sequelize.Op.gte]: sequelize.literal(`DATE('${startDate}')`),
                // [sequelize.Op.lte]: sequelize.literal(`DATE('${endDate}')`)
                [sequelize.Op.between]: [startDate + " 00:00", endDate + " 23:59"]
            };
        }
        // Обработка случая, когда указан только startDate
        else if (startDate) {
            whereClause.createdAt = {
                [sequelize.Op.gte]: sequelize.literal(this.sqlDate(`'${startDate}'`))
            };
        }
        // Обработка случая, когда указан только endDate
        else if (endDate) {
            whereClause.createdAt = {
                [sequelize.Op.lte]: sequelize.literal(this.sqlDate(`'${endDate}'`))
            };
        }

        if (userId !== undefined) {
            whereClause.userId = String(userId);
        }

        const assistantIds = Array.isArray(query.assistantId)
            ? query.assistantId
            : typeof query.assistantId === 'string'
                ? query.assistantId.split(',').map(id => id.trim()).filter(Boolean)
                : [];

        if (assistantIds && assistantIds.length > 0) {
            whereClause.assistantId = {
                [Op.in]: assistantIds
            };
        }

        if (query.source) {
            whereClause.source = query.source;
        }

        const { scores: csatScores, includeNone: includeNoCsat } = parseCsatFilter(query.csat);
        const csatWhere = buildCsatWhereCondition(csatScores, includeNoCsat);
        if (csatWhere) {
            whereClause[sequelize.Op.and] = [...(whereClause[sequelize.Op.and] || []), csatWhere];
        }

        if (query.projectId !== undefined && query.projectId !== '') {
            whereClause.projectId = Number(query.projectId);
        }

        const tagId = typeof query.tagId === 'string' ? query.tagId.trim() : '';
        const tagIds = journalMode ? journalTags((query as JournalQuery).tagIds) : [];
        if (tagId || tagIds.length) {
            const tagWhere: Record<string, unknown> = { tagId: tagIds.length ? { [Op.in]: tagIds } : tagId };
            if (userId !== undefined) {
                tagWhere.userId = String(userId);
            }
            if (query.projectId !== undefined && query.projectId !== '') {
                tagWhere.projectId = Number(query.projectId);
            }
            if (journalMode) {
                // The query generator escapes values; no capped ID list or untrusted SQL.
                const generator = (this.aiCdrRepository.sequelize.getQueryInterface() as any).queryGenerator;
                const sql = generator.selectQuery(this.callTagRepository.getTableName(), {
                    attributes: ['channelId'], where: tagWhere,
                }).replace(/;\s*$/, '');
                whereClause.channelId = { [Op.in]: sequelize.literal(`(${sql})`) };
            } else {
                const tagRows = await this.callTagRepository.findAll({
                    where: tagWhere,
                    attributes: ['channelId'],
                    limit: 5000,
                });
                const channelIds = tagRows.map(r => r.channelId);
                whereClause.channelId = {
                    [Op.in]: channelIds.length ? channelIds : ['__no_matching_tag__'],
                };
            }
        }


        return { whereClause, csatWhere };
    }

    private previewSelectionWhere(value: any): any {
        if (typeof value === 'string') return value;
        if (!value || typeof value !== 'object' || value instanceof Date) return value;
        if (Array.isArray(value)) return value.map(entry => this.previewSelectionWhere(entry));
        if (value.val && typeof value.val === 'string') return sequelize.literal(value.val.replace(/"analytics"/g, '"previewAnalytics"'));
        if (Object.getPrototypeOf(value) !== Object.prototype) return value;
        return Reflect.ownKeys(value).reduce((out: any, key) => {
            out[typeof key === 'string' ? key.replace(/\$analytics\./g, '$previewAnalytics.') : key] = this.previewSelectionWhere(value[key]); return out;
        }, {});
    }

    async getJournalOptions(query: JournalQuery, isAdmin: boolean, realUserId: string) {
        if (!isAdmin && !realUserId) throw new HttpException('Missing account', HttpStatus.BAD_REQUEST);
        const userId = isAdmin ? (query.userId || undefined) : realUserId;
        // Ignore only this facet's own selection, so multiselect can still add people.
        const { whereClause } = await this.cdrSelectionWhere({ ...query, people: undefined, search: query.search ?? '' } as JournalQuery, userId, true);
        const rows = await this.aiCdrRepository.findAll({
            where: this.previewSelectionWhere(whereClause),
            attributes: ['userId', 'operatorId', 'assistantId', 'assistantName'],
            include: [{ model: QualityPreviewAnalytics, as: 'previewAnalytics', attributes: [], required: false }],
            group: ['AiCdr.userId', 'AiCdr.operatorId', 'AiCdr.assistantId', 'AiCdr.assistantName'],
            order: [['assistantName', 'ASC']],
            limit: 1000,
            raw: true,
        });
        const options = new Map<string, ReturnType<typeof journalOption>>();
        for (const row of rows) {
            const option = journalOption(row);
            if (option) options.set(option.value, option);
        }
        return { people: [...options.values()].sort((a, b) => a.label.localeCompare(b.label)), limitReached: rows.length === 1000 };
    }

    async get(query: GetAiCdrDto, isAdmin: boolean, realUserId: string, journalMode = false, qualityPreview = false) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const offset = (page - 1) * limit;
            if (journalMode && (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 1000))
                throw new HttpException('Invalid journal pagination', HttpStatus.BAD_REQUEST);
            const search = query.search;
            const endDate = query.endDate;
            const startDate = query.startDate;

            if (!realUserId && !isAdmin) {
                throw new HttpException({ message: "[Report]:  userId must be set" }, HttpStatus.BAD_REQUEST);
            }

            // Admin with no userId filter → see all; Admin with userId → filter; User → own records only
            let userId: string | undefined;
            if (isAdmin) {
                userId = query.userId ? String(query.userId) : undefined;
            } else {
                userId = String(realUserId);
            }

            // Prepare the where clause
            const { whereClause, csatWhere } = await this.cdrSelectionWhere(query, userId, journalMode);

            const sortField = query.sortField || 'createdAt';
            const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
            const directSortFields = new Set([
                'createdAt',
                'assistantName',
                'callerId',
                'source',
                'duration',
                'cost',
            ]);

            // Build order clause based on field type
            let orderClause: any[];
            const journalOrder = qualityPreview ? journalOrderExpression(sortField, this.dialect, true) : null;
            const isAssociatedSort = Boolean(journalOrder) || sortField === 'csat' || sortField === 'sentiment' || sortField === 'scenarioSuccess';
            const isCsatFilter = Boolean(csatWhere);
            // subQuery: false needed when sorting/searching by JOINed fields
            const needsFlatQuery = isAssociatedSort || isCsatFilter || (search && search.trim() !== '');
            const nullsLast = this.dialect === 'postgres' ? ' NULLS LAST' : '';

            if (journalOrder) {
                orderClause = [[sequelize.literal(`${journalOrder} ${sortOrder}${nullsLast}`)]];
            } else if (sortField === 'csat') {
                orderClause = this.dialect === 'postgres'
                    ? [[sequelize.literal(`"analytics"."csat" ${sortOrder}${nullsLast}`)]]
                    : [[{ model: AiAnalytics, as: 'analytics' }, 'csat', sortOrder]];
            } else if (sortField === 'sentiment') {
                orderClause = this.dialect === 'postgres'
                    ? [[sequelize.literal(`"analytics"."sentiment" ${sortOrder}${nullsLast}`)]]
                    : [[{ model: AiAnalytics, as: 'analytics' }, 'sentiment', sortOrder]];
            } else if (sortField === 'scenarioSuccess') {
                orderClause = [[sequelize.literal(
                    `${this.sqlJsonExtract('analytics', 'metrics', '$.scenario_analysis.success')} ${sortOrder}${nullsLast}`,
                )]];
            } else if (directSortFields.has(sortField)) {
                orderClause = [[sortField, sortOrder]];
            } else {
                orderClause = [['createdAt', sortOrder]];
            }
            orderClause = [...orderClause, ['id', sortOrder]];

            const selectedWhere = qualityPreview ? this.previewSelectionWhere(whereClause) : whereClause;
            if (qualityPreview) orderClause = orderClause.map(entry => {
                if (entry[0]?.val) return [sequelize.literal(entry[0].val.replace(/"analytics"/g, '"previewAnalytics"'))];
                return entry;
            });
            const { count, rows } = await this.aiCdrRepository.findAndCountAll({
                offset,
                limit,
                subQuery: needsFlatQuery ? false : undefined,
                where: selectedWhere,
                order: orderClause,
                include: [
                    {
                        model: qualityPreview ? QualityPreviewAnalytics : AiAnalytics,
                        as: qualityPreview ? 'previewAnalytics' : 'analytics',
                        required: false,
                        ...(qualityPreview && this.dialect === 'postgres' ? { attributes: {
                            exclude: ['metrics'],
                            include: [[sequelize.literal(`jsonb_build_object('_topics', (${postgresJsonbCast(qualityPreview ? '"previewAnalytics"."metrics"' : '"analytics"."metrics"')})->'_topics', 'success', (${postgresJsonbCast(qualityPreview ? '"previewAnalytics"."metrics"' : '"analytics"."metrics"')})->'success', 'scenario_analysis', jsonb_build_object('success', (${postgresJsonbCast(qualityPreview ? '"previewAnalytics"."metrics"' : '"analytics"."metrics"')})->'scenario_analysis'->'success'))`), 'metrics']],
                        } } : {}),
                    },
                    {
                        model: BillingRecord,
                        as: 'billingRecords',
                        required: false,
                        separate: true,
                    },
                ],
            });

            // Build a sum-specific where clause that strips $analytics.*$ conditions
            // so that no JOIN is required and the 'cost' column is unambiguous.
            const sumWhereClause: any = journalMode ? { ...whereClause } : Object.fromEntries(
                Object.entries(whereClause).filter(([key]) => !String(key).startsWith('$analytics'))
            );
            // Also strip from Op.or array
            if (sumWhereClause[sequelize.Op.or]) {
                sumWhereClause[sequelize.Op.or] = (sumWhereClause[sequelize.Op.or] as any[]).filter(
                    (cond: any) => !Object.keys(cond).some(k => String(k).startsWith('$analytics'))
                );
            }
            if (sumWhereClause[sequelize.Op.and]) {
                sumWhereClause[sequelize.Op.and] = (sumWhereClause[sequelize.Op.and] as any[]).filter(
                    (cond: any) => !JSON.stringify(cond).includes('$analytics'),
                );
                if (!(sumWhereClause[sequelize.Op.and] as any[]).length) {
                    delete sumWhereClause[sequelize.Op.and];
                }
            }

            const totalCostRaw = await this.aiCdrRepository.sum('cost', {
                where: sumWhereClause,
            } as any);
            const totalCost = parseFloat((totalCostRaw || 0).toFixed(2));

            let totalAmountCurrency: number | null = null;
            if (isRubTenant()) {
                const sumClient = await this.aiCdrRepository.sum('amountCurrency', {
                    where: sumWhereClause,
                } as any);
                totalAmountCurrency = parseFloat((Number(sumClient) || 0).toFixed(2));
            }

            // Enrich rows with transcription / recordUrl from OperatorAnalytics
            // For records created via operator-analytics, channelId = OperatorAnalytics.id
            const analyticsIds = rows
                .filter(r => isOperatorAnalyticsSource(r.source))
                .map(r => Number(r.channelId))
                .filter(id => !isNaN(id));

            let transcriptionMap = new Map<string, string>();
            let recordUrlMap = new Map<string, string>();
            if (analyticsIds.length > 0 && !qualityPreview) {
                const oaRecords = await this.operatorAnalyticsRepository.findAll({
                    where: { id: { [Op.in]: analyticsIds } },
                    attributes: ['id', 'transcription', 'recordUrl'],
                });
                transcriptionMap = new Map(oaRecords.map(r => [String(r.id), r.transcription]));
                recordUrlMap = new Map(
                    oaRecords
                        .filter(r => !!r.recordUrl)
                        .map(r => [String(r.id), r.recordUrl]),
                );
            }

            const enrichedRows = rows.map(row => {
                const json = row.toJSON() as any;
                if (qualityPreview) { json.analytics = currentQualityProjection(json.previewAnalytics); delete json.previewAnalytics; }
                json.transcription = transcriptionMap.get(row.channelId) || null;
                if (!json.recordUrl) {
                    json.recordUrl = recordUrlMap.get(row.channelId) || json.recordUrl;
                }
                this.applyBillingFxToCdrRow(json);
                return json;
            });

            return { count, totalCost, totalAmountCurrency, rows: enrichedRows }

        } catch (e) {
            this.logger.error('[AiCdr]: get() error', e instanceof Error ? e.stack : e);
            throw new HttpException(
                { message: "[AiCdr]: Request error", error: e instanceof Error ? e.message : String(e) },
                HttpStatus.BAD_REQUEST
            );
        }
    }

    async deleteReport(id: string, isAdmin: boolean): Promise<{ success: boolean; id: string; refundedUsd: number }> {
        if (!isAdmin) {
            throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        }

        const cdr = await this.aiCdrRepository.findByPk(id);
        if (!cdr) {
            throw new HttpException('Report not found', HttpStatus.NOT_FOUND);
        }

        const channelId = cdr.channelId;
        const isOperatorSource = isOperatorAnalyticsSource(cdr.source);
        const operatorAnalyticsId = Number(channelId);
        let refundedUsd = 0;

        await this.aiCdrRepository.sequelize.transaction(async (transaction) => {
            const refund = await this.billingService.refundBillingForChannel(channelId, cdr.userId, {
                externalId: `refund_report_${id}`,
                transaction,
                fallbackUsd: Number(cdr.cost) || 0,
            });
            refundedUsd = refund.refundedUsd;

            await this.billingRecordRepository.destroy({ where: { channelId }, transaction });
            await this.aiAnalyticsRepository.destroy({ where: { channelId }, transaction });
            await this.aiEventsRepository.destroy({ where: { channelId }, transaction });

            if (isOperatorSource && Number.isFinite(operatorAnalyticsId)) {
                await this.operatorAnalyticsRepository.destroy({
                    where: { id: operatorAnalyticsId },
                    transaction,
                });
            }

            await cdr.destroy({ transaction });
        });

        this.logger.log(`Deleted report id=${id}, channelId=${channelId}, refundedUsd=${refundedUsd}`);
        return { success: true, id, refundedUsd };
    }

    async getDashboardData(query: GetDashboardDto, isAdmin: boolean) {
        const assistantId = query.assistantId || "";
        const startDate = query.startDate || "";
        const endDate = query.endDate || "";
        const tab = query.tab || "";
        const source = query.source || "";
        const projectId = query.projectId;

        const userId = !query.userId && isAdmin ? undefined : Number(query.userId);

        // const userId = undefined;

        if (!startDate || !endDate) {
            throw new HttpException({ message: "[Dashboard]: Request error" }, HttpStatus.BAD_REQUEST);
        }

        const dateArray = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        while (start <= end) {
            dateArray.push(start.getDate());
            start.setDate(start.getDate() + 1);
        }


        const tbl = this.q('aiCdr');
        const col = this.q('createdAt');
        const colDate = this.sqlDate(col);
        const whereClause: string = `WHERE (${colDate} BETWEEN ${this.sqlDate(`'${startDate}'`)} AND ${this.sqlDate(`'${endDate}'`)})`;
        let whereAddClause: string = "";
        let groupByClause = "";
        let dopAttr = "";

        if (dateArray.length <= 31) {
            const g = this.sqlGroupByDay(col);
            groupByClause = `GROUP BY ${g.groupBy}`;
            dopAttr = g.label;
        } else if (dateArray.length > 31 && dateArray.length <= 366) {
            const g = this.sqlGroupByMonth(col);
            groupByClause = `GROUP BY ${g.groupBy}`;
            dopAttr = g.label;
        } else if (dateArray.length > 366) {
            const g = this.sqlGroupByYear(col);
            groupByClause = `GROUP BY ${g.groupBy}`;
            dopAttr = g.label;
        }

        if (userId) {
            whereAddClause += `AND ${this.q('userId')} = '${userId}' `;
        }

        if (assistantId) {
            whereAddClause += `AND ${this.q('assistantId')} IN (${assistantId}) `;
        }

        if (source) {
            whereAddClause += `AND ${this.q('source')} = '${source}' `;
        }

        if (projectId !== undefined && projectId !== "") {
            whereAddClause += `AND ${this.q('projectId')} = ${Number(projectId)} `;
        }

        const costSumExpr = isRubTenant()
            ? `COALESCE(${this.q('amountCurrency')}, ${this.q('cost')})`
            : this.q('cost');
        const attrPeriodClause = `${dopAttr}, COUNT(*) as "allCount", SUM(${this.q('tokens')}) as "tokensCount", SUM(${this.q('duration')}) as "durationCount", SUM(${costSumExpr}) as "amount"`;
        const attrTotalClause = `COUNT(*) as "allCount", SUM(${this.q('tokens')}) as "allTokensCount", SUM(${this.q('duration')}) as "allDurationCount", SUM(${costSumExpr}) as "allCost"`;

        const requestPeriod = `SELECT ${attrPeriodClause} FROM ${tbl} ${whereClause} ${whereAddClause} ${groupByClause}`;
        const request = `SELECT ${attrTotalClause} FROM ${tbl} ${whereClause} ${whereAddClause}`;

        try {
            const chartData = await this.aiCdrRepository.sequelize.query(requestPeriod, {
                type: sequelize.QueryTypes.SELECT
            }) as GetDashboardDoneData[];

            const totalData = await this.aiCdrRepository.sequelize.query(request, {
                type: sequelize.QueryTypes.SELECT
            }) as GetDashboardAllData;

            const casksDashboardData: GetDashboardData = {
                chartData: chartData.map(d => ({
                    ...d,
                    allCount: Number(d.allCount) || 0,
                    tokensCount: Number(d.tokensCount) || 0,
                    durationCount: Number(d.durationCount) || 0,
                    amount: Number(d.amount) || 0,
                })) as GetDashboardDoneData[],
                allCount: Number(totalData[0]?.allCount) || 0,
                allTokensCount: Number(totalData[0]?.allTokensCount) || 0,
                allDurationCount: Number(totalData[0]?.allDurationCount) || 0,
                allCost: Number(totalData[0]?.allCost) || 0
            };

            return casksDashboardData;
        } catch (e) {
            throw new HttpException({ message: "[Dashboard]: Request error" } + e, HttpStatus.BAD_REQUEST);
        }
    }
}
