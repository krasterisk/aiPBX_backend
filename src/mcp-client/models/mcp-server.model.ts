import { BelongsTo, BelongsToMany, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/users.model';
import { Assistant } from '../../assistants/assistants.model';
import { AssistantMcpServersModel } from './assistant-mcp-servers.model';

@Table({
    tableName: 'mcpServers',
    defaultScope: {
        attributes: { exclude: ['authCredentials'] },
    },
    scopes: {
        withCredentials: { attributes: { include: [] } },
    },
})
export class McpServer extends Model<McpServer> {
    @ApiProperty({ example: 'My CRM Server', description: 'Human-readable MCP server name' })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: 'wss://mcp.example.com', description: 'MCP server URL' })
    @Column({ type: DataType.STRING, allowNull: false })
    url: string;

    @ApiProperty({ example: 'websocket', description: 'Transport type: websocket or http' })
    @Column({ type: DataType.ENUM('websocket', 'http'), allowNull: false, defaultValue: 'websocket' })
    transport: 'websocket' | 'http';

    @ApiProperty({ example: 'bearer', description: 'Auth method: none, bearer, apikey, custom_headers' })
    @Column({ type: DataType.ENUM('none', 'bearer', 'apikey', 'custom_headers'), allowNull: false, defaultValue: 'none' })
    authType: 'none' | 'bearer' | 'apikey' | 'custom_headers';

    @ApiProperty({ example: '{"token": "xxx"}', description: 'Encrypted auth credentials (JSON)' })
    @Column({ type: DataType.JSON, allowNull: true })
    authCredentials: any;

    @ApiProperty({ example: 'active', description: 'Connection status' })
    @Column({ type: DataType.ENUM('active', 'inactive', 'error'), allowNull: false, defaultValue: 'inactive' })
    status: 'active' | 'inactive' | 'error';

    @ApiProperty({ description: 'Last successful connection timestamp' })
    @Column({ type: DataType.DATE, allowNull: true })
    lastConnectedAt: Date;

    @ApiProperty({ description: 'Last connection error message' })
    @Column({ type: DataType.TEXT, allowNull: true })
    lastError: string;

    @ApiProperty({ example: 'gmail', description: 'Composio toolkit ID if created via template', required: false })
    @Column({ type: DataType.STRING, allowNull: true })
    composioToolkit: string;

    @ApiProperty({ example: 'con_abc123', description: 'Composio connected account ID', required: false })
    @Column({ type: DataType.STRING, allowNull: true })
    composioAccountId: string;

    @ApiProperty({ example: '{ "chatId": "123456" }', description: 'Toolkit-specific metadata (e.g. Telegram chatId)', required: false })
    @Column({ type: DataType.JSON, allowNull: true })
    composioMeta: Record<string, any>;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;

    @BelongsToMany(() => Assistant, () => AssistantMcpServersModel)
    assistants: Assistant[];

    /** Strip sensitive fields when serialized to JSON (API responses) */
    toJSON() {
        const values = { ...this.get() } as any;
        delete values.authCredentials;
        return values;
    }
}
