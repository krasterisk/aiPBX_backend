import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AiTool } from '../ai-tools/ai-tool.model';
import { Chat } from './chat.model';

@Table({ tableName: 'chat_aiTools', createdAt: false, updatedAt: false })
export class ChatToolsModel extends Model<ChatToolsModel> {
    @ForeignKey(() => AiTool)
    @Column({ type: DataType.INTEGER })
    toolId: number;

    @ForeignKey(() => Chat)
    @Column({ type: DataType.INTEGER })
    chatId: number;
}
