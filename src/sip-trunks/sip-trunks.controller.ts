import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SipTrunksService } from "./sip-trunks.service";
import { SipTrunks } from "./sip-trunks.model";
import { CreateSipTrunkDto } from "./dto/create-sip-trunk.dto";
import { UpdateSipTrunkDto } from "./dto/update-sip-trunk.dto";

interface RequestWithUser extends Request {
    isAdmin?: boolean;
    tokenUserId?: string;
    vpbxUserId?: string;
}

@Controller('sip-trunks')
export class SipTrunksController {

    constructor(private sipTrunksService: SipTrunksService) { }

    @ApiOperation({ summary: "List user's SIP trunks" })
    @ApiResponse({ status: 200, type: [SipTrunks] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get()
    findAll(@Req() request: RequestWithUser) {
        return this.sipTrunksService.findAll(request.tokenUserId);
    }

    @ApiOperation({ summary: "Get single SIP trunk" })
    @ApiResponse({ status: 200, type: SipTrunks })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get(':id')
    findOne(@Param('id') id: number, @Req() request: RequestWithUser) {
        return this.sipTrunksService.findOne(id, request.tokenUserId);
    }

    @ApiOperation({ summary: "Create SIP trunk" })
    @ApiResponse({ status: 201, type: SipTrunks })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: CreateSipTrunkDto, @Req() request: RequestWithUser) {
        return this.sipTrunksService.create(dto, request.tokenUserId);
    }

    @ApiOperation({ summary: "Update SIP trunk" })
    @ApiResponse({ status: 200, type: SipTrunks })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Put(':id')
    update(
        @Param('id') id: number,
        @Body() dto: UpdateSipTrunkDto,
        @Req() request: RequestWithUser,
    ) {
        return this.sipTrunksService.update(id, dto, request.tokenUserId);
    }

    @ApiOperation({ summary: "Delete SIP trunk" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete(':id')
    remove(@Param('id') id: number, @Req() request: RequestWithUser) {
        return this.sipTrunksService.remove(id, request.tokenUserId);
    }

    @ApiOperation({ summary: "Get SIP trunk status" })
    @ApiResponse({ status: 200, schema: { properties: { online: { type: 'boolean' } } } })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get(':id/status')
    getStatus(@Param('id') id: number, @Req() request: RequestWithUser) {
        return this.sipTrunksService.getStatus(id, request.tokenUserId);
    }
}
