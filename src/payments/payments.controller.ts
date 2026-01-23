import { Body, Controller, Post, UseGuards, Req, Headers, HttpException, HttpStatus, RawBodyRequest } from '@nestjs/common';
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Payments } from "./payments.model";
import { PaymentsDto } from "./dto/payments.dto";
import { PaymentsService } from "./payments.service";
import { Request } from 'express';
import { Roles } from 'src/auth/roles-auth.decorator';
import { RolesGuard } from 'src/auth/roles.guard';

@Controller('payments')
export class PaymentsController {

    constructor(private paymentsService: PaymentsService) { }

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
        console.log(req.rawBody)
        return this.paymentsService.handleWebhook(signature, req.rawBody);
    }

}
