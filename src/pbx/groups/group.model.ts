import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateGroupModelAttr {
    name: string
    strategy: string
    timeout: number
    endpoints: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_groups"})
export class Group extends Model<Group, CreateGroupModelAttr> {
    @ApiProperty({example: 'Private Person', description: "client name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: 'Ring all', description: "Ring strategy"})
    @Column({type: DataType.STRING, allowNull: false})
    strategy: string
    @ApiProperty({example: 'Ring timeout', description: "Ring timeout"})
    @Column({type: DataType.INTEGER, allowNull: false})
    timeout: number
    @ApiProperty({example: 'Alex PJSIP/100', description: "Endpoints list"})
    @Column({type: DataType.TEXT, allowNull: false})
    endpoints: string
    @ApiProperty({example: 'anything', description: "comment"})
    @Column({type: DataType.STRING, allowNull: true})
    comment: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}
