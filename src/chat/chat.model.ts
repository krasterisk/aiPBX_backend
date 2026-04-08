import { BelongsTo, BelongsToMany, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../users/users.model';
import { AiTool } from '../ai-tools/ai-tool.model';
import { ChatToolsModel } from './chat-tools.model';

@Table({ tableName: 'chats', timestamps: true })
export class Chat extends Model<Chat> {
    @ApiProperty({ example: 1, description: 'Chat ID' })
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    id: number;

    @ApiProperty({ example: 'Helpdesk', description: 'Chat name' })
    @Column({ type: DataType.STRING(255), allowNull: false })
    name: string;

    @ApiProperty({ description: 'System instruction / prompt' })
    @Column({ type: DataType.TEXT, allowNull: true })
    instruction: string;

    @ApiProperty({ example: 'gemma4:e4b', description: 'LLM model name' })
    @Column({ type: DataType.STRING(100), allowNull: true, defaultValue: 'gemma4:e4b' })
    model: string;

    @ApiProperty({ example: '0.7', description: 'Temperature' })
    @Column({ type: DataType.STRING(10), allowNull: true, defaultValue: '0.7' })
    temperature: string;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    userId: number;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;

    @BelongsToMany(() => AiTool, () => ChatToolsModel)
    tools: AiTool[];
}
