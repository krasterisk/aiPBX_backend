import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { McpToolRegistry } from './mcp-tool-registry.model';
import { User } from '../../users/users.model';

@Table({ tableName: 'mcpToolPolicies' })
export class McpToolPolicy extends Model<McpToolPolicy> {
    @ApiProperty({ example: 'rate_limit', description: 'Policy type' })
    @Column({
        type: DataType.ENUM('param_restrict', 'rate_limit', 'require_approval'),
        allowNull: false,
    })
    policyType: 'param_restrict' | 'rate_limit' | 'require_approval';

    @ApiProperty({
        example: '{"maxCallsPerMinute": 10}',
        description: 'Policy configuration JSON',
    })
    @Column({ type: DataType.JSON, allowNull: false })
    policyConfig: any;

    @ForeignKey(() => McpToolRegistry)
    @Column({ type: DataType.INTEGER })
    mcpToolRegistryId: number;

    @BelongsTo(() => McpToolRegistry, { onDelete: 'CASCADE' })
    mcpToolRegistry: McpToolRegistry;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;
}
