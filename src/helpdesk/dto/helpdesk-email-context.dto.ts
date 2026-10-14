import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsOptional, Min, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class HelpdeskEmailContextDto {
    @ApiProperty({ description: 'Exact sender email from the support mailbox' })
    @IsEmail()
    email: string;

    @ApiPropertyOptional({ enum: ['cabinet', 'analytics'], default: 'analytics', description: 'Cabinet for assistants/account/balance; analytics requires a project' })
    @IsOptional()
    @IsIn(['cabinet', 'analytics'])
    scope?: 'cabinet' | 'analytics';
    @ApiPropertyOptional({ description: 'Explicit project choice when the client owns multiple projects' })
    @IsOptional()
    @IsInt()
    @Min(1)
    projectId?: number;

    @ApiPropertyOptional({description:'Confirmed cabinet ID in the helpdesk binding'})
    @IsOptional() @IsInt() @Min(1)
    cabinetId?:number;
}

export class HelpdeskIdentityCandidatesDto {
    @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254)
    contactEmail?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(253)
    @Matches(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i)
    domain?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
    company?: string;
}
export class HelpdeskBoundSupportDto {
    @ApiProperty() @IsInt() @Min(1) cabinetId: number;
    @ApiProperty() @IsInt() @Min(1) projectId: number;
}

export class HelpdeskReportingSummaryDto extends HelpdeskBoundSupportDto {
    @ApiPropertyOptional({enum:[7,14,30],default:14}) @IsOptional() @IsInt() @IsIn([7,14,30])
    periodDays?:number;
    @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
    @Matches(/^[\p{L}\p{N}_ .()\/+-]{1,80}$/u)
    operatorName?:string;
}
