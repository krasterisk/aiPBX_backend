import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OperatorProject } from './operator-project.model';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { MailerService } from '../mailer/mailer.service';
import { TelegramService } from '../telegram/telegram.service';
import { usesRussianMailLocale } from '../mailer/mailer-locale';
import { isRubTenant } from '../shared/tenant/tenant-currency';
import { normalizeDigestConfig, type DigestConfig } from './interfaces/digest-config.interface';
import { canSendManualDigest, isDigestDue } from './lib/digest-eligibility';
import { resolveDigestReportWindow } from './lib/digest-window';
import { renderDonutChart, renderHorizontalBars, type DigestChartPng } from './lib/digest-charts';
import {
    buildDigestMail,
    buildDigestTelegramCaption,
    type DigestMailPayload,
} from './lib/digest-mail.templates';
import { buildBillingMailAttachments } from '../mailer/billing-mail.attachments';
import type { DefaultMetricKey } from './interfaces/operator-metrics.interface';

const METRIC_LABELS_RU: Record<string, string> = {
    greeting_quality: 'Приветствие',
    script_compliance: 'Скрипт',
    politeness_empathy: 'Вежливость',
    active_listening: 'Слушание',
    objection_handling: 'Возражения',
    product_knowledge: 'Продукт',
    problem_resolution: 'Решение',
    speech_clarity_pace: 'Речь',
    closing_quality: 'Закрытие',
};

const METRIC_LABELS_EN: Record<string, string> = {
    greeting_quality: 'Greeting',
    script_compliance: 'Script',
    politeness_empathy: 'Politeness',
    active_listening: 'Listening',
    objection_handling: 'Objections',
    product_knowledge: 'Product',
    problem_resolution: 'Resolution',
    speech_clarity_pace: 'Speech',
    closing_quality: 'Closing',
};

@Injectable()
export class OperatorDigestService {
    private readonly logger = new Logger(OperatorDigestService.name);

    constructor(
        @InjectModel(OperatorProject) private readonly projectRepository: typeof OperatorProject,
        private readonly analyticsService: OperatorAnalyticsService,
        private readonly mailerService: MailerService,
        private readonly telegramService: TelegramService,
    ) {}

    async runScheduledDigests(): Promise<{ checked: number; sent: number }> {
        const projects = await this.projectRepository.findAll();
        let checked = 0;
        let sent = 0;
        for (const project of projects) {
            const config = normalizeDigestConfig(project.digestConfig);
            if (!config.enabled) continue;
            checked++;
            if (!isDigestDue(config)) continue;
            try {
                await this.sendForProject(project, config, 'scheduled');
                sent++;
            } catch (e) {
                this.logger.error(
                    `Scheduled digest failed for project #${project.id}: ${(e as Error).message}`,
                );
            }
        }
        return { checked, sent };
    }

    async sendManual(
        projectId: number,
        userId: string,
        isAdmin: boolean,
    ): Promise<{ ok: true; emailed: number; telegram: number }> {
        const project = await this.projectRepository.findOne({
            where: isAdmin ? { id: projectId } : { id: projectId, userId },
        });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);

        const config = normalizeDigestConfig(project.digestConfig);
        const gate = canSendManualDigest(config);
        if (gate.ok === false) {
            throw new HttpException(gate.reason, HttpStatus.BAD_REQUEST);
        }

