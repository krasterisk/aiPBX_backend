import {Controller, Get, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Payments} from "../payments/payments.model";
import {CurrencyService} from "./currency.service";

    @Controller('currency')
export class CurrencyController {
    constructor(private currencyService: CurrencyService) {}

    @ApiOperation({summary: "Create payment"})
    @ApiResponse({status: 200, type: Payments})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    update() {
        return this.currencyService.updateRates()
    }
}
