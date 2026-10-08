import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsOptional, Min } from 'class-validator';

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
}
