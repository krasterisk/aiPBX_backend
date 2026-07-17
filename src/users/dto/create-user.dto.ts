import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from "class-transformer";
import { CreateRoleDto } from "../../roles/dto/create-role.dto";
import { LegalAcceptanceItemDto } from "../../legal/dto/legal-acceptance.dto";

export class CreateUserDto {
    @ApiProperty({ example: 'name', description: "Customer name" })
    // @IsString({message: 'Must be a string!'})
    // @Length(3,40, {message: 'The name must contain from 5 to 40 characters.'})
    readonly name?: string
    @ApiProperty({ example: 'Username', description: "Username" })
    // @IsString({message: 'Must be a string!'})
    // @Length(3,25, {message: 'The username must contain from 3 to 25 characters.'})
    readonly username?: string
    @ApiProperty({ example: 'user@domain.com', description: "E-mail address" })
    @IsString({ message: 'Must be a string' })
    @IsEmail({}, { message: 'Incorrect email' })
    readonly email?: string
    @ApiProperty({ example: 'avatar.png', description: "User avatar" })
    @IsString({ message: 'Must be a string' })
    readonly avatar?: string
    @ApiProperty({ example: '123', description: "GoogleId for google auth" })
    @IsString({ message: 'Must be a string' })
    readonly googleId?: string
    @ApiProperty({ example: 'google', description: "Authorization type" })
    @IsString({ message: 'Must be a string' })
    readonly authType?: string
    @ApiProperty({ example: '123', description: "TelegramId for telegram auth" })
    @IsNumber()
    readonly telegramId?: string
    @ApiProperty({ example: 'true', description: "Is Activated user" })
    @IsBoolean()
    readonly isActivated?: boolean
    @ApiProperty({ example: '1234-1234-1234-1234', description: "activation link" })
    // @IsString({message: 'Must be a string'})
    readonly activationCode?: string
    @ApiProperty({ example: 'USD', description: "Currency" })
    // @IsString({message: 'Must be a string'})
    readonly currency?: string
    @ApiProperty({ example: '178823233', description: "activation expires timestamp" })
    readonly activationExpires?: number
    @ApiProperty({ example: '12345', description: "Password" })
    @IsString({ message: 'Must be a string!' })
    @Length(8, 50, { message: 'The password must contain from 8 to 50 characters.' })
    readonly password?: string
    @ApiProperty({ example: 'USER', description: "Role" })
    // @IsString({message: 'Must be a array of Roles'})
    readonly roles?: CreateRoleDto[]
    @ApiProperty({
        example: false,
        description: 'Allow sub-user to manage tenant users (admin/owner only)',
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    readonly canManageUsers?: boolean

    @ApiProperty({
        example: 4,
        description: 'Tenant owner user ID for sub-users; omit/null for new tenant owner (admin)',
        required: false,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    readonly vpbx_user_id?: number | null

    @ApiProperty({ example: 1, description: 'Our organization id for billing issuer (admin)', required: false })
    @IsOptional()
    @IsNumber()
    readonly ourOrganizationId?: number | null

    @ApiProperty({
        description: "Legal documents acceptance batch (offer/privacy policy)",
        required: false,
        type: [LegalAcceptanceItemDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LegalAcceptanceItemDto)
    readonly legalAcceptance?: LegalAcceptanceItemDto[]
}
