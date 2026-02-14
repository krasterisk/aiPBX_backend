import { IsNumber, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LogsDto {
    @ApiProperty({ example: 'Created assistant', description: 'Event description' })
    @IsString({ message: 'Must be a string' })
    readonly event: string;

    @ApiProperty({ example: 'create', description: 'Action type' })
    @IsString({ message: 'Must be a string' })
    readonly action: string;

    @ApiPropertyOptional({ example: 'assistant', description: 'Entity type' })
    @IsOptional()
    @IsString()
    readonly entity?: string;

    @ApiPropertyOptional({ example: 42, description: 'Entity ID' })
    @IsOptional()
    @IsNumber()
    readonly entityId?: number;

    @ApiPropertyOptional({ description: 'Previous data' })
    @IsOptional()
    readonly oldData?: any;

    @ApiPropertyOptional({ description: 'Updated data' })
    @IsOptional()
    readonly newData?: any;

    @ApiPropertyOptional({ example: '192.168.1.1' })
    @IsOptional()
    @IsString()
    readonly ipAddress?: string;

    @ApiPropertyOptional({ example: 'Mozilla/5.0...' })
    @IsOptional()
    @IsString()
    readonly userAgent?: string;

    @ApiPropertyOptional({ example: 1, description: 'Legacy event ID' })
    @IsOptional()
    @IsNumber()
    readonly eventId?: number;

    @ApiProperty({ example: 1, description: 'User ID' })
    @IsNumber({}, { message: 'Must be a number' })
    readonly userId: number;
}
