import { IsEmail, IsOptional, IsString, ValidateNested, IsArray } from "class-validator";
import { Type } from "class-transformer";
import { LegalAcceptanceItemDto } from "../../legal/dto/legal-acceptance.dto";

export class ActivationDto {
    @IsString({ message: 'Must be a string' })
    @IsEmail({}, { message: 'Incorrect email' })
    readonly email?: string
    @IsString({ message: 'Must be a string' })
    readonly activationCode?: string
    @IsString({ message: 'Must be a string' })
    readonly type?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LegalAcceptanceItemDto)
    readonly legalAcceptance?: LegalAcceptanceItemDto[]
}
