import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Prices } from "./prices.model";
import { CreatePriceDto } from "./dto/create-price.dto";
import { UpdatePriceDto } from "./dto/update-price.dto";
import { PricesService } from "./prices.service";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";

@ApiTags('Prices')
@Controller('prices')
@Roles('ADMIN')
@UseGuards(RolesGuard)
export class PricesController {

    constructor(private pricesService: PricesService) { }

    @ApiOperation({ summary: "Create price" })
    @ApiResponse({ status: 200, type: Prices })
    @Post()
    create(@Body() dto: CreatePriceDto) {
        return this.pricesService.create(dto);
    }

    @ApiOperation({ summary: "Get all prices" })
    @ApiResponse({ status: 200, type: [Prices] })
    @Get()
    findAll() {
        return this.pricesService.findAll();
    }

    @ApiOperation({ summary: "Get price by ID" })
    @ApiResponse({ status: 200, type: Prices })
    @Get(':id')
    findOne(@Param('id') id: number) {
        return this.pricesService.findOne(id);
    }

    @ApiOperation({ summary: "Update price" })
    @ApiResponse({ status: 200, type: Prices })
    @Put(':id')
    update(@Param('id') id: number, @Body() dto: UpdatePriceDto) {
        return this.pricesService.update(id, dto);
    }

    @ApiOperation({ summary: "Delete price" })
    @ApiResponse({ status: 200 })
    @Delete(':id')
    remove(@Param('id') id: number) {
        return this.pricesService.remove(id);
    }
}
