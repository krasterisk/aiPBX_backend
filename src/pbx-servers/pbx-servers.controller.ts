import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PbxServersService } from "./pbx-servers.service";
import { PbxServers } from "./pbx-servers.model";
import { GetPbxDto } from "./dto/getPbx.dto";
import { PbxDto } from "./dto/pbx.dto";
import { SipAccountDto } from "./dto/sip-account.dto";
import { SipAccounts } from "./sip-accounts.model";
import { LoggerService } from "../logger/logger.service";

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vpbxUserId?: string;
}

@Controller('pbx-servers')
export class PbxServersController {

    constructor(private pbxServersService: PbxServersService,
        private loggerService: LoggerService) { }

    @ApiOperation({ summary: "pbx list" })
    @ApiResponse({ status: 200, type: PbxServers })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get()
    getAll(@Req() request: RequestWithUser) {
        return this.pbxServersService.getAll(request.tokenUserId, request.isAdmin)
    }

    @ApiOperation({ summary: "pbxServers list page" })
    @ApiResponse({ status: 200, type: PbxServers })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('page')
    get(@Query() query: GetPbxDto, @Req() request: RequestWithUser) {
        return this.pbxServersService.get(query, request.tokenUserId, request.isAdmin)
    }

    @ApiOperation({ summary: "Get only cloud pbx servers" })
    @ApiResponse({ status: 200, type: [PbxServers] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('cloud')
    getCloud(@Req() request: RequestWithUser) {
        return this.pbxServersService.getCloudPbx(request.isAdmin);
    }

    @ApiOperation({ summary: "Get cloud and user servers" })
    @ApiResponse({ status: 200, type: [PbxServers] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('cloud-and-user')
    getCloudAndUser(@Req() request: RequestWithUser) {
        return this.pbxServersService.getCloudAndUserPbx(request.tokenUserId, request.isAdmin);
    }

    @ApiOperation({ summary: "Get pbx by id" })
    @ApiResponse({ status: 200, type: [PbxServers] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number, @Req() request: RequestWithUser) {
        // We might want to add check in service to ensure user can access this ID
        return this.pbxServersService.getById(id)
    }

    @ApiOperation({ summary: "Create PBX" })
    @ApiResponse({ status: 200, type: PbxServers })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post()
    async create(@Body() dto: PbxDto, @Req() request: RequestWithUser) {
        const result = await this.pbxServersService.create(dto)
        const userId = request.vpbxUserId || request.tokenUserId;
        await this.loggerService.logAction(Number(userId), 'create', 'pbxServer', null, `Created PBX server`, null, dto, request);
        return result;
    }

    @ApiOperation({ summary: "Update pbx" })
    @ApiResponse({ status: 200, type: PbxServers })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch()
    async update(@Body() dto: PbxDto, @Req() request: RequestWithUser) {
        const result = await this.pbxServersService.update(dto)
        const userId = request.vpbxUserId || request.tokenUserId;
        await this.loggerService.logAction(Number(userId), 'update', 'pbxServer', (dto as any).id, `Updated PBX server`, null, dto, request);
        return result;
    }

    @ApiOperation({ summary: "Create SIP URI" })
    @ApiResponse({ status: 200, type: SipAccounts })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('/create-sip-uri')
    createSipUri(
        @Body() dto: SipAccountDto,
        @Req() request: RequestWithUser
    ) {
        const userId = request.tokenUserId
        return this.pbxServersService.createSipUri(dto, userId)
    }

    @ApiOperation({ summary: "Update SIP URI" })
    @ApiResponse({ status: 200, type: SipAccounts })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch('/update-sip-uri')
    updateSipUri(
        @Body() dto: SipAccountDto,
        @Req() request: RequestWithUser
    ) {
        const userId = request.tokenUserId
        return this.pbxServersService.updateSipUri(dto, userId)
    }

    @ApiOperation({ summary: "Delete SIP URI" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete('/delete-sip-uri')
    deleteSipUri(
        @Body() dto: SipAccountDto,
        @Req() request: RequestWithUser
    ) {
        const userId = request.tokenUserId
        return this.pbxServersService.deleteSipUri(dto, userId)
    }

    @ApiOperation({ summary: "Get pbx status" })
    @ApiResponse({ status: 200, schema: { properties: { online: { type: 'boolean' } } } })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/:uniqueId/status')
    getStatus(@Param('uniqueId') uniqueId: string) {
        return this.pbxServersService.getServerStatus(uniqueId);
    }

    @ApiOperation({ summary: "Delete pbx" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    async delete(@Param('id') id: string, @Req() request: RequestWithUser) {
        const result = await this.pbxServersService.delete(id)
        const userId = request.vpbxUserId || request.tokenUserId;
        await this.loggerService.logAction(Number(userId), 'delete', 'pbxServer', Number(id), `Deleted PBX server #${id}`, null, null, request);
        return result;
    }
}
