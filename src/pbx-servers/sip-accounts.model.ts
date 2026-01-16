import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";
import { PbxServers } from "./pbx-servers.model";
import { Assistant } from "src/assistants/assistants.model";

interface CreateSipAccount {
    sipUri: string
    ipAddress: string
    pbxId?: number
    assistantId?: number
    userId?: number
}

@Table({ tableName: "SipAccounts" })
export class SipAccounts extends Model<SipAccounts, CreateSipAccount> {
    @ApiProperty({ example: 'test@sip.com', description: "sip uri" })
    @Column({ type: DataType.STRING, allowNull: false })
    sipUri: string;
    @ApiProperty({ example: '1.1.1.1', description: "ip address" })
    @Column({ type: DataType.STRING, allowNull: false })
    ipAddress: string;

    @ForeignKey(() => PbxServers)
    @Column({ type: DataType.INTEGER })
    pbxId: number

    @ForeignKey(() => Assistant)
    @Column({ type: DataType.INTEGER })
    assistantId: number

    @BelongsTo(() => Assistant)
    assistant: Assistant

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number

    @BelongsTo(() => User)
    user: User
}
