import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";
import { Assistant } from "../assistants/assistants.model";

interface CreatePbxServer {
    userId: string
    host: number
    cloudPbx?: boolean
    context?: string
    moh?: string
    recordFormat?: string
}

@Table({ tableName: "PbxServers" })
export class PbxServers extends Model<PbxServers, CreatePbxServer> {
    @ApiProperty({ example: 'aiPBX', description: "Server in Europe" })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;
    @ApiProperty({ example: 'Europe', description: "server location" })
    @Column({ type: DataType.STRING, allowNull: false })
    location: string;
    @ApiProperty({ example: 'sip.aipbx.net:5061', description: "server_address:port, default port is 5060" })
    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    sip_host: string;

    @ApiProperty({ example: 'srv_1a2b3c4d5e', description: "Unique server identifier" })
    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    uniqueId: string;

    @ApiProperty({ example: 'wss://sip.aipbx.net:8089/ws', description: "Public WSS URL for WebRTC widgets" })
    @Column({ type: DataType.STRING, allowNull: true })
    wss_url: string;
    @ApiProperty({ example: 'https://ari.aipbx.net:8084/aipbx', description: "ari url" })
    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    ari_url: string;
    @ApiProperty({ example: 'aiPbx', description: "ari user" })
    @Column({ type: DataType.STRING, allowNull: false })
    ari_user: string;
    @ApiProperty({ example: '123', description: "ari password" })
    @Column({ type: DataType.STRING, allowNull: false })
    password: string;

    @ApiProperty({ example: true, description: "Is cloud PBX available to all users" })
    @Column({ type: DataType.BOOLEAN, defaultValue: false })
    cloudPbx: boolean;

    @ApiProperty({ example: 'from-internal', description: "dialplan context for transfers" })
    @Column({ type: DataType.STRING })
    context: string;

    @ApiProperty({ example: 'default', description: "music on hold class" })
    @Column({ type: DataType.STRING, defaultValue: 'default' })
    moh: string;

    @ApiProperty({ example: 'wav', description: "recording format" })
    @Column({ type: DataType.STRING, defaultValue: 'wav' })
    recordFormat: string;

    @ApiProperty({ example: 'any comment', description: "comment" })
    @Column({ type: DataType.STRING, allowNull: true })
    comment: string;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number

    @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
    user: User;
}

