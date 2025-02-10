import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface EndpointCreationAttrs {
    endpoint_id: string
    username: string
    password: string
    groupId: number
    vpbx_user_id: number
}

@Table({tableName: 'pbx_endpoints'})
export class Endpoint extends Model<Endpoint, EndpointCreationAttrs> {
    @ApiProperty({example: 'WorkSoftPhone', description: "Endpoint name"})
    @Column({type: DataType.STRING, unique: true})
    endpoint_id: string
    @ApiProperty({example: 'WorkSoftPhone', description: "Endpoint username"})
    @Column({type: DataType.STRING})
    username: string
    @ApiProperty({example: 'WorkSoftPhone', description: "Password"})
    @Column({type: DataType.STRING})
    password: string
    @ApiProperty({example: 'sip-out', description: "Context"})
    @Column({type: DataType.STRING, allowNull: false})
    context: string
    @ApiProperty({example: 'transport-udp', description: "Transport protocol"})
    @Column({type: DataType.STRING, allowNull: false})
    transport: string
    @ApiProperty({example: 'allow', description: "Codecs"})
    @Column({type: DataType.STRING, allowNull: false})
    allow: string
    @ApiProperty({example: '2', description: "Registrations limit"})
    @Column({type: DataType.INTEGER})
    max_contacts: number
    @ApiProperty({example: 'md5,userpass,google_oauth', description: "Authorization type"})
    @Column({type: DataType.STRING})
    auth_type: string
    @ApiProperty({example: '4', description: "Endpoint group id"})
    @Column({type: DataType.INTEGER, allowNull: true})
    groupId: number
    @ApiProperty({example: '4', description: "VPBX cabinet id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}
