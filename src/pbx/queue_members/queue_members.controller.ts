import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {QueueMembersService} from "./queue_members.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {QueueMemberDto} from "./dto/queue_member.dto";
import {QueueMembers} from "./queue_members.model";

@ApiTags('Queue members')
@Controller('queue-member')
export class QueueMembersController {
    
    constructor(private queueMembersService: QueueMembersService) {}

    @ApiOperation({summary: "Get queueMembers list"})
    @ApiResponse({status: 200, type: QueueMembersService})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.queueMembersService.getAll()
    }

    @ApiOperation({summary: "Get queueMember by id"})
    @ApiResponse({status: 200, type: [QueueMembers]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.queueMembersService.getQueueMemberById(id)
    }

    @ApiOperation({summary: "Create new queueMember"})
    @ApiResponse({status: 200, type: QueueMembers})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: QueueMemberDto) {
        return this.queueMembersService.create(dto)
    }

    @ApiOperation({summary: "Update queueMember"})
    @ApiResponse({status: 200, type: QueueMembers})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: QueueMemberDto) {
        return this.queueMembersService.update(dto)
    }

    @ApiOperation({summary: "Delete queueMember"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.queueMembersService.delete(ids)
    }


}
