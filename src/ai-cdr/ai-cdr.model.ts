import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateAiCdr {
    channelId: string
    callerId: string
    tokens?: number
}

@Table({ tableName: "aiCdr" })
export class AiCdr extends Model<AiCdr, CreateAiCdr> {
    @ApiProperty({example: '123', description: "Channel uniqueId"})
    @Column({type: DataType.STRING, allowNull: false, unique: true})
    channelId: string;
    @ApiProperty({example: '1006', description: "CallerId"})
    @Column({type: DataType.STRING, allowNull: true})
    callerId: string
    @ApiProperty({example: 'Bob', description: "Assistant name"})
    @Column({type: DataType.STRING, allowNull: true})
    assistantName: string
    @ApiProperty({example: '2', description: "Assistant id"})
    @Column({type: DataType.STRING, allowNull: true})
    assistantId: string
    @ApiProperty({example: '1023', description: "Used tokens count"})
    @Column({type: DataType.INTEGER, allowNull: true})
    tokens: number
    @ApiProperty({example: '10', description: "call duration seconds"})
    @Column({type: DataType.INTEGER, allowNull: true})
    duration: number
    @ApiProperty({example: '10', description: "call duration seconds"})
    @Column({type: DataType.FLOAT, allowNull: false, defaultValue: 0})
    cost: number
    @ApiProperty({example: '1', description: "UserId"})
    @Column({type: DataType.STRING, allowNull: true})
    userId: string
    @ApiProperty({example: '1006', description: "vPbxUserId"})
    @Column({type: DataType.STRING, allowNull: true})
    vPbxUserId: string
}
