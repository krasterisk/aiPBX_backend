import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    UseGuards
} from '@nestjs/common';
import {EndpointsDto} from "./dto/endpoints.dto";
import {EndpointsService} from "./endpoints.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Endpoint} from "./endpoints.model";
import {Context} from "../contexts/contexts.model";
import * as Path from "path";

@ApiTags('Endpoints')
@Controller('endpoints')
export class EndpointsController {
    constructor(private endpointService: EndpointsService) {}

    @ApiOperation({summary: "Get All PJSIP endpoints"})
    @ApiResponse({status: 200, type: [Endpoint]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get()
    getAll() {
        return this.endpointService.getAll()
    }

    @ApiOperation({summary: "Get endpoint by id"})
    @ApiResponse({status: 200, type: [Endpoint]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: string) {
        return this.endpointService.getById(id)
    }

    @ApiOperation({summary: "Create PJSIP endpoint"})
    @ApiResponse({status: 200, type: [Endpoint]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: EndpointsDto[]) {
           return this.endpointService.create(dto)
    }


    @ApiOperation({summary: "Update PJSIP endpoint"})
    @ApiResponse({status: 200, type: [Endpoint]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Patch()
    update(@Body() dto: Partial<EndpointsDto>) {
        return this.endpointService.update(dto)
    }

    @ApiOperation({summary: "Delete PJSIP endpoint"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    delete(@Param('id') id: string) {
        return this.endpointService.delete(id)
    }

    @ApiOperation({summary: "Delete ALL PJSIP endpoint"})
    @ApiResponse({status: 200})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
    @Delete('/erase')
    deleteAll() {
        return this.endpointService.deleteAll()
    }


}
