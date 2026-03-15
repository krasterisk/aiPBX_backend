import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GetBillingDto } from './dto/get-billing.dto';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
    constructor(private readonly billingService: BillingService) {}

    @ApiOperation({ summary: 'Get billing history with pagination' })
    @ApiResponse({ status: 200, description: 'Paginated billing records' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get()
    async getBillingHistory(@Query() query: GetBillingDto, @Req() req: any) {
        return this.billingService.getBillingHistory(
            query,
            req.isAdmin,
            req.tokenUserId,
        );
    }
}
