import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";
import { PbxServers } from "../pbx-servers/pbx-servers.model";
import { Assistant } from "../assistants/assistants.model";

interface CreateSipTrunk {
    userId: number;
    assistantId: number;
    serverId: number;
    name: string;
    trunkType: 'registration' | 'ip';
    sipServerAddress: string;
    transport: 'udp' | 'tcp' | 'tls';
    authName?: string;
    password?: string;
    domain?: string;
    callerId?: string;
    providerIp?: string;
    active?: boolean;
    records?: boolean;
}

@Table({ tableName: "SipTrunks" })
export class SipTrunks extends Model<SipTrunks, CreateSipTrunk> {
    @ApiProperty({ example: 'My SIP Trunk', description: "Trunk display name" })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: 'registration', description: "Trunk type: registration or ip" })
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'registration' })
    trunkType: 'registration' | 'ip';

    @ApiProperty({ example: 'sip.provider.com:5060', description: "External SIP server address (host:port)" })
    @Column({ type: DataType.STRING, allowNull: false })
    sipServerAddress: string;

    @ApiProperty({ example: 'udp', description: "SIP transport protocol" })
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'udp' })
    transport: 'udp' | 'tcp' | 'tls';

    @ApiProperty({ example: 'myuser', description: "Auth username (registration only)" })
    @Column({ type: DataType.STRING, allowNull: true })
    authName: string;

    @ApiProperty({ example: 'secret', description: "Auth password (registration only)" })
    @Column({ type: DataType.STRING, allowNull: true })
    password: string;

    @ApiProperty({ example: 'sip.provider.com', description: "SIP domain (registration only)" })
    @Column({ type: DataType.STRING, allowNull: true })
    domain: string;

    @ApiProperty({ example: '+74951234567', description: "Caller ID (ip trunk only)" })
    @Column({ type: DataType.STRING, allowNull: true })
    callerId: string;

    @ApiProperty({ example: '203.0.113.10', description: "Provider IP address (ip trunk only)" })
    @Column({ type: DataType.STRING, allowNull: true })
    providerIp: string;

    @ApiProperty({ example: true, description: "Is trunk active" })
    @Column({ type: DataType.BOOLEAN, defaultValue: true })
    active: boolean;

    @ApiProperty({ example: true, description: "Enable call recording" })
    @Column({ type: DataType.BOOLEAN, defaultValue: false })
    records: boolean;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number;

    @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
    user: User;

    @ForeignKey(() => Assistant)
    @Column({ type: DataType.INTEGER })
    assistantId: number;

    @BelongsTo(() => Assistant)
    assistant: Assistant;

    @ForeignKey(() => PbxServers)
    @Column({ type: DataType.INTEGER })
    serverId: number;

    @BelongsTo(() => PbxServers)
    server: PbxServers;
}
