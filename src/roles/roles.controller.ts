import {Body, Controller, Get, Param, Post} from '@nestjs/common';
import {RolesService} from "./roles.service";
import {CreateRoleDto} from "./dto/create-role.dto";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Role} from "./roles.model";

@ApiTags('Roles')
@Controller('roles')
export class RolesController {

    constructor(private roleService: RolesService) {}
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
    @ApiOperation({summary: "Create role"})
    @ApiResponse({status: 200, type: Role})
    @Post()
    create(@Body() dto: CreateRoleDto) {
        return this.roleService.createRole(dto)
    }

    @ApiOperation({summary: "Get role by id"})
    @ApiResponse({status: 200, type: [Role]})
    //   @Roles('ADMIN')
    //   @UseGuards(RolesGuard)
    @Get('/:value')
    getByValue(@Param('value') value: string) {
        return this.roleService.getRoleByValue(value)
    }

    @ApiOperation({summary: "Get roles"})
    @ApiResponse({status: 200, type: [Role]})
    // @Roles('ADMIN')
    // @UseGuards(RolesGuard)
    @Get()
    getAll() {
        return this.roleService.getAll()
    }


}
