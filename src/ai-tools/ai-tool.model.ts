import { BelongsTo, BelongsToMany, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";
import { Assistant } from "../assistants/assistants.model";
import { AssistantToolsModel } from "./assistant-tools.model";

@Table({ tableName: 'aiTools' })
export class AiTool extends Model<AiTool> {
    @ApiProperty({ example: 'function', description: "This should always be function" })
    @Column({ type: DataType.STRING, allowNull: false })
    type: string;
    @ApiProperty({ example: 'get_price', description: "The function's name" })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;
    @ApiProperty({
        example: 'to get price call this function',
        description: "Details on when and how to use the function"
    })
    @Column({ type: DataType.TEXT, allowNull: true })
    description: string;
    @ApiProperty({
        example: '{name: book, price: 100}',
        description: "JSON schema defining the function's input arguments"
    })
    @Column({ type: DataType.JSON, allowNull: true })
    parameters: string;
    @Column({ type: DataType.JSON, allowNull: true })
    toolData: string;
    @ApiProperty({ example: 'true', description: "Whether to enforce strict mode for the function call" })
    @Column({ type: DataType.BOOLEAN, allowNull: true })
    strict: boolean;
    @ApiProperty({ example: 'https://api.address.api', description: "Api webhook" })
    @Column({ type: DataType.STRING, allowNull: true })
    webhook: string;
    @ApiProperty({ example: 'any comment', description: "Comments" })
    @Column({ type: DataType.STRING, allowNull: true })
    comment: string;

    @ApiProperty({ example: '{"Authorization": "Bearer token"}', description: "Custom headers for webhook" })
    @Column({ type: DataType.JSON, allowNull: true })
    headers: any;

    @ApiProperty({ example: 'POST', description: "HTTP method (GET, POST, etc.)" })
    @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'GET' })
    method: string;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number
    @BelongsTo(() => User)
    user: User

    @BelongsToMany(() => Assistant, () => AssistantToolsModel)
    assistants: Assistant[]
}
