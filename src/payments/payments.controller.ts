import { Body, Controller, Post, UseGuards, Req, Headers, HttpException, HttpStatus, RawBodyRequest, Get, Query, Res, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Payments } from "./payments.model";
import { PaymentsDto } from "./dto/payments.dto";
import { PaymentsService } from "./payments.service";
import { Request, Response } from 'express';
import { Roles } from 'src/auth/roles-auth.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { GetPaymentsDto } from './dto/get-payments.dto';
import { CreateRobokassaPaymentDto } from './dto/create-robokassa-payment.dto';
import { ConfigService } from '@nestjs/config';

@Controller('payments')
export class PaymentsController {

    constructor(
        private paymentsService: PaymentsService,
        private configService: ConfigService,
    ) { }

    @ApiOperation({ summary: "Get user payment history" })
    @ApiResponse({ status: 200, type: [Payments] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get()
    getUserPayments(@Req() req: any, @Query() query: GetPaymentsDto) {
        return this.paymentsService.getUserPayments(
            req.tokenUserId,
            Number(query.page),
            Number(query.limit)
        );
    }

    @ApiOperation({ summary: "Create payment (Manual)" })
    @ApiResponse({ status: 200, type: Payments })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    // @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: PaymentsDto[]) {
        return this.paymentsService.create(dto)
    }

    @ApiOperation({ summary: "Create Stripe Payment Intent" })
    @Post('create-intent')
    createIntent(@Body() dto: { userId: string, amount: number, currency?: string }) {
        return this.paymentsService.createStripePaymentIntent(dto.userId, dto.amount, dto.currency || 'usd');
    }

    @ApiOperation({ summary: "Stripe Webhook" })
    @Post('webhook')
    async webhook(@Headers('stripe-signature') signature: string, @Req() req: RawBodyRequest<Request>) {
        if (!signature) {
            throw new HttpException('Missing stripe-signature header', HttpStatus.BAD_REQUEST);
        }
        return this.paymentsService.handleWebhook(signature, req.rawBody);
    }

    // ========================
    // Robokassa Endpoints
    // ========================

    @ApiOperation({ summary: "Create Robokassa payment" })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('robokassa/create')
    createRobokassaPayment(@Req() req: any, @Body() dto: CreateRobokassaPaymentDto) {
        return this.paymentsService.createRobokassaPayment(req.tokenUserId, dto.amount, dto.description);
    }

    @ApiOperation({ summary: "Robokassa Result URL callback (server-to-server)" })
    @Post('robokassa/result')
    async robokassaResult(@Body() body: any) {
        const result = await this.paymentsService.handleRobokassaResult(
            body.OutSum,
            Number(body.InvId),
            body.SignatureValue,
            body.Shp_userId,
        );
        return result; // Plain text: OK{InvId}
    }

    @ApiOperation({ summary: "Robokassa Success redirect" })
    @Get('robokassa/success')
    robokassaSuccess(@Query() query: any, @Res() res: Response) {
        const clientUrl = this.configService.get<string>('CLIENT_URL');
        const invId = query.InvId || '';
        res.redirect(`${clientUrl}/billing?provider=robokassa&status=success&InvId=${invId}`);
    }

    @ApiOperation({ summary: "Robokassa Fail redirect" })
    @Get('robokassa/fail')
    robokassaFail(@Query() query: any, @Res() res: Response) {
        const clientUrl = this.configService.get<string>('CLIENT_URL');
        const invId = query.InvId || '';
        res.redirect(`${clientUrl}/billing?provider=robokassa&status=fail&InvId=${invId}`);
    }

    @ApiOperation({ summary: "Get Robokassa payment status" })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('robokassa/status/:invId')
    getRobokassaStatus(@Param('invId') invId: string, @Req() req: any) {
        return this.paymentsService.getRobokassaPaymentStatus(Number(invId), req.tokenUserId);
    }

}

