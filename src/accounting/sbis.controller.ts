import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SbisService } from './sbis.service';

@ApiTags('SBIS')
@Controller('sbis')
export class SbisController {
    constructor(private readonly sbisService: SbisService) {}

    @ApiOperation({ summary: 'Lookup counterparty requisites by INN (SBIS EDO)' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Throttle({ default: { limit: 3, ttl: 1000 } })
    @Get('counterparty')
    lookup(
        @Query('inn') inn: string,
        @Query('kpp') kpp?: string,
    ) {
        return this.sbisService.lookupCounterparty(inn || '', kpp);
    }
}
