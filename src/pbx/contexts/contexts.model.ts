import {Column, DataType, HasOne, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface ContextsCreationAttrs {
    name: string
    vpbx_user_id: number
}

@Table({tableName: 'pbx_custom_contexts'})
export class Context extends Model<Context, ContextsCreationAttrs> {
    @ApiProperty({example: '1', description: "Unique id"})
    @Column({type: DataType.INTEGER, unique: true, primaryKey: true, autoIncrement: true})
    id: number
    @ApiProperty({example: 'sip-out', description: "Context name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: 'sip-out-mg,sip-out-city', description: "Included contexts"})
    @Column({type: DataType.STRING})
    includes: string
    @ApiProperty({example: 'Outgoing context', description: "Context description"})
    @Column({type: DataType.STRING})
    description: string
    @ApiProperty({example: 'vpbx_user_id', description: "Context id"})
    @Column({type: DataType.INTEGER})
    vpbx_user_id: number

}



