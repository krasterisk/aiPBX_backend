import { Body, Controller, Get, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { LegalAcceptanceService } from './legal-acceptance.service';
import { LegalAcceptanceBatchDto } from './dto/legal-acceptance.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function extractClientIp(req: Request): string | null {
    const xff = (req.headers['x-forwarded-for'] as string | undefined) || '';
    const first = xff.split(',')[0]?.trim();
    return first || (req.socket?.remoteAddress ?? null);
}

@ApiTags('Legal')
@Controller('legal-acceptances')
export class LegalController {
    private readonly logger = new Logger(LegalController.name);

    constructor(private readonly service: LegalAcceptanceService) {}

    @ApiOperation({ summary: 'Record current user consent with legal documents' })
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post()
    async record(
        @Body() body: LegalAcceptanceBatchDto,
        @Req() req: Request,
    ): Promise<{ ok: true; recorded: number }> {
        const user = (req as Request & { user?: { id?: string | number } }).user;
        const userId = user?.id;
        if (!userId) {
            return { ok: true, recorded: 0 };
        }
        await this.service.recordBatch(userId, body.items || [], {
            ip: extractClientIp(req),
            userAgent: (req.headers['user-agent'] as string | undefined) || null,
            source: (body.source as never) || 'manual',
        });
        return { ok: true, recorded: body.items?.length || 0 };
    }

    @ApiOperation({ summary: 'List current user legal acceptances' })
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Get('mine')
    async listMine(@Req() req: Request) {
        const user = (req as Request & { user?: { id?: string | number } }).user;
        if (!user?.id) return [];
        return this.service.listForUser(user.id);
    }
}
