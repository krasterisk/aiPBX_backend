import {Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {EndpointGroupsService} from "./endpoint-groups.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {EndpointGroups} from "./endpoint-groups.model";
import {EndpointGroupsDto} from "./dto/endpoint-groups.dto";
import {GetContextsDto} from "../contexts/dto/getContexts.dto";

@ApiTags('Endpoints')
@Controller('endpoints-groups')
export class EndpointGroupsController {

    constructor(private endpointGroupsService: EndpointGroupsService) {}

    @ApiOperation({summary: "Get all endpoints groups"})
    @ApiResponse({status: 200, type: [EndpointGroups]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get()
    getAll() {
        return this.endpointGroupsService.getAll()
    }

    @ApiOperation({summary: "Get all endpoints groups"})
    @ApiResponse({status: 200, type: [EndpointGroups]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('page')
    get(@Query() query: GetContextsDto ) {
        try {
            return this.endpointGroupsService.getPage(query)
        } catch (e) {
                console.log(e)
        }
    }


    @ApiOperation({summary: "Get endpoints group by id"})
    @ApiResponse({status: 200, type: [EndpointGroups]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: string) {
        return this.endpointGroupsService.getById(id)
    }

    @ApiOperation({summary: "Create endpoints group"})
    @ApiResponse({status: 200, type: [EndpointGroups]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: EndpointGroupsDto[]) {
        return this.endpointGroupsService.create(dto)
    }

    @ApiOperation({summary: "Update endpoints group"})
    @ApiResponse({status: 200, type: [EndpointGroups]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Patch()
    update(@Body() dto: Partial<EndpointGroupsDto>) {
        return this.endpointGroupsService.update(dto)
    }

    @ApiOperation({summary: "Delete endpoints group"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    delete(@Param('id') id: string) {
        return this.endpointGroupsService.delete(id)
    }

    @ApiOperation({summary: "Delete all endpoints groups"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete('/erase')
    deleteAll() {
        return this.endpointGroupsService.deleteAll()
    }
}
