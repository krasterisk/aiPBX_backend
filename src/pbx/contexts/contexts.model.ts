import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface ContextsCreationAttrs {
    name: string
    vpbx_user_id: number
}

@Table({tableName: 'pbx_custom_contexts'})
export class Context extends Model<Context, ContextsCreationAttrs> {
    @ApiProperty({example: 'sip-out', description: "Context name"})
    @Column({type: DataType.STRING, allowNull: false, unique: 'context_name_vpbx'})
    name: string
    @ApiProperty({example: 'sip-out-mg,sip-out-city', description: "Included contexts"})
    @Column({type: DataType.STRING})
    includes: string
    @ApiProperty({example: 'Outgoing context', description: "Context description"})
    @Column({type: DataType.STRING})
    description: string
    @ApiProperty({example: 'vpbx_user_id', description: "pbx user id"})
    @Column({type: DataType.INTEGER, unique: 'context_name_vpbx'})
    vpbx_user_id: number
}
