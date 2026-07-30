import { Column, DataType, Default, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

export type TagSource = 'auto' | 'manual';

interface CallTagCreationAttrs {
    channelId: string;
    userId?: string;
    projectId?: number;
    tagId: string;
    source?: TagSource;
    actorUserId?: string;
}

/**
 * Queryable, auditable per-call tag assignments (dual-write alongside metrics._topics.tags).
 *
 * Written in addition to the JSON blob on AiAnalytics.metrics. The JSON remains the
 * read path for existing readers; this table enables tag filtering and survives manual
 * corrections across re-analysis when source='manual'.
 */
@Table({ tableName: 'operator_call_tags', timestamps: true, updatedAt: false })
export class CallTag extends Model<CallTag, CallTagCreationAttrs> {
    @ApiProperty({ example: 1 })
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: '123', description: 'AiCdr.channelId (= OperatorAnalytics.id as string)' })
    @Column({ type: DataType.STRING, allowNull: false })
    channelId: string;

    @ApiProperty({ example: '5', description: 'Owner user ID' })
    @Column({ type: DataType.STRING, allowNull: true })
    userId: string;

    @ApiProperty({ example: 1, description: 'Project ID' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    projectId: number;

    @ApiProperty({ example: 'returns', description: 'Tag identifier from project callTaxonomy' })
    @Column({ type: DataType.STRING(100), allowNull: false })
    tagId: string;

    @ApiProperty({ example: 'auto', description: 'auto = analysis matcher; manual = user correction' })
    @Default('auto')
    @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'auto' })
    source: TagSource;

    @ApiProperty({ example: '9', description: 'User who applied a manual tag edit' })
    @Column({ type: DataType.STRING, allowNull: true })
    actorUserId: string;
}
