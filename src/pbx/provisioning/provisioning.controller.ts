import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    HttpStatus,
    Param, Patch,
    Post,
    Query,
    UseGuards
} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {ProvisioningService} from "./provisioning.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Provisioning} from "./provisioning.model";
import {ProvisioningDto} from "./dto/provisioning.dto";
import {Context} from "../contexts/contexts.model";
import {GetProvisioningDto} from "./dto/getProvisioning.dto";

@ApiTags('Provisioning')
@Controller('provisioning')
export class ProvisioningController {

    constructor(private provisioningService: ProvisioningService) {}

    @ApiOperation({summary: "Get provisionings list"})
    @ApiResponse({status: 200, type: Provisioning})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll(@Query('vpbx_user_id') vpbx_user_id: string) {
        return this.provisioningService.getAll(vpbx_user_id)
    }

    @ApiOperation({summary: "Contexts list page"})
    @ApiResponse({status: 200, type: Context})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get('page')
    get(@Query() query: GetProvisioningDto ) {
        try {
            return this.provisioningService.get(query)

        } catch (e) {
            throw new HttpException({message: '[provisioning]:  Request error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

    @ApiOperation({summary: "Get provisioning by id"})
    @ApiResponse({status: 200, type: [Provisioning]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.provisioningService.getProvisioningById(id)
    }

    @ApiOperation({summary: "Create new provisioning"})
    @ApiResponse({status: 200, type: Provisioning})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: ProvisioningDto[]) {
        return this.provisioningService.create(dto)
    }

    @ApiOperation({summary: "Update provisioning"})
    @ApiResponse({status: 200, type: Provisioning})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch()
    update(@Body() dto: ProvisioningDto) {
        return this.provisioningService.update(dto)
    }

    @ApiOperation({summary: "Delete provisioning"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    delete(@Param('id') id: string) {
        return this.provisioningService.delete(id)
    }
}