        return this.sendForProject(project, config, 'manual');
    }

    private async sendForProject(
        project: OperatorProject,
        config: DigestConfig,
        mode: 'manual' | 'scheduled',
    ): Promise<{ ok: true; emailed: number; telegram: number }> {
        const isRu = usesRussianMailLocale();
        const range = resolveDigestReportWindow(config.reportWindow, new Date(), undefined, isRu);
        const ownerId = project.userId;

        const dashboard = await this.analyticsService.getDashboard(
            {
                projectId: project.id,
                startDate: range.startDate,
                endDate: range.endDate,
            },
            false,
            ownerId,
        );

        const charts = await this.buildCharts(dashboard, project.visibleDefaultMetrics || [], isRu);
        const payload = this.buildPayload(project, dashboard, range, charts);
        const mail = buildDigestMail(payload);

        let emailed = 0;
        let telegram = 0;

        const mailAttachments = [
            ...buildBillingMailAttachments(),
            ...charts.map(c => ({
                filename: c.filename,
                content: c.buffer,
                cid: c.cid,
            })),
        ];

        for (const email of config.emails) {
            try {
                await this.mailerService.sendAnalyticsDigestMail(
                    email,
                    mail.subject,
                    mail.html,
                    mail.text,
                    mailAttachments,
                );
                emailed++;
            } catch (e) {
                this.logger.error(`Digest email to ${email} failed: ${(e as Error).message}`);
            }
        }

        const caption = buildDigestTelegramCaption(payload);
        for (const chatId of config.telegramChatIds) {
            try {
                await this.telegramService.sendMessage(caption, { parse_mode: 'HTML' }, chatId);
                for (const chart of charts) {
                    await this.telegramService.sendPhoto(chatId, chart.buffer, chart.caption);
                }
                telegram++;
            } catch (e) {
                this.logger.error(`Digest Telegram to ${chatId} failed: ${(e as Error).message}`);
            }
        }

        if (emailed === 0 && telegram === 0) {
            throw new HttpException('Failed to deliver digest to any recipient', HttpStatus.BAD_GATEWAY);
        }

        const nowIso = new Date().toISOString();
        const nextConfig: DigestConfig = {
            ...config,
            lastSentAt: mode === 'scheduled' ? nowIso : (config.lastSentAt ?? null),
            lastManualSentAt: mode === 'manual' ? nowIso : (config.lastManualSentAt ?? null),
        };
        if (mode === 'scheduled') {
            nextConfig.lastSentAt = nowIso;
        }
        project.digestConfig = nextConfig;
        await project.save();

        this.logger.log(
            `Digest ${mode} project #${project.id}: emailed=${emailed} telegram=${telegram}`,
        );
        return { ok: true, emailed, telegram };
    }

    private buildPayload(
        project: OperatorProject,
        dashboard: any,
        range: { startDate: string; endDate: string; label: string },
        charts: DigestChartPng[],
    ): DigestMailPayload {
        const scorecards = Array.isArray(dashboard.agentScorecards) ? dashboard.agentScorecards : [];
        const sorted = [...scorecards].sort(
            (a, b) => (Number(b.averageScore) || 0) - (Number(a.averageScore) || 0),
        );
        const mapOp = (o: any) => ({
            name: String(o.operatorName || '—'),
            calls: Number(o.callsCount) || 0,
            score: Number(o.averageScore) || 0,
            successRate: Number(o.successRate) || 0,
        });
        const topOperators = sorted.slice(0, 5).map(mapOp);
        const bottomOperators = [...sorted].reverse().slice(0, 5).map(mapOp);

        const tags = Array.isArray(dashboard.tagStats) ? dashboard.tagStats : [];
        const topTags = [...tags]
            .sort((a, b) => (Number(b.callsCount) || 0) - (Number(a.callsCount) || 0))
            .slice(0, 5)
            .map((t: any) => ({
                name: String(t.name || t.tagId || '—'),
                calls: Number(t.callsCount) || 0,
                score: Number(t.averageScore) || 0,
            }));

        const base = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://app.aipbx.ru')
            .replace(/\/+$/, '');
        const dashboardUrl = `${base}/dashboard/call-records?projectId=${project.id}&startDate=${range.startDate}&endDate=${range.endDate}`;

        return {
            projectName: project.name,
            periodLabel: range.label,
            dashboardUrl,
            kpis: {
                totalCalls: Number(dashboard.totalAnalyzed) || 0,
                averageScore: Number(dashboard.averageScore) || 0,
                averageDurationSec: Number(dashboard.averageDuration) || 0,
                successRate: Number(dashboard.successRate) || 0,
                totalCost: Number(dashboard.totalCost) || 0,
                costLabel: isRubTenant() ? (usesRussianMailLocale() ? 'Затраты, ₽' : 'Cost, RUB') : (usesRussianMailLocale() ? 'Затраты, $' : 'Cost, USD'),
            },
            topOperators,
            bottomOperators: bottomOperators.filter(b => !topOperators.some(t => t.name === b.name) || sorted.length <= 5),
            topTags,
            charts,
        };
    }

    private async buildCharts(
        dashboard: any,
        visible: DefaultMetricKey[],
        isRu: boolean,
    ): Promise<DigestChartPng[]> {
        const charts: DigestChartPng[] = [];
        const sentiment = dashboard.sentimentDistribution || { positive: 0, neutral: 0, negative: 0 };
        charts.push(await renderDonutChart(
            isRu ? 'Настроение клиентов' : 'Customer sentiment',
            [
                { label: isRu ? 'Позитив' : 'Positive', value: Number(sentiment.positive) || 0, color: '#10b981' },
                { label: isRu ? 'Нейтрал' : 'Neutral', value: Number(sentiment.neutral) || 0, color: '#94a3b8' },
                { label: isRu ? 'Негатив' : 'Negative', value: Number(sentiment.negative) || 0, color: '#ef4444' },
            ],
            { filename: 'sentiment.png', cid: 'digest-sentiment' },
        ));

        const successRate = Number(dashboard.successRate) || 0;
        charts.push(await renderDonutChart(
            isRu ? 'Успешность звонков' : 'Call success',
            [
                { label: isRu ? 'Успех' : 'Success', value: successRate, color: '#10b981' },
                { label: isRu ? 'Неуспех' : 'Fail', value: Math.max(0, 100 - successRate), color: '#ef4444' },
            ],
            { filename: 'success.png', cid: 'digest-success' },
        ));

        const metrics = dashboard.aggregatedMetrics || {};
        const labels = isRu ? METRIC_LABELS_RU : METRIC_LABELS_EN;
        const metricKeys = (visible.length ? visible : Object.keys(labels)).filter(k => labels[k]);
        const metricBars = metricKeys.map(k => ({
            label: labels[k] || k,
            value: Number(metrics[k]) || 0,
            color: '#0EA5E9',
        }));
        if (metricBars.some(b => b.value > 0)) {
            charts.push(await renderHorizontalBars(
                isRu ? 'Метрики качества' : 'Quality metrics',
                metricBars,
                { filename: 'metrics.png', cid: 'digest-metrics', maxValue: 100 },
            ));
        }

        const scorecards = Array.isArray(dashboard.agentScorecards) ? dashboard.agentScorecards : [];
        const top = [...scorecards]
            .sort((a, b) => (Number(b.averageScore) || 0) - (Number(a.averageScore) || 0))
            .slice(0, 8)
            .map((o: any) => ({
                label: String(o.operatorName || '—'),
                value: Number(o.averageScore) || 0,
                color: '#8B5CF6',
            }));
        if (top.length) {
            charts.push(await renderHorizontalBars(
                isRu ? 'Рейтинг операторов' : 'Operator ranking',
                top,
                { filename: 'operators.png', cid: 'digest-operators', maxValue: 100 },
            ));
        }

        return charts;
    }
}
