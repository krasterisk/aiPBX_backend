import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "../users/users.model";
import {PbxServers} from "./pbx-servers.model";

interface CreateSipAccount {
    auth: string
    pass: string
    extension: string
    userId: number
    pbxId: number
}

@Table({ tableName: "SipAccounts" })
export class SipAccounts extends Model<SipAccounts, CreateSipAccount> {
    @ApiProperty({example: 'sip1', description: "authName"})
    @Column({type: DataType.STRING, allowNull: false})
    auth: string;
    @ApiProperty({example: '12345', description: "password"})
    @Column({type: DataType.STRING, allowNull: false})
    pass: string;
    @ApiProperty({example: '111', description: "Extension for call"})
    @Column({type: DataType.STRING, allowNull: false})
    extension: string;

    @ForeignKey(() => PbxServers)
    @Column({type: DataType.INTEGER})
    pbxId: number

    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER})
    userId: number
}
