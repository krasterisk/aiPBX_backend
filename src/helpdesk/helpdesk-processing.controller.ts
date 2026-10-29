import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { API_KEY_SCOPES, RequireApiKeyScope } from '../api-keys/api-key-scope.decorator';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { User } from '../users/users.model';
import { Role } from '../roles/roles.model';
import { OperatorProject } from '../operator-analytics/operator-project.model';
import { getTenantCurrency } from '../shared/tenant/tenant-currency';
import { processingPeriod, readProcessingSummary } from './processing-summary';

export class HelpdeskProcessingDto {
    @IsInt() @Min(1) cabinetId: number;
    @IsInt() @Min(1) projectId: number;
    @IsOptional() @IsString() @MaxLength(21) period?: string;
    @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
}

@RequireApiKeyScope(API_KEY_SCOPES.HELPDESK_TOOLS)
@UseGuards(ApiKeyGuard)
@Controller('helpdesk/tools')
export class HelpdeskProcessingController {
    constructor(@InjectModel(User) private readonly users: typeof User,
        @InjectModel(OperatorProject) private readonly projects: typeof OperatorProject) {}

    @Post('bound-processing-summary')
    async summary(@Body() dto: HelpdeskProcessingDto, @Req() request: { apiKeyUserId?: number }) {
        const actorId = request.apiKeyUserId;
        if (!actorId) throw new ForbiddenException('Active ADMIN-owned helpdesk key required');
        const actor = await this.users.findByPk(actorId, { attributes:['id','banned','isActivated'], include:[{model:Role,attributes:['value'],through:{attributes:[]}}] });
        if (!actor || actor.banned || !actor.isActivated || !actor.roles?.some(r=>r.value==='ADMIN')) throw new ForbiddenException('Active ADMIN-owned helpdesk key required');
        if (!Number.isSafeInteger(dto?.cabinetId)||dto.cabinetId<1||!Number.isSafeInteger(dto?.projectId)||dto.projectId<1) throw new ForbiddenException('Explicit cabinet and project required');
        const period = processingPeriod(dto.period, dto.timeZone ?? 'UTC');
        const owner = await this.users.findByPk(dto.cabinetId,{attributes:['id','banned','vpbx_user_id']});
        if (!owner||owner.banned||owner.vpbx_user_id!=null) throw new ForbiddenException('Cabinet unavailable');
        const project = await this.projects.findOne({where:{id:dto.projectId,userId:String(dto.cabinetId)},attributes:['id']});
        if (!project) throw new ForbiddenException('Project outside selected cabinet');
        if (!this.projects.sequelize) throw new ForbiddenException('Processing metadata unavailable');
        return readProcessingSummary(this.projects.sequelize,dto.cabinetId,dto.projectId,period,getTenantCurrency());
    }
}
