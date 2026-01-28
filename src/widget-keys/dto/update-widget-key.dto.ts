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
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
        return value;
    })
    @IsArray()
    @IsFQDN({}, { each: true })
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
        example: true,
        description: 'Is widget key active',
        required: false
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
