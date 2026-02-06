import { IsString, IsIP, IsOptional, IsNotEmpty, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class SipAccountDto {
    @IsNotEmpty()
    @Transform(({ value }) => String(value))
    readonly assistantId: string | number;

    @IsNotEmpty()
    @Transform(({ value }) => Number(value))
    readonly serverId: string | number;

    @IsIP('4')
    readonly ipAddress: string;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    readonly records?: boolean;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    readonly tls?: boolean;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    readonly active?: boolean;
}
