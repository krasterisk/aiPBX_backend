import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";
import { Assistant } from "../assistants/assistants.model";

interface WidgetKeyCreationAttrs {
    publicKey: string;
    name: string;
    userId: number;
    assistantId: number;
    allowedDomains: string;
    maxConcurrentSessions?: number;
    isActive?: boolean;
}

@Table({ tableName: "widget_keys" })
export class WidgetKey extends Model<WidgetKey, WidgetKeyCreationAttrs> {
    @ApiProperty({ example: 'wk_1a2b3c4d5e6f7g8h9i0j', description: "Public widget key" })
    @Column({ type: DataType.STRING, unique: true, allowNull: false })
    publicKey: string;

    @ApiProperty({ example: 'My Website Widget', description: "Widget name for identification" })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: 1, description: "User ID (owner)" })
    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    userId: number;

    @ApiProperty({ example: 1, description: "Assistant ID" })
    @ForeignKey(() => Assistant)
    @Column({ type: DataType.INTEGER, allowNull: false })
    assistantId: number;

    @ApiProperty({
        example: '["example.com", "www.example.com"]',
        description: "JSON array of allowed domains"
    })
    @Column({ type: DataType.TEXT, allowNull: false })
    allowedDomains: string;

    @ApiProperty({ example: 10, description: "Maximum concurrent sessions" })
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 10 })
    maxConcurrentSessions: number;

    @ApiProperty({ example: true, description: "Is key active" })
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
    isActive: boolean;

    @BelongsTo(() => User)
    user: User;

    @BelongsTo(() => Assistant)
    assistant: Assistant;
}
