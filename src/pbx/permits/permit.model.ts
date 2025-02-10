import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreatePermitModelAttr {
    name: string
    exten: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_permits"})
export class Permit extends Model<Permit, CreatePermitModelAttr> {
    @ApiProperty({example: 'Permit for 100', description: "Permit name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: '100', description: "Permit extension"})
    @Column({type: DataType.STRING, allowNull: false})
    exten: string
    @ApiProperty({example: 'city', description: "Permit type"})
    @Column({type: DataType.INTEGER, allowNull: true})
    type_id: number
    @ApiProperty({example: 'city_trunk', description: "Priority trunk for extension"})
    @Column({type: DataType.INTEGER, allowNull: true})
    trunk_id: number
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}
