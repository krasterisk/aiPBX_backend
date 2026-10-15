import { ApiProperty } from '@nestjs/swagger';

export class OperatorTopicCellDto {
    @ApiProperty({ type: String, nullable: true, description: 'Null means no topic' })
    tagId: string | null;

    @ApiProperty({ type: Number })
    callsCount: number;
}

export class OperatorTopicDto extends OperatorTopicCellDto {
    @ApiProperty({ type: String, description: 'Display name; empty for the no-topic bucket' })
    name: string;
}

export class OperatorTopicRowDto {
    @ApiProperty({ type: String, nullable: true, description: 'Normalized name; null means no operator' })
    operatorName: string | null;

    @ApiProperty({ type: Number, description: 'Unique call count, including low-quality calls' })
    callsCount: number;

    @ApiProperty({ type: [OperatorTopicCellDto] })
    topics: OperatorTopicCellDto[];
}

export class OperatorTopicStatsDto {
    @ApiProperty({ type: Number })
    totalCalls: number;

    @ApiProperty({ type: Boolean })
    hasMultipleTopics: boolean;

    @ApiProperty({ type: [OperatorTopicDto] })
    topics: OperatorTopicDto[];

    @ApiProperty({ type: [OperatorTopicRowDto] })
    operators: OperatorTopicRowDto[];
}
