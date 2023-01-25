import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {CallbackService} from "./callback.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Callback} from "./callback.model";
import {CallbackDto} from "./dto/callback.dto";

@ApiTags('Callback')
@Controller('callback')
export class CallbackController {
    
    constructor(private callbackService: CallbackService) {}

    @ApiOperation({summary: "Вывести список контекстов"})
    @ApiResponse({status: 200, type: Callback})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.callbackService.getAll()
    }

    @ApiOperation({summary: "Get callback by id"})
    @ApiResponse({status: 200, type: [Callback]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.callbackService.getCallbackById(id)
    }

    @ApiOperation({summary: "Create new callback"})
    @ApiResponse({status: 200, type: Callback})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: CallbackDto) {
        return this.callbackService.create(dto)
    }

    @ApiOperation({summary: "Update callback"})
    @ApiResponse({status: 200, type: Callback})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: CallbackDto) {
        return this.callbackService.update(dto)
    }

    @ApiOperation({summary: "Delete callback"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.callbackService.delete(ids)
    }
}
