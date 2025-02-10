import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateIvrModelAttr {
    name: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_ivr"})
export class Ivr extends Model<Ivr, CreateIvrModelAttr> {
    @ApiProperty({example: 'Main IVR', description: "IVR name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}
