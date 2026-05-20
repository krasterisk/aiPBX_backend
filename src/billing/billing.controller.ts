import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { BillingRunwayService } from './billing-runway.service';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GetBillingDto } from './dto/get-billing.dto';
import { BackfillFxDto } from './dto/backfill-fx.dto';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
    constructor(
        private readonly billingService: BillingService,
        private readonly billingRunwayService: BillingRunwayService,
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
}
