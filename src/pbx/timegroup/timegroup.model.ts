import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

export interface CreateTimegroupAttr {
    name: string
    timegroup: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_timegroups"})
export class Timegroup extends Model<Timegroup, CreateTimegroupAttr> {
    @ApiProperty({example: 'Permit for 100', description: "Permit name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: '*,*,18:00-19:00,*.*', description: "time conditions"})
    @Column({type: DataType.STRING, allowNull: false})
    timeconditions: string
    @ApiProperty({example: 'Holidays records', description: "Comment"})
    @Column({type: DataType.STRING, allowNull: true})
    comment: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}
