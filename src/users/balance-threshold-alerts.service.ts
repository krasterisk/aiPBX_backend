import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { existsSync } from 'fs';
import { join } from 'path';
import { BalanceThresholdAlert, type InvoiceAmountMode } from './balance-threshold-alert.model';
import { User } from './users.model';
import { Organization } from '../organizations/organizations.model';
import { BillingRecord } from '../billing/billing-record.model';
import { CurrencyService } from '../currency/currency.service';
import { MailerService } from '../mailer/mailer.service';
import { InvoiceService } from '../accounting/invoice.service';
import {
    CreateBalanceThresholdAlertDto,
    UpdateBalanceThresholdAlertDto,
} from './dto/balance-threshold-alert.dto';
import { roundUpToNearest50Rub, sumTenantSpendLast30DaysRub } from './balance-alert-billing.util';
import { isBalanceDepleted } from './balance-notification.util';
import { isInvoiceBillingEnabled } from '../shared/tenant/invoice-billing-context';

@Injectable()
export class BalanceThresholdAlertsService {
    private readonly logger = new Logger(BalanceThresholdAlertsService.name);

    constructor(
        @InjectModel(BalanceThresholdAlert) private readonly alertRepo: typeof BalanceThresholdAlert,
        @InjectModel(User) private readonly usersRepo: typeof User,
        @InjectModel(Organization) private readonly orgRepo: typeof Organization,
        @InjectModel(BillingRecord) private readonly billingRecordRepo: typeof BillingRecord,
        private readonly currencyService: CurrencyService,
        private readonly mailerService: MailerService,
        private readonly invoiceService: InvoiceService,
    ) {}

    async listForOwner(ownerUserId: number): Promise<BalanceThresholdAlert[]> {
        return this.alertRepo.findAll({
            where: { ownerUserId },
            order: [['limitAmount', 'ASC']],
        });
    }

    async getTenantMembers(ownerUserId: number): Promise<User[]> {
        const owner = await this.usersRepo.findByPk(ownerUserId, {
            attributes: {
                exclude: [
                    'password',
                    'activationCode',
                    'resetPasswordLink',
                    'googleId',
                    'telegramId',
                    'activationExpires',
                    'isActivated',
                ],
            },
        });
        if (!owner) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        const subs = await this.usersRepo.findAll({
            where: { vpbx_user_id: ownerUserId },
            attributes: {
                exclude: [
                    'password',
                    'activationCode',
                    'resetPasswordLink',
                    'googleId',
                    'telegramId',
                    'activationExpires',
                    'isActivated',
                ],
            },
        });
        return [owner, ...subs];
    }

