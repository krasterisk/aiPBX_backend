import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OperatorInsightEvidenceDto {
    @ApiPropertyOptional({ example: 'greeting_quality' })
    metric?: string;

    @ApiPropertyOptional({ example: 72 })
    value?: number;

    @ApiPropertyOptional({ type: [String], example: ['Иванов А.'] })
    operators?: string[];

    @ApiPropertyOptional({ example: '2026-02-01 — 2026-02-13' })
    periodLabel?: string;
}

export class OperatorInsightDto {
    @ApiProperty({ enum: ['high', 'medium', 'low'], example: 'high' })
    priority: 'high' | 'medium' | 'low';

    @ApiProperty({ enum: ['strength', 'gap', 'trend', 'outlier', 'quality'], example: 'gap' })
    type: 'strength' | 'gap' | 'trend' | 'outlier' | 'quality';

    @ApiProperty({ example: 'Низкая вежливость у части операторов' })
    title: string;

    @ApiProperty({ example: 'Средний показатель politeness_empathy ниже 70 у 3 операторов.' })
    observation: string;

    @ApiProperty({ example: 'Провести разбор звонков с низкими оценками вежливости.' })
    recommendation: string;

    @ApiProperty({ type: OperatorInsightEvidenceDto })
    evidence: OperatorInsightEvidenceDto;
}

export class OperatorInsightsResponseDto {
    @ApiProperty({ type: [OperatorInsightDto] })
    insights: OperatorInsightDto[];

    @ApiProperty({ example: '2026-06-24T12:00:00.000Z' })
    generatedAt: string;

    @ApiProperty({ example: '2026-06-18.2' })
    promptVersion: string;

    @ApiProperty({ example: 42 })
    sampleSize: number;

    @ApiProperty({ example: false })
    lowConfidence: boolean;

    @ApiPropertyOptional({ example: 'a1b2c3d4' })
    factsDigest?: string;
}
