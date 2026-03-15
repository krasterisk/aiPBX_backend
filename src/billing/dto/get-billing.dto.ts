import { ApiProperty } from '@nestjs/swagger';

export class GetBillingDto {
    @ApiProperty({ required: false })
    page?: string;
    @ApiProperty({ required: false })
    limit?: string;
    @ApiProperty({ required: false })
    startDate?: string;
    @ApiProperty({ required: false })
    endDate?: string;
    @ApiProperty({ required: false })
    userId?: string;
    @ApiProperty({ required: false })
    type?: string;
    @ApiProperty({ required: false })
    sortField?: string;
    @ApiProperty({ required: false })
    sortOrder?: string;
}
