import { IsOptional } from "class-validator";

export class GetPaymentsDto {
    @IsOptional()
    page?: number | string = 1;

    @IsOptional()
    limit?: number | string = 10;
}
