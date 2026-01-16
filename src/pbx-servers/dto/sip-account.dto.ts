import { IsNumber, IsString, IsIP } from 'class-validator';

export class SipAccountDto {
    @IsString()
    readonly assistantId: string;

    @IsNumber()
    readonly serverId: number;

    @IsIP('4')
    readonly ipAddress: string;
}
