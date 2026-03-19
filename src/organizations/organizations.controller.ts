import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { OrganizationsService } from "./organizations.service";
import { Organization } from "./organizations.model";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { LoggerService } from "../logger/logger.service";

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {

    constructor(
        private organizationService: OrganizationsService,
        private loggerService: LoggerService,
    ) { }

    @ApiOperation({ summary: "Create Organization" })
    @ApiResponse({ status: 200, type: Organization })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post()
    async create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
        const result = await this.organizationService.create(req.tokenUserId, dto);
        await this.loggerService.logAction(Number(req.tokenUserId), 'create', 'organization', result?.id || null, `Created organization "${dto.name || ''}"`, null, dto, req);
        return result;
    }

    @ApiOperation({ summary: "Get User Organizations" })
    @ApiResponse({ status: 200, type: [Organization] })
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
    async update(@Req() req: any, @Param('id') id: number, @Body() dto: CreateOrganizationDto) {
        const result = await this.organizationService.update(req.tokenUserId, id, dto);
        await this.loggerService.logAction(Number(req.tokenUserId), 'update', 'organization', Number(id), `Updated organization #${id}`, null, dto, req);
        return result;
    }

    @ApiOperation({ summary: "Delete Organization" })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete(':id')
    async remove(@Req() req: any, @Param('id') id: number) {
        const result = await this.organizationService.remove(req.tokenUserId, id);
        await this.loggerService.logAction(Number(req.tokenUserId), 'delete', 'organization', Number(id), `Deleted organization #${id}`, null, null, req);
        return result;
    }
}
