import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { OrganizationsService } from "./organizations.service";
import { Organization } from "./organizations.model";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {

    constructor(private organizationService: OrganizationsService) { }

    @ApiOperation({ summary: "Create Organization" })
    @ApiResponse({ status: 200, type: Organization })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post()
    create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
        return this.organizationService.create(req.tokenUserId, dto);
    }

    @ApiOperation({ summary: "Get User Organizations" })
    @ApiResponse({ status: 200, type: [Organization] }) // In reality simpler Swagger type, but returns {rows, count}
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get()
    getAll(@Req() req: any) {
        return this.organizationService.getAll(req.tokenUserId);
    }

    @ApiOperation({ summary: "Get One Organization" })
    @ApiResponse({ status: 200, type: Organization })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get(':id')
    getOne(@Req() req: any, @Param('id') id: number) {
        return this.organizationService.getOne(req.tokenUserId, id);
    }

    @ApiOperation({ summary: "Update Organization" })
    @ApiResponse({ status: 200, type: Organization })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Put(':id')
    update(@Req() req: any, @Param('id') id: number, @Body() dto: CreateOrganizationDto) {
        return this.organizationService.update(req.tokenUserId, id, dto);
    }

    @ApiOperation({ summary: "Delete Organization" })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete(':id')
    remove(@Req() req: any, @Param('id') id: number) {
        return this.organizationService.remove(req.tokenUserId, id);
    }
}
