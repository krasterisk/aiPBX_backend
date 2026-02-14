import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMcpServerDto {
    @ApiProperty({ example: 'My CRM Server' })
    @IsString({ message: 'name: Must be a string' })
    readonly name: string;

    @ApiProperty({ example: 'wss://mcp.example.com' })
    @IsString({ message: 'url: Must be a string' })
    readonly url: string;

    @ApiProperty({ example: 'websocket', enum: ['websocket', 'http'] })
    @IsEnum(['websocket', 'http'], { message: 'transport: Must be websocket or http' })
    readonly transport: 'websocket' | 'http';

    @ApiProperty({ example: 'bearer', enum: ['none', 'bearer', 'apikey', 'custom_headers'] })
    @IsEnum(['none', 'bearer', 'apikey', 'custom_headers'], { message: 'authType: Must be none, bearer, apikey or custom_headers' })
    readonly authType: 'none' | 'bearer' | 'apikey' | 'custom_headers';

    @ApiProperty({ example: { token: 'my-secret-token' }, required: false })
    @IsOptional()
    @IsObject({ message: 'authCredentials: Must be an object' })
    readonly authCredentials?: any;
}
