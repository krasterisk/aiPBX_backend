import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMcpServerDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly name?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly url?: string;

    @ApiProperty({ required: false, enum: ['websocket', 'http'] })
    @IsOptional()
    @IsEnum(['websocket', 'http'])
    readonly transport?: 'websocket' | 'http';

    @ApiProperty({ required: false, enum: ['none', 'bearer', 'apikey', 'custom_headers'] })
    @IsOptional()
    @IsEnum(['none', 'bearer', 'apikey', 'custom_headers'])
    readonly authType?: 'none' | 'bearer' | 'apikey' | 'custom_headers';

    @ApiProperty({ required: false })
    @IsOptional()
    @IsObject()
    readonly authCredentials?: any;
}
