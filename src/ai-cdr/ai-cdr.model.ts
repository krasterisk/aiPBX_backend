import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateAiCdr {
    channelId: string
    callerId: string
}

@Table({ tableName: "aiCdr" })
export class AiCdr extends Model<AiCdr, CreateAiCdr> {
    @ApiProperty({example: '123', description: "Channel uniqueId"})
    @Column({type: DataType.STRING, allowNull: false})
    channelId: string;
    @ApiProperty({example: '1006', description: "CallerId"})
    @Column({type: DataType.STRING, allowNull: true})
    callerId: string
    @ApiProperty({example: '1', description: "UserId"})
    @Column({type: DataType.JSON})
    data: object
    @ApiProperty({example: '1', description: "UserId"})
    @Column({type: DataType.STRING, allowNull: true})
    userId: string
    @ApiProperty({example: '1006', description: "vPbxUserId"})
    @Column({type: DataType.STRING, allowNull: true})
    vPbxUserId: string
}
