import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";
import { Assistant } from "../assistants/assistants.model";
import { PbxServers } from "../pbx-servers/pbx-servers.model";

interface WidgetKeyCreationAttrs {
    publicKey: string;
    name: string;
    userId: number;
    assistantId: number;
    pbxServerId?: number;
    allowedDomains: string;
    maxConcurrentSessions?: number;
    maxSessionDuration?: number; // In seconds
    isActive?: boolean;
    language?: string;
    logo?: string;
    appearance?: string;
    apiUrl?: string;
    token?: string;
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

    @ApiProperty({ example: 1, description: "PBX Server ID (asterisk)" })
    @ForeignKey(() => PbxServers)
    @Column({ type: DataType.INTEGER, allowNull: true })
    pbxServerId: number;

    @ApiProperty({
        example: '["example.com", "www.example.com"]',
        description: "JSON array of allowed domains"
    })
    @Column({ type: DataType.TEXT, allowNull: false })
    allowedDomains: string;

    @ApiProperty({ example: 10, description: "Maximum concurrent sessions" })
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 10 })
    maxConcurrentSessions: number;

    @ApiProperty({ example: 600, description: "Maximum session duration in seconds" })
    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 600 })
    maxSessionDuration: number;

    @ApiProperty({ example: 'en', description: "Default language for the widget", default: 'en' })
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'en' })
    language: string;

    @ApiProperty({ example: true, description: "Is key active" })
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
    isActive: boolean;

    @ApiProperty({ example: 'logo.png', description: "Widget logo filename" })
    @Column({ type: DataType.STRING, allowNull: true })
    logo: string;

    @ApiProperty({
        example: '{"buttonColor":"#667eea","theme":"light"}',
        description: "Widget appearance settings (JSON string)"
    })
    @Column({ type: DataType.TEXT, allowNull: true })
    appearance: string;

    @ApiProperty({ example: 'https://api.example.com/api', description: "API URL for widget token" })
    @Column({ type: DataType.STRING, allowNull: true })
    apiUrl: string;

    @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiJ9...', description: "JWT token for widget embed" })
    @Column({ type: DataType.TEXT, allowNull: true })
    token: string;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;

    @BelongsTo(() => Assistant)
    assistant: Assistant;

    @BelongsTo(() => PbxServers)
    pbxServer: PbxServers;
}
