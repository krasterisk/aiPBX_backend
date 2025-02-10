import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";


interface CreateRecordModelAttr{
    name: string
    vpx_user_id: number
}

@Table({tableName: "pbx_records"})
export class Record extends Model<Record, CreateRecordModelAttr> {
    @ApiProperty({example: 'record all', description: "Record template name"})
    @Column({type: DataType.STRING, unique: true, allowNull: false})
    name: string
    @ApiProperty({example: 'asterisk wiki url', description: "Record filename"})
    @Column({type: DataType.STRING, allowNull: false})
    filename: string
    @ApiProperty({example: 'asterisk wiki url', description: "Record options"})
    @Column({type: DataType.STRING})
    options: string
    @ApiProperty({example: 'format', description: "Record options"})
    @Column({type: DataType.STRING})
    format: string
    @ApiProperty({example: 'any description', description: "description"})
    @Column({type: DataType.STRING})
    description: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER})
    vpbx_user_id: number

}
