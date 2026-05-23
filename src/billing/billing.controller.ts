import { Controller, Get, Post, Query, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { BillingService } from './billing.service';
import { BillingRunwayService } from './billing-runway.service';
import { ClosingService } from '../accounting/closing.service';
import { Organization } from '../organizations/organizations.model';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GetBillingDto } from './dto/get-billing.dto';
import { BackfillFxDto } from './dto/backfill-fx.dto';
import { RunClosingDocumentsDto } from './dto/run-closing-documents.dto';
import { todayCalendarDateLocal } from '../shared/date/calendar-date';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
    constructor(
        private readonly billingService: BillingService,
        private readonly billingRunwayService: BillingRunwayService,
        private readonly closingService: ClosingService,
        @InjectModel(Organization) private readonly orgModel: typeof Organization,
    ) {}

    @ApiOperation({ summary: 'Get billing history with pagination' })
    @ApiResponse({ status: 200, description: 'Paginated billing records' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get()
    async getBillingHistory(@Query() query: GetBillingDto, @Req() req: any) {
        return this.billingService.getBillingHistory(
            query,
            req.isAdmin,
            req.vpbxUserId || req.tokenUserId,
        );
    }

    @ApiOperation({ summary: 'Backfill FX snapshot fields on legacy billing records (admin)' })
    @ApiResponse({ status: 200, description: 'Number of records updated' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('admin/backfill-fx')
    async backfillFx(@Query() query: BackfillFxDto) {
        return this.billingService.backfillFxSnapshots(5000, query.userId);
    }

    @ApiOperation({ summary: 'Run balance runway check now (admin, RU billing deployments)' })
    @ApiResponse({ status: 200, description: 'Processed tenant owners' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('admin/runway-check')
    async runRunwayCheck() {
        return this.billingRunwayService.runDailyCheck();
    }

    @ApiOperation({ summary: 'Run monthly closing UPD for one org (admin)' })
    @ApiResponse({ status: 200, description: 'Closing result' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('admin/run-closing-documents')
    async runClosingDocuments(@Query() query: RunClosingDocumentsDto) {
        const defaults = this.closingService.defaultPreviousMonthPeriod();
        const periodFrom = query.periodFrom || defaults.periodFrom;
        const periodTo = query.periodTo || defaults.periodTo;
        const documentDate = query.documentDate || todayCalendarDateLocal();
        const sendViaEdo = query.sendViaEdo === true;
        const dryRun = query.dryRun === true;

        if (!query.organizationId && !(dryRun && query.confirmAll)) {
            throw new HttpException(
                'organizationId is required (or dryRun with confirmAll=true)',
                HttpStatus.BAD_REQUEST,
            );
        }

        if (query.confirmAll && !dryRun) {
            throw new HttpException('confirmAll requires dryRun=true', HttpStatus.BAD_REQUEST);
        }

        if (query.confirmAll && dryRun) {
            const orgs = await this.orgModel.findAll();
            const results = [];
            for (const org of orgs) {
                results.push(
                    await this.closingService.closeForOrganization(org, {
                        periodFrom,
                        periodTo,
                        documentDate,
                        sendViaEdo: false,
                        dryRun: true,
                    }),
                );
            }
            return { results };
        }

        const org = await this.orgModel.findByPk(query.organizationId!);
        if (!org) {
            throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
        }

        return this.closingService.closeForOrganization(org, {
            periodFrom,
            periodTo,
            documentDate,
            sendViaEdo,
            dryRun,
        });
    }
}
