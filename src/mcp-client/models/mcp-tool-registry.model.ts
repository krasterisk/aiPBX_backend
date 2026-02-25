import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { McpServer } from './mcp-server.model';
import { User } from '../../users/users.model';

@Table({ tableName: 'mcpToolRegistry' })
export class McpToolRegistry extends Model<McpToolRegistry> {
    @ApiProperty({ example: 'create_event', description: 'Tool name from MCP server' })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: 'Create a calendar event', description: 'Tool description from MCP server' })
    @Column({ type: DataType.TEXT, allowNull: true })
    description: string;

    @ApiProperty({ description: 'JSON Schema defining the tool input parameters' })
    @Column({ type: DataType.JSON, allowNull: true })
    inputSchema: any;

    @ApiProperty({ example: true, description: 'Whether this tool is enabled for use' })
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
    isEnabled: boolean;

    @ApiProperty({ description: 'Last time this tool was synced from the MCP server' })
    @Column({ type: DataType.DATE, allowNull: true })
    lastSyncedAt: Date;

    @ForeignKey(() => McpServer)
    @Column({ type: DataType.INTEGER })
    mcpServerId: number;

    @BelongsTo(() => McpServer, { onDelete: 'CASCADE' })
    mcpServer: McpServer;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;
}
