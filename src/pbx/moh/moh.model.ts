import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateMohModelAttr {
    name: string
    classname: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_moh"})
export class Moh extends Model<Moh, CreateMohModelAttr> {
    @ApiProperty({example: 'Main', description: "Music on hold name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: 'holidays', description: "MOH class"})
    @Column({type: DataType.STRING, allowNull: false})
    classname: string
    @ApiProperty({example: 'new year holidays', description: "comment"})
    @Column({type: DataType.STRING, allowNull: true})
    comment: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}
