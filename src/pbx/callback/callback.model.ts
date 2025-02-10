import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateCallbackModelAttr {
    name: string
    phones: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_blacklist"})
export class Callback extends Model<Callback, CreateCallbackModelAttr> {
    @ApiProperty({example: 'Private Person', description: "client name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: '+1023342334', description: "phone numbers"})
    @Column({type: DataType.TEXT, allowNull: true})
    phones: string
    @ApiProperty({example: 'anything', description: "comment"})
    @Column({type: DataType.STRING, allowNull: true})
    comment: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}
