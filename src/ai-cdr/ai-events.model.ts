import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";

interface CreateAiEvents {
    channelId: string
    callerId: string
    events: object
}

@Table({
    tableName: "aiEvents",
    indexes: [
        { fields: ['channelId', 'createdAt'], name: 'idx_channelId_createdAt' }
    ]
})
export class AiEvents extends Model<AiEvents, CreateAiEvents> {
    @ApiProperty({ example: '123', description: "Channel uniqueId" })
    @Column({ type: DataType.STRING, allowNull: false })
    channelId: string;
    @ApiProperty({ example: '1006', description: "CallerId" })
    @Column({ type: DataType.STRING, allowNull: true })
    callerId: string
    @ApiProperty({ example: '1', description: "OpenAI Event" })
    @Column({ type: DataType.JSON })
    events: Record<string, any>[]
    @ApiProperty({ example: '1', description: "UserId" })
    @Column({ type: DataType.STRING, allowNull: true })
    userId: string
    @ApiProperty({ example: '1006', description: "vPbxUserId" })
    @Column({ type: DataType.STRING, allowNull: true })
    vPbxUserId: string
}
