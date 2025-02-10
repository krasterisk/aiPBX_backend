import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface VpbxUserCreationAttrs {
    username: string
    email: string
    password: string
}

@Table({tableName: 'vpbx_users'})
export class VpbxUser extends Model<VpbxUser, VpbxUserCreationAttrs> {
    @ApiProperty({example: 'Username', description: "Username. Required"})
    @Column({type: DataType.STRING, unique: true, allowNull: false})
    username: string = ''
    @ApiProperty({example: 'name@domain.com', description: "E-mail address"})
    @Column({type: DataType.STRING, unique: true, allowNull: true})
    email: string = ''
    @ApiProperty({example: '12345', description: "Password"})
    @Column({type: DataType.STRING, unique: false, allowNull: false})
    password: string = ''
    @ApiProperty({example: 'true', description: "Blocked"})
    @Column({type: DataType.BOOLEAN, unique: false, allowNull: true})
    blocked: boolean
    @ApiProperty({example: 'Наказан', description: "Block reason"})
    @Column({type: DataType.STRING, unique: false, allowNull: true})
    blockReason: string = ''

}
