import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {WebhooksService} from "./webhooks.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Webhook} from "./webhook.model";
import {WebhookDto} from "./dto/webhook.dto";

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
    
    constructor(private webhookService: WebhooksService) {}

    @ApiOperation({summary: "Get webhooks list"})
    @ApiResponse({status: 200, type: Webhook})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.webhookService.getAll()
    }

    @ApiOperation({summary: "Get webhook by id"})
    @ApiResponse({status: 200, type: [Webhook]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.webhookService.getTimeGroupById(id)
    }

    @ApiOperation({summary: "Create new webhook"})
    @ApiResponse({status: 200, type: Webhook})
    //   @Roles('ADMIN')
//    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: WebhookDto) {
        return this.webhookService.create(dto)
    }

    @ApiOperation({summary: "Update webhook"})
    @ApiResponse({status: 200, type: Webhook})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: WebhookDto) {
        return this.webhookService.update(dto)
    }

    @ApiOperation({summary: "Delete webhook"})
    @ApiResponse({status: 200})
 //   @Roles('ADMIN')
 //   @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.webhookService.delete(ids)
    }
}
