import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OperatorEvidenceItemDto {
    @ApiProperty({ example: '12345' })
    channelId: string;

    @ApiProperty({ example: '2026-07-30T10:00:00.000Z' })
    createdAt: string;

    @ApiProperty({ example: 72, nullable: true })
    value: number | boolean | string | null;

    @ApiPropertyOptional({ example: 'Оператор не представился по стандарту.' })
    rationale?: string;

    @ApiPropertyOptional({ example: 'Здравствуйте, чем могу помочь?' })
    quote?: string;
}

export class OperatorEvidenceMetricDto {
    @ApiProperty({ example: 'greeting_quality' })
    metricId: string;

    @ApiProperty({ enum: ['default', 'custom', 'summary'], example: 'default' })
    origin: 'default' | 'custom' | 'summary';

    @ApiPropertyOptional({ example: 'Попытка апселла' })
    label?: string;

    @ApiProperty({ example: 68.5, nullable: true })
    average: number | null;

    @ApiProperty({ example: 12 })
    sampleSize: number;

    @ApiProperty({ type: [OperatorEvidenceItemDto] })
    evidence: OperatorEvidenceItemDto[];
}

export class OperatorEvidenceResponseDto {
    @ApiProperty({ example: 'Иван' })
    operatorName: string;

    @ApiProperty({ example: 42 })
    callsCount: number;

    @ApiProperty({ example: 38 })
    scoredCalls: number;

    @ApiProperty({ example: 71.25 })
    averageScore: number;

    @ApiProperty({ example: false })
    sampleCapped: boolean;

    @ApiProperty({ type: [OperatorEvidenceMetricDto] })
    metrics: OperatorEvidenceMetricDto[];
}
