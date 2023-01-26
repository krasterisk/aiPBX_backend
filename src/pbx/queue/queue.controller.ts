import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {QueueService} from "./queue.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Queue} from "./queue.model";
import {QueueDto} from "./dto/queue.dto";

@ApiTags('Queues')
@Controller('queue')
export class QueueController {
    
    constructor(private queueService: QueueService) {}

    @ApiOperation({summary: "Get queues list"})
    @ApiResponse({status: 200, type: Queue})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.queueService.getAll()
    }

    @ApiOperation({summary: "Get queue by id"})
    @ApiResponse({status: 200, type: [Queue]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.queueService.getQueueById(id)
    }

    @ApiOperation({summary: "Create new queue"})
    @ApiResponse({status: 200, type: Queue})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: QueueDto) {
        return this.queueService.create(dto)
    }

    @ApiOperation({summary: "Update queue"})
    @ApiResponse({status: 200, type: Queue})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: QueueDto) {
        return this.queueService.update(dto)
    }

    @ApiOperation({summary: "Delete queue"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.queueService.delete(ids)
    }
}
