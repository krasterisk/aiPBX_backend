import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { McpServer } from './mcp-server.model';
import { User } from '../../users/users.model';

@Table({ tableName: 'mcpCallLogs' })
export class McpCallLog extends Model<McpCallLog> {
    @ApiProperty({ example: 'create_event', description: 'Name of the tool called' })
    @Column({ type: DataType.STRING, allowNull: false })
    toolName: string;

    @ApiProperty({ description: 'Arguments passed to the tool' })
    @Column({ type: DataType.JSON, allowNull: true })
    arguments: any;

    @ApiProperty({ description: 'Result returned from the tool' })
    @Column({ type: DataType.JSON, allowNull: true })
    result: any;

    @ApiProperty({ example: 150, description: 'Execution duration in milliseconds' })
    @Column({ type: DataType.INTEGER, allowNull: true })
    duration: number;

    @ApiProperty({ example: 'success', description: 'Call status' })
    @Column({
        type: DataType.ENUM('success', 'error', 'blocked'),
        allowNull: false,
        defaultValue: 'success',
    })
    status: 'success' | 'error' | 'blocked';

    @ApiProperty({ example: 'channel-123', description: 'Session/call channel ID' })
    @Column({ type: DataType.STRING, allowNull: true })
    channelId: string;

    @ApiProperty({ example: 'webhook', description: 'Source type: webhook, mcp, builtin' })
    @Column({ type: DataType.STRING, allowNull: true })
    source: string;

    @ForeignKey(() => McpServer)
    @Column({ type: DataType.INTEGER, allowNull: true })
    mcpServerId: number;

    @BelongsTo(() => McpServer, { onDelete: 'SET NULL' })
    mcpServer: McpServer;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;
}
