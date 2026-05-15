import { IsOptional, IsString } from "class-validator";

export class GetPaymentsDto {
    @IsOptional()
    page?: number | string = 1;

    @IsOptional()
    limit?: number | string = 10;

    /** ADMIN only: filter by tenant owner user id; omit for all tenants' payments */
    @IsOptional()
    @IsString()
    userId?: string;
}
