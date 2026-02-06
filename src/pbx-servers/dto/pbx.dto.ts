import { IsString, IsUrl, IsOptional } from "class-validator";

export class PbxDto {
    @IsString({ message: 'name: Must be a string' })
    readonly name: string;
    @IsString({ message: 'location: Must be a string' })
    readonly location: string;
    @IsString({ message: 'sip_host: Must be a string' })
    readonly sip_host: string;
    @IsUrl({
        require_protocol: true,
        require_tld: false
    },
        {
            message: 'ari_url: Must be a valid URL (e.g., http://host:port/ari)'
        })
    readonly ari_url: string;
    @IsString({ message: 'ari_user: Must be a string' })
    readonly ari_user: string;
    @IsString({ message: 'ari_user: Must be a string' })
    readonly password: string;

    @IsOptional()
    @IsString()
    readonly context?: string;

    @IsOptional()
    @IsString()
    readonly moh?: string;

    @IsOptional()
    @IsString()
    readonly recordFormat?: string;
}
