import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { Assistant } from "../../assistants/assistants.model";
import { McpServer } from "./mcp-server.model";

@Table({ tableName: 'aiAssistant_mcpServers', createdAt: false, updatedAt: false })
export class AssistantMcpServersModel extends Model<AssistantMcpServersModel> {
    @ForeignKey(() => McpServer)
    @Column({ type: DataType.INTEGER })
    mcpServerId: number;

    @ForeignKey(() => Assistant)
    @Column({ type: DataType.INTEGER })
    assistantId: number;
}
