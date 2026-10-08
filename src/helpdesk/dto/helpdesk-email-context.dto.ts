import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, Min } from 'class-validator';

export class HelpdeskEmailContextDto {
    @ApiProperty({ description: 'Exact sender email from the support mailbox' })
    @IsEmail()
    email: string;

    @ApiPropertyOptional({ description: 'Explicit project choice when the client owns multiple projects' })
    @IsOptional()
    @IsInt()
    @Min(1)
    projectId?: number;
}
