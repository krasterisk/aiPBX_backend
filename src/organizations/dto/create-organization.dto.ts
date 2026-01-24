import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class CreateOrganizationDto {
    @ApiProperty({ example: 'My Corp', description: 'Organization Name' })
    @IsString({ message: 'Must be a string' })
    readonly name: string;

    @ApiProperty({ example: '1234567890', description: 'TIN (INN)' })
    @IsString({ message: 'Must be a string' })
    readonly tin: string;

    @ApiProperty({ example: '123 Main St', description: 'Address' })
    @IsString({ message: 'Must be a string' })
    readonly address: string;
}
