import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {AiTool} from "./ai-tool.model";
import {Assistant} from "../assistants/assistants.model";

@Table({tableName: 'aiAssistant_aiTools', createdAt: false, updatedAt: false})
export class AssistantToolsModel extends Model<AssistantToolsModel> {
    @ForeignKey(() => AiTool)
    @Column({type: DataType.INTEGER})
    toolId: number
    @ForeignKey(() => Assistant)
    @Column({type: DataType.STRING})
    assistantId: number
}
