import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetMcpServersDto {
    @ApiPropertyOptional({ example: '1' })
    @IsOptional()
    page?: number | string = 1;

    @ApiPropertyOptional({ example: '25' })
    @IsOptional()
    limit?: number | string = 25;

    @ApiPropertyOptional({ example: 'my-server' })
    @IsOptional()
    @IsString()
    search?: string = '';

    @ApiPropertyOptional({ example: '0' })
    @IsOptional()
    @IsString()
    userId?: string;
}
