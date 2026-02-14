import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { LoggerService } from './logger.service';
import { GetLogsDto } from './dto/get-logs.dto';
import { Logs } from './logger.model';

interface RequestWithUser extends Request {
    isAdmin?: boolean;
    tokenUserId?: string;
    vpbxUserId?: string;
}

@ApiTags('System Logs')
@Controller('logs')
export class LoggerController {

    constructor(private readonly loggerService: LoggerService) { }

    @ApiOperation({ summary: 'Get all logs' })
    @ApiResponse({ status: 200, type: [Logs] })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get()
    getAll(@Req() req: RequestWithUser) {
        const isAdmin = req.isAdmin ?? false;
        const userId = String(req.vpbxUserId || req.tokenUserId);
        return this.loggerService.getAll(isAdmin, userId);
    }

    @ApiOperation({ summary: 'Get logs with pagination and filters' })
    @ApiResponse({ status: 200, type: [Logs] })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('page')
    get(@Query() query: GetLogsDto, @Req() req: RequestWithUser) {
        const isAdmin = req.isAdmin ?? false;
        const userId = String(req.vpbxUserId || req.tokenUserId);
        return this.loggerService.get(query, isAdmin, userId);
    }
}
