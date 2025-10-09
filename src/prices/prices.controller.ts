import {Body, Controller, Post, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Prices} from "./prices.model";
import {PricesDto} from "./dto/pices.dto";
import {PricesService} from "./prices.service";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";

@Controller('prices')
export class PricesController {

    constructor(private pricesService: PricesService) {}


    @ApiOperation({summary: "Create price"})
    @ApiResponse({status: 200, type: Prices})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: PricesDto[]) {
        return this.pricesService.create(dto)
    }

}
