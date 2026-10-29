import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { User } from '../users/users.model';
import { Role } from '../roles/roles.model';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { API_KEY_SCOPES, RequireApiKeyScope } from '../api-keys/api-key-scope.decorator';
import { RecoveryService } from './recovery.service';

class RecoveryScopeDto {
    @IsInt() @Min(1) cabinetId:number;
    @IsInt() @Min(1) projectId:number;
}
export class RecoveryQuoteDto extends RecoveryScopeDto {
    @IsOptional() @IsString() @MaxLength(21) period?:string;
    @IsString() @MaxLength(64) timeZone:string;
    @IsString() @MaxLength(64) timePolicy:string;
    @IsString() @MaxLength(256) recordingOrigin:string;
    @IsOptional() @IsNumber() @Min(0) maxAmount?:number;
}
export class RecoveryGetQuoteDto extends RecoveryScopeDto {
    @IsUUID() quoteId:string;
}
export class RecoveryStartDto extends RecoveryGetQuoteDto {
    @IsString() @Matches(/^[a-f0-9]{64}$/) quoteHash:string;
    @IsString() @Matches(/^[a-f0-9]{64}$/) consentHash:string;
    @IsString() @Matches(/^[a-f0-9]{20,80}$/) approvalId:string;
    @IsString() @Matches(/^[a-f0-9]{20,80}$/) approvalHash:string;
}
export class RecoveryStatusDto extends RecoveryScopeDto {
    @IsOptional() @IsUUID() jobId?:string;
    @IsOptional() @IsUUID() quoteId?:string;
}

@RequireApiKeyScope(API_KEY_SCOPES.HELPDESK_TOOLS)
@UseGuards(ApiKeyGuard)
@Controller('helpdesk/tools/recovery')
export class RecoveryController {
    constructor(@InjectModel(User) private readonly users:typeof User,private readonly recovery:RecoveryService){}
    private async authorize(actor:number|undefined,scope:RecoveryScopeDto){
        if(!actor)throw new ForbiddenException('Active ADMIN-owned helpdesk key required');
        const user=await this.users.findByPk(actor,{attributes:['id','banned','isActivated'],include:[{model:Role,attributes:['value'],through:{attributes:[]}}]});
        if(!user||user.banned||!user.isActivated||!user.roles?.some(r=>r.value==='ADMIN'))throw new ForbiddenException('Active ADMIN-owned helpdesk key required');
        if(!Number.isSafeInteger(scope.cabinetId)||scope.cabinetId<1||!Number.isSafeInteger(scope.projectId)||scope.projectId<1)throw new ForbiddenException('Explicit cabinet/project required');
    }
    @Post('quote')
    async quote(@Body() dto:RecoveryQuoteDto,@Req() request:{apiKeyUserId?:number}){
        await this.authorize(request.apiKeyUserId,dto);
        return this.recovery.createQuote(String(dto.cabinetId),dto.projectId,dto);
    }
    @Post('quote-read')
    async quoteRead(@Body() dto:RecoveryGetQuoteDto,@Req() request:{apiKeyUserId?:number}){
        await this.authorize(request.apiKeyUserId,dto);
        return this.recovery.viewQuote(String(dto.cabinetId),dto.projectId,dto.quoteId);
    }
    @Post('start')
    async start(@Body() dto:RecoveryStartDto,@Req() request:{apiKeyUserId?:number}){
        await this.authorize(request.apiKeyUserId,dto);
        return this.recovery.enqueue(String(dto.cabinetId),dto.projectId,dto);
    }
    @Post('status')
    async status(@Body() dto:RecoveryStatusDto,@Req() request:{apiKeyUserId?:number}){
        await this.authorize(request.apiKeyUserId,dto);
        if(Boolean(dto.jobId)===Boolean(dto.quoteId))throw new ForbiddenException('Choose one job or quote');
        return dto.jobId?this.recovery.status(String(dto.cabinetId),dto.projectId,dto.jobId):this.recovery.statusForQuote(String(dto.cabinetId),dto.projectId,dto.quoteId!);
    }
    @Post('cancel')
    async cancel(@Body() dto:RecoveryStatusDto,@Req() request:{apiKeyUserId?:number}){
        await this.authorize(request.apiKeyUserId,dto);
        if(!dto.jobId||dto.quoteId)throw new ForbiddenException('Exact job required');
        return this.recovery.cancel(String(dto.cabinetId),dto.projectId,dto.jobId);
    }
}
