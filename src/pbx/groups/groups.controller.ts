import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {GroupsService} from "./groups.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Group} from "./group.model";
import {GroupDto} from "./dto/group.dto";

@ApiTags('Ring groups')
@Controller('groups')
export class GroupsController {
    
    constructor(private groupService: GroupsService) {}
    
    @ApiOperation({summary: "Groups list"})
    @ApiResponse({status: 200, type: Group})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.groupService.getAll()
    }

    @ApiOperation({summary: "Get ring group by id"})
    @ApiResponse({status: 200, type: [Group]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.groupService.getGroupById(id)
    }

    @ApiOperation({summary: "Create new ring group"})
    @ApiResponse({status: 200, type: Group})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: GroupDto) {
        return this.groupService.create(dto)
    }

    @ApiOperation({summary: "Edit ring group"})
    @ApiResponse({status: 200, type: Group})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: GroupDto) {
        return this.groupService.update(dto)
    }

    @ApiOperation({summary: "Ring group delete"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.groupService.delete(ids)
    }
    
}