    private normalizeEmails(emails: string[]): string[] {
        return [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    }

    private async validateInvoiceOptions(
        ownerUserId: number,
        dto: { sendInvoice?: boolean; organizationId?: number; invoiceAmountMode?: InvoiceAmountMode; invoiceAmountRub?: number | null },
    ): Promise<void> {
        if (!dto.sendInvoice) return;

        if (!dto.organizationId) {
            throw new HttpException('organizationId is required when sendInvoice is enabled', HttpStatus.BAD_REQUEST);
        }

        const org = await this.orgRepo.findOne({
            where: { id: dto.organizationId, userId: ownerUserId },
        });
        if (!org) {
            throw new HttpException('Organization not found for this tenant', HttpStatus.NOT_FOUND);
        }

        const mode = dto.invoiceAmountMode || 'fixed';
        if (mode === 'fixed' && (!dto.invoiceAmountRub || dto.invoiceAmountRub <= 0)) {
            throw new HttpException('invoiceAmountRub must be positive for fixed amount', HttpStatus.BAD_REQUEST);
        }
    }

    async create(ownerUserId: number, dto: CreateBalanceThresholdAlertDto): Promise<BalanceThresholdAlert> {
        await this.validateInvoiceOptions(ownerUserId, dto);

        return this.alertRepo.create({
            ownerUserId,
            limitAmount: dto.limitAmount,
            emails: this.normalizeEmails(dto.emails),
            notifyUserIds: dto.notifyUserIds ?? [],
            sendInvoice: !!dto.sendInvoice,
            organizationId: dto.sendInvoice ? dto.organizationId ?? null : null,
            invoiceAmountMode: dto.invoiceAmountMode ?? 'fixed',
            invoiceAmountRub: dto.invoiceAmountRub ?? null,
            sendViaEdo: !!dto.sendViaEdo,
        });
    }

    async update(
        alertId: number,
        ownerUserId: number,
        dto: UpdateBalanceThresholdAlertDto,
    ): Promise<BalanceThresholdAlert> {
        const alert = await this.alertRepo.findOne({ where: { id: alertId, ownerUserId } });
        if (!alert) {
            throw new HttpException('Alert not found', HttpStatus.NOT_FOUND);
        }

        const merged = {
            sendInvoice: dto.sendInvoice ?? alert.sendInvoice,
            organizationId: dto.organizationId !== undefined ? dto.organizationId ?? undefined : alert.organizationId ?? undefined,
            invoiceAmountMode: dto.invoiceAmountMode ?? alert.invoiceAmountMode,
            invoiceAmountRub: dto.invoiceAmountRub !== undefined ? dto.invoiceAmountRub : alert.invoiceAmountRub,
        };
        await this.validateInvoiceOptions(ownerUserId, merged);

        await alert.update({
            ...(dto.limitAmount !== undefined ? { limitAmount: dto.limitAmount } : {}),
            ...(dto.emails !== undefined ? { emails: this.normalizeEmails(dto.emails) } : {}),
            ...(dto.notifyUserIds !== undefined ? { notifyUserIds: dto.notifyUserIds } : {}),
            ...(dto.sendInvoice !== undefined ? { sendInvoice: dto.sendInvoice } : {}),
            ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
            ...(dto.invoiceAmountMode !== undefined ? { invoiceAmountMode: dto.invoiceAmountMode } : {}),
            ...(dto.invoiceAmountRub !== undefined ? { invoiceAmountRub: dto.invoiceAmountRub } : {}),
            ...(dto.sendViaEdo !== undefined ? { sendViaEdo: dto.sendViaEdo } : {}),
        });

        return alert;
    }

    async remove(alertId: number, ownerUserId: number): Promise<void> {
        const deleted = await this.alertRepo.destroy({ where: { id: alertId, ownerUserId } });
        if (!deleted) {
            throw new HttpException('Alert not found', HttpStatus.NOT_FOUND);
        }
    }

    private async memberUserIds(ownerUserId: number): Promise<string[]> {
        const subs = await this.usersRepo.findAll({
            where: { vpbx_user_id: ownerUserId },
            attributes: ['id'],
        });
        return [String(ownerUserId), ...subs.map((u) => String(u.id))];
    }

    async resolveInvoiceAmountRub(alert: BalanceThresholdAlert): Promise<number> {
        if (alert.invoiceAmountMode === 'average_monthly') {
            const members = await this.memberUserIds(alert.ownerUserId);
            const sum = await sumTenantSpendLast30DaysRub(
                this.billingRecordRepo,
                this.currencyService,
                alert.ownerUserId,
                members,
            );
            return roundUpToNearest50Rub(sum);
        }
        const fixed = Number(alert.invoiceAmountRub) || 0;
        return fixed > 0 ? fixed : 50;
    }

    async processBalanceCrossing(
        ownerUserId: number,
        oldBalance: number,
        newBalance: number,
        hostHeader?: string,
    ): Promise<void> {
        if (isBalanceDepleted(newBalance) || isBalanceDepleted(oldBalance)) {
            return;
        }

        const alerts = await this.alertRepo.findAll({ where: { ownerUserId } });
        if (!alerts.length) return;

        for (const alert of alerts) {
            if (oldBalance < alert.limitAmount || newBalance >= alert.limitAmount) {
                continue;
            }

            const emails = alert.emails?.length ? alert.emails : [];

            let invoiceAttachment: { filename: string; path: string; invoiceNumber: string } | undefined;

            if (isInvoiceBillingEnabled() && alert.sendInvoice && alert.organizationId) {
                try {
                    const amountRub = await this.resolveInvoiceAmountRub(alert);
                    if (amountRub > 0) {
                        const issued = await this.invoiceService.issueInvoice(
                            {
                                userId: alert.ownerUserId,
                                organizationId: alert.organizationId,
                                amountRub,
                                sendViaEdo: alert.sendViaEdo,
                            },
                            hostHeader,
                        );
                        const absPath = join(process.cwd(), 'static', issued.pdfRelativePath);
                        if (existsSync(absPath)) {
                            const safeNumber = issued.number.replace(/[^\w.-]+/g, '_');
                            invoiceAttachment = {
                                path: absPath,
                                filename: `Schet_${safeNumber}.pdf`,
                                invoiceNumber: issued.number,
                            };
                        } else {
                            this.logger.warn(
                                `Auto-invoice PDF missing for alert #${alert.id}: ${absPath}`,
                            );
                        }
                    }
                } catch (e) {
                    this.logger.warn(
                        `Auto-invoice for alert #${alert.id} failed: ${(e as Error).message}`,
                    );
                }
            }

            if (emails.length) {
                await this.mailerService.sendLowBalanceNotification(
                    emails,
                    newBalance,
                    alert.limitAmount,
                    invoiceAttachment,
                );
            }

            await alert.update({ lastTriggeredAt: new Date() });
        }
    }

    async enrichEmailsFromUserIds(userIds: number[], emails: string[]): Promise<string[]> {
        if (!userIds.length) return this.normalizeEmails(emails);
        const users = await this.usersRepo.findAll({
            where: { id: { [Op.in]: userIds } },
            attributes: ['email'],
        });
        const fromUsers = users.map((u) => u.email).filter(Boolean) as string[];
        return this.normalizeEmails([...emails, ...fromUsers]);
    }
}
