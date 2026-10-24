import { ApiProperty } from '@nestjs/swagger';

export class DashboardTimePointDto {
    @ApiProperty({ description: 'UTC date, month, or ISO hour-bucket start' })
    label: string;
    @ApiProperty() callsCount: number;
    @ApiProperty() avgScore: number;
    @ApiProperty() avgDuration: number;
}

export class DashboardTimeSeriesDto {
    @ApiProperty({ type: [DashboardTimePointDto] }) daily: DashboardTimePointDto[];
    @ApiProperty({ type: [DashboardTimePointDto] }) monthly: DashboardTimePointDto[];
    @ApiProperty({ type: [DashboardTimePointDto], description: 'Zero-filled UTC hours for single-day ranges (up to 25 hours including DST); empty for longer ranges or no records. Daily/monthly fields are unchanged.' })
    hourly: DashboardTimePointDto[];
}
