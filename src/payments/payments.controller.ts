import {Body, Controller, Post, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Payments} from "./payments.model";
import {PaymentsDto} from "./dto/payments.dto";
import {PaymentsService} from "./payments.service";

@Controller('payments')
export class PaymentsController {

    constructor(private paymentsService: PaymentsService) {}


    @ApiOperation({summary: "Create payment"})
    @ApiResponse({status: 200, type: Payments})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: PaymentsDto[]) {
        return this.paymentsService.create(dto)
    }

}
