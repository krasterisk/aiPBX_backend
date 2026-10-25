import { ApiProperty } from '@nestjs/swagger';
import { AiCdr } from '../../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../../ai-analytics/ai-analytics.model';

export class QualityCriterionDto {
    @ApiProperty() id: string;
    @ApiProperty({ enum: ['default', 'custom'] }) origin: string;
    @ApiProperty({ enum: ['assessed', 'not_applicable', 'insufficient_evidence', 'missing', 'invalid'] })
    status: string;
    @ApiProperty({ enum: ['model', 'human', 'legacy'] }) source: string;
    @ApiProperty({ nullable: true, oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] })
    value: unknown;
    @ApiProperty({ nullable: true }) normalized: number | null;
    @ApiProperty() included: boolean;
    @ApiProperty() weight: number;
    @ApiProperty({ required: false }) rationale?: string;
    @ApiProperty({ required: false }) quote?: string;
}
export class QualityResultDto {
    @ApiProperty({ nullable: true, minimum: 0, maximum: 100 }) score: number | null;
    @ApiProperty({ nullable: true }) candidateScore: number | null;
    @ApiProperty({ enum: ['scored', 'needs_review', 'unscorable'] }) status: string;
    @ApiProperty({ minimum: 0, maximum: 1 }) coverage: number;
    @ApiProperty() formulaVersion: string;
    @ApiProperty() contextIncomplete: boolean;
    @ApiProperty({ enum: ['pass', 'fail', 'unknown'] }) criticalStatus: string;
    @ApiProperty({ type: [QualityCriterionDto] }) criteria: QualityCriterionDto[];
}
export class QualityEvaluationDto {
    @ApiProperty() id: string;
    @ApiProperty({ nullable: true }) previousRunId: string | null;
    @ApiProperty() scorecardRevisionId: string;
    @ApiProperty() kind: string;
    @ApiProperty() createdAt: string;
    @ApiProperty({ type: QualityResultDto }) result: QualityResultDto;
}
export class QualityDetailDto {
    @ApiProperty({ type: [Object], description: 'Effective supervisor corrections for this revision.' })
    corrections: object[];
    @ApiProperty({ type: AiCdr }) record: AiCdr;
    @ApiProperty({ type: AiAnalytics, nullable: true }) analytics: AiAnalytics | null;
    @ApiProperty({ type: QualityEvaluationDto, nullable: true }) evaluation: QualityEvaluationDto | null;
    @ApiProperty({ type: [Object], description: 'Public criterion rules; never internal prompts/context.' })
    criteria: object[];
    @ApiProperty({ nullable: true }) minimumCoverage: number | null;
}
export class QualityHistoryDto {
    @ApiProperty() id: string;
    @ApiProperty() scorecardRevisionId: string;
    @ApiProperty() kind: string;
    @ApiProperty() createdAt: string;
    @ApiProperty({ nullable: true }) score: number | null;
    @ApiProperty() status: string;
    @ApiProperty() coverage: number;
    @ApiProperty() formulaVersion: string;
    @ApiProperty() contextIncomplete: boolean;
}
export class QualityRulesDto {
    @ApiProperty() enabled: boolean;
    @ApiProperty() revisionId: string;
    @ApiProperty() minimumCoverage: number;
    @ApiProperty({ type: [Object] }) criteria: object[];
    @ApiProperty({ type: Object }) config: object;
}
