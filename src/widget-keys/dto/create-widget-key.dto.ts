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
        example: ['example.com', 'www.example.com'],
        description: 'Array of allowed domains (without protocol)',
        required: true,
        type: [String]
    })
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
        return value;
    })
    @IsArray()
    @IsFQDN({}, { each: true })
    allowedDomains: string[];

    @ApiProperty({
        example: 10,
        description: 'Maximum number of concurrent sessions (1-100)',
        required: false,
        default: 10
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    maxConcurrentSessions?: number;
}
