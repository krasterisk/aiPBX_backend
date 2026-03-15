import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Prices } from "./prices.model";
import { CreatePriceDto } from "./dto/create-price.dto";
import { UpdatePriceDto } from "./dto/update-price.dto";
import { PricesService } from "./prices.service";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UsersService } from "../users/users.service";
import { CurrencyService } from "../currency/currency.service";

@ApiTags('Prices')
@Controller('prices')
export class PricesController {

    constructor(
        private pricesService: PricesService,
        private usersService: UsersService,
        private currencyService: CurrencyService,
    ) { }

    @ApiOperation({ summary: "Get public prices (admin rates) in specified currency" })
    @ApiResponse({ status: 200, type: Prices })
    @ApiQuery({ name: 'currency', required: false, description: 'Currency code (e.g. RUB, EUR). Defaults to USD' })
    @Get('public')
    async getPublicPrices(@Query('currency') currency?: string) {
        const adminEmail = process.env.ADMIN_EMAIL;
        if (!adminEmail) {
            throw new HttpException('ADMIN_EMAIL is not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const adminUser = await this.usersService.getCandidateByEmail(adminEmail);
        if (!adminUser) {
            throw new HttpException('Admin user not found', HttpStatus.NOT_FOUND);
        }

        const price = await this.pricesService.findByUserId(adminUser.id);
        const rate = await this.currencyService.getRate(currency || 'USD');
        const currencyCode = (currency || 'USD').toUpperCase();

        return {
            realtime: Math.round(price.realtime * rate * 100) / 100,
            text: Math.round(price.text * rate * 100) / 100,
            analytic: Math.round(price.analytic * rate * 100) / 100,
            stt: Math.round(price.stt * rate * 10000) / 10000,
            currency: currencyCode,
            rate,
        };
    }

    @ApiOperation({ summary: "Create price" })
    @ApiResponse({ status: 200, type: Prices })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: CreatePriceDto) {
        return this.pricesService.create(dto);
    }

    @ApiOperation({ summary: "Get all prices" })
    @ApiResponse({ status: 200, type: [Prices] })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get()
    findAll() {
        return this.pricesService.findAll();
    }

    @ApiOperation({ summary: "Get price by ID" })
    @ApiResponse({ status: 200, type: Prices })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get(':id')
    findOne(@Param('id') id: number) {
        return this.pricesService.findOne(id);
    }

    @ApiOperation({ summary: "Update price" })
    @ApiResponse({ status: 200, type: Prices })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put(':id')
    update(@Param('id') id: number, @Body() dto: UpdatePriceDto) {
        return this.pricesService.update(id, dto);
    }

    @ApiOperation({ summary: "Delete price" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete(':id')
    remove(@Param('id') id: number) {
        return this.pricesService.remove(id);
    }
}
