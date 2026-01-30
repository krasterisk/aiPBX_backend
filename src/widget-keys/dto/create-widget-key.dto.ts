import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNumber, IsArray, IsOptional, IsBoolean, Min, Max, IsFQDN } from "class-validator";
import { Transform } from "class-transformer";

export class CreateWidgetKeyDto {
    @ApiProperty({
        example: 'My Website Widget',
        description: 'Widget name for identification',
        required: true
    })
    @IsString()
    name: string;

    @ApiProperty({
        example: 1,
        description: 'Assistant ID to connect to this widget',
        required: true
    })
    @IsNumber()
    assistantId: number;

    @ApiProperty({
        example: 1,
        description: 'PBX Server ID for this widget',
        required: false
    })
    @IsOptional()
    @IsNumber()
    pbxServerId?: number;

    @ApiProperty({
        example: ['example.com', 'www.example.com'],
        description: 'Array of allowed domains (without protocol)',
        required: true,
        type: [String]
    })
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
    allowedDomains: string[];

    @ApiProperty({
        example: 10,
        description: 'Maximum number of concurrent sessions (1-100)',
        required: false,
        default: 10
    })
    @IsNumber()
    @Min(1)
    @Max(100)
    maxConcurrentSessions?: number;

    @ApiProperty({
        example: 600,
        description: 'Maximum session duration in seconds (60-3600)',
        required: false,
        default: 600
    })
    @IsOptional()
    @IsNumber()
    @Min(60)
    @Max(3600)
    maxSessionDuration?: number;
}
