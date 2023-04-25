import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {NotificationsService} from "./notifications.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {Notifications} from "./notifications.model";
import {NotificationsDto} from "./dto/notifications.dto";

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {

    constructor(private notificationsService: NotificationsService) {}

    @ApiOperation({summary: "Вывести список контекстов"})
    @ApiResponse({status: 200, type: Notifications})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.notificationsService.getAll()
    }

    @ApiOperation({summary: "Get notifications by id"})
    @ApiResponse({status: 200, type: [Notifications]})
    //   @Roles('ADMIN','USER')
    //    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.notificationsService.getNotificationsById(id)
    }

    @ApiOperation({summary: "Create new notifications"})
    @ApiResponse({status: 200, type: Notifications})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: NotificationsDto) {
        return this.notificationsService.create(dto)
    }

    @ApiOperation({summary: "Update notifications"})
    @ApiResponse({status: 200, type: Notifications})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: NotificationsDto) {
        return this.notificationsService.update(dto)
    }

    @ApiOperation({summary: "Delete notifications"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.notificationsService.delete(ids)
    }


}
