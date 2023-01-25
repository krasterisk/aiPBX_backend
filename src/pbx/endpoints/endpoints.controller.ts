import {Body, Controller, Delete, Post, Put, UseGuards} from '@nestjs/common';
import {EndpointsDto} from "./dto/endpoints.dto";
import {EndpointsService} from "./endpoints.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Endpoint} from "./endpoints.model";

@ApiTags('Endpoints')
@Controller('endpoints')
export class EndpointsController {
    constructor(private endpointService: EndpointsService) {}


    @ApiOperation({summary: "Create PJSIP endpoint"})
    @ApiResponse({status: 200, type: [Endpoint]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: EndpointsDto) {
        return this.endpointService.create(dto)
    }

    @ApiOperation({summary: "Update PJSIP endpoint"})
    @ApiResponse({status: 200, type: [Endpoint]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: EndpointsDto) {
        return this.endpointService.update(dto)
    }

    @ApiOperation({summary: "Delete PJSIP endpoint"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() endpoint: Partial<EndpointsDto>) {
        return this.endpointService.delete(endpoint.endpoint_id)
    }
}
