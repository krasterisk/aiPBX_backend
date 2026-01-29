import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsArray, IsOptional, IsBoolean, IsNumber, Min, Max, IsFQDN } from "class-validator";
import { Transform } from "class-transformer";

export class UpdateWidgetKeyDto {
    @ApiProperty({
        example: 'Updated Widget Name',
        description: 'Widget name for identification',
        required: false
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({
        example: ['example.com', 'www.example.com', 'subdomain.example.com'],
        description: 'Array of allowed domains (without protocol)',
        required: false,
        type: [String]
    })
    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            try {
                // Try to parse as JSON first
                const parsed = JSON.parse(value);
                // If result is array, flatten any comma-separated values
                if (Array.isArray(parsed)) {
                    return parsed.flatMap(item =>
                        typeof item === 'string'
                            ? item.split(',').map(d => d.trim()).filter(d => d.length > 0)
                            : item
                    );
                }
                return parsed;
            } catch {
                // If not JSON, treat as comma-separated string
                return value.split(',').map(d => d.trim()).filter(d => d.length > 0);
            }
        }
        // If already array, flatten any comma-separated values
        if (Array.isArray(value)) {
            return value.flatMap(item =>
                typeof item === 'string'
                    ? item.split(',').map(d => d.trim()).filter(d => d.length > 0)
                    : item
            );
        }
        return value;
    })
    @IsArray()
    @IsFQDN({ require_tld: false }, { each: true })
    allowedDomains?: string[];

    @ApiProperty({
        example: 20,
        description: 'Maximum number of concurrent sessions (1-100)',
        required: false
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    maxConcurrentSessions?: number;

    @ApiProperty({
        example: 600,
        description: 'Maximum session duration in seconds (60-3600)',
        required: false
    })
    @IsOptional()
    @IsNumber()
    @Min(60)
    @Max(3600)
    maxSessionDuration?: number;

    @ApiProperty({
        example: true,
        description: 'Is widget key active',
        required: false
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
