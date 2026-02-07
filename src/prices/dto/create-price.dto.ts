import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsNotEmpty } from "class-validator";

export class CreatePriceDto {
    @ApiProperty({ example: 1, description: 'User ID' })
    @IsNotEmpty()
    @IsNumber()
    readonly userId: number;

    @ApiProperty({ example: 10.5, description: 'Realtime Price' })
    @IsNotEmpty()
    @IsNumber()
    readonly realtime: number;

    @ApiProperty({ example: 5.0, description: 'Analytic Price' })
    @IsNotEmpty()
    @IsNumber()
    readonly analytic: number;
}
