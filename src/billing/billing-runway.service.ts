import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { existsSync } from 'fs';
import { join } from 'path';
import { User } from '../users/users.model';
import { Organization } from '../organizations/organizations.model';
import { BalanceThresholdAlert } from '../users/balance-threshold-alert.model';
import { BalanceRunwayNotification } from './balance-runway-notification.model';
import { BillingService } from './billing.service';
import { CurrencyService } from '../currency/currency.service';
import { MailerService } from '../mailer/mailer.service';
import { InvoiceService } from '../accounting/invoice.service';
import { isInvoiceBillingEnabled } from '../shared/tenant/invoice-billing-context';
import { isBalanceDepleted } from '../users/balance-notification.util';
import {
    calcDailyBurnUsd,
    calcDaysRemaining,
    calcRunwayInvoiceAmountRub,
    isBalanceRunwayEnabled,
    readBalanceRunwayConfig,
    shouldNotifyRunway,
} from './billing-runway.util';

@Injectable()
export class BillingRunwayService {
    private readonly logger = new Logger(BillingRunwayService.name);

    constructor(
        @InjectModel(User) private readonly usersRepo: typeof User,
        @InjectModel(Organization) private readonly orgRepo: typeof Organization,
        @InjectModel(BalanceThresholdAlert) private readonly alertRepo: typeof BalanceThresholdAlert,
        @InjectModel(BalanceRunwayNotification) private readonly runwayNotifyRepo: typeof BalanceRunwayNotification,
        private readonly billingService: BillingService,
        private readonly currencyService: CurrencyService,
        private readonly mailerService: MailerService,
        private readonly invoiceService: InvoiceService,
    ) {}

    async runDailyCheck(): Promise<{ processed: number; notified: number }> {
        if (!isBalanceRunwayEnabled()) {
            this.logger.log('Balance runway check skipped: BALANCE_RUNWAY_ENABLED is off');
            return { processed: 0, notified: 0 };
        }

        if (!isInvoiceBillingEnabled()) {
            this.logger.log('Balance runway check skipped: invoice billing not enabled for this deployment');
            return { processed: 0, notified: 0 };
        }

        const config = readBalanceRunwayConfig();
        const since = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);

        const owners = await this.usersRepo.findAll({
            where: { vpbx_user_id: null },
            attributes: ['id', 'email', 'balance'],
        });

        let notified = 0;

        for (const owner of owners) {
            try {
                const sent = await this.processOwner(owner, since, config);
                if (sent) notified += 1;
            } catch (e) {
                this.logger.warn(
                    `Runway check failed for owner #${owner.id}: ${(e as Error).message}`,
                );
            }
        }

        return { processed: owners.length, notified };
    }

    private async memberUserIds(ownerUserId: number): Promise<string[]> {
        const subs = await this.usersRepo.findAll({
            where: { vpbx_user_id: ownerUserId },
            attributes: ['id'],
        });
        return [String(ownerUserId), ...subs.map((u) => String(u.id))];
    }

    private async collectRecipientEmails(ownerUserId: number, ownerEmail?: string | null): Promise<string[]> {
        const alerts = await this.alertRepo.findAll({
            where: { ownerUserId },
            attributes: ['emails'],
        });
        const fromAlerts = alerts.flatMap((a) => a.emails || []);
        return [...new Set([ownerEmail, ...fromAlerts].filter(Boolean) as string[])].map((e) =>
            e.trim().toLowerCase(),
        );
    }

    private async resolveOrganizationId(ownerUserId: number): Promise<number | null> {
        const withInvoice = await this.alertRepo.findOne({
            where: {
                ownerUserId,
                sendInvoice: true,
                organizationId: { [Op.ne]: null },
            },
            order: [['id', 'ASC']],
        });
        if (withInvoice?.organizationId) {
            return withInvoice.organizationId;
        }
        const org = await this.orgRepo.findOne({
            where: { userId: ownerUserId },
            order: [['id', 'ASC']],
            attributes: ['id'],
        });
        return org?.id ?? null;
    }

    private async processOwner(
        owner: User,
        since: Date,
        config: ReturnType<typeof readBalanceRunwayConfig>,
    ): Promise<boolean> {
        const ownerId = Number(owner.id);
        const balanceUsd = Number(owner.balance) || 0;
        if (isBalanceDepleted(balanceUsd)) {
            return false;
        }

        const members = await this.memberUserIds(ownerId);
        const spendUsd = await this.billingService.sumTenantSpendUsd(members, since);
        const dailyBurnUsd = calcDailyBurnUsd(spendUsd, config.lookbackDays);
        const daysLeft = calcDaysRemaining(balanceUsd, dailyBurnUsd);

        if (daysLeft == null || daysLeft > config.alertDays) {
            return false;
        }

        const last = await this.runwayNotifyRepo.findByPk(ownerId);
        if (!shouldNotifyRunway(daysLeft, config, last)) {
            return false;
        }

        const recipients = await this.collectRecipientEmails(ownerId, owner.email);
        if (!recipients.length) {
            return false;
        }

        let invoiceAttachment: { filename: string; path: string; invoiceNumber: string } | undefined;

        const organizationId = await this.resolveOrganizationId(ownerId);
        if (organizationId) {
            try {
                const converted = await this.currencyService.convertFromUsd(dailyBurnUsd, 'RUB');
                const amountRub = calcRunwayInvoiceAmountRub(converted.amount);
                if (amountRub > 0) {
                    const issued = await this.invoiceService.issueInvoice({
                        userId: ownerId,
                        organizationId,
                        amountRub,
                        sendViaEdo: false,
                    });
                    const absPath = join(process.cwd(), 'static', issued.pdfRelativePath);
                    if (existsSync(absPath)) {
                        const safeNumber = issued.number.replace(/[^\w.-]+/g, '_');
                        invoiceAttachment = {
                            path: absPath,
                            filename: `Schet_${safeNumber}.pdf`,
                            invoiceNumber: issued.number,
                        };
                    }
                }
            } catch (e) {
                this.logger.warn(
                    `Runway auto-invoice for owner #${ownerId} failed: ${(e as Error).message}`,
                );
            }
        }

        await this.mailerService.sendBalanceRunwayNotification(
            recipients,
            {
                balanceUsd,
                daysLeft,
                alertDays: config.alertDays,
                lookbackDays: config.lookbackDays,
                dailyBurnUsd,
            },
            invoiceAttachment,
        );

        await this.runwayNotifyRepo.upsert({
            ownerUserId: ownerId,
            lastNotifiedAt: new Date(),
            lastForecastDays: daysLeft,
            lastDailyBurnUsd: dailyBurnUsd,
        });

        return true;
    }
}
