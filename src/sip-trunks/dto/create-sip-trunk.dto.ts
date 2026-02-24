import { IsString, IsOptional, IsNotEmpty, IsBoolean, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSipTrunkDto {
    @IsNotEmpty()
    @Transform(({ value }) => Number(value))
    readonly assistantId: string | number;

    @IsNotEmpty()
    @Transform(({ value }) => Number(value))
    readonly serverId: string | number;

    @IsNotEmpty()
    @IsString()
    readonly name: string;

    @IsNotEmpty()
    @IsIn(['registration', 'ip'])
    readonly trunkType: 'registration' | 'ip';

    @IsNotEmpty()
    @IsString()
    readonly sipServerAddress: string;

    @IsNotEmpty()
    @IsIn(['udp', 'tcp', 'tls'])
    readonly transport: 'udp' | 'tcp' | 'tls';

    @IsOptional()
    @IsString()
    readonly authName?: string;

    @IsOptional()
    @IsString()
    readonly password?: string;

    @IsOptional()
    @IsString()
    readonly domain?: string;

    @IsOptional()
    @IsString()
    readonly callerId?: string;

    @IsOptional()
    @IsString()
    readonly providerIp?: string;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    readonly active?: boolean;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    readonly records?: boolean;
}
