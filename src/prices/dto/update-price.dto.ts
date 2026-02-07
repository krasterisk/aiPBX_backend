import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsOptional } from "class-validator";

export class UpdatePriceDto {
    @ApiProperty({ example: 10.5, description: 'Realtime Price', required: false })
    @IsOptional()
    @IsNumber()
    readonly realtime?: number;

    @ApiProperty({ example: 5.0, description: 'Analytic Price', required: false })
    @IsOptional()
    @IsNumber()
    readonly analytic?: number;
}
