import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";

interface CreateLogAttr {
    event: string;
    action: string;
    entity?: string;
    entityId?: number;
    userId: number;
}

@Table({ tableName: "systemLogs" })
export class Logs extends Model<Logs, CreateLogAttr> {
    @ApiProperty({ example: 'Created assistant "Sales Bot"', description: "Human-readable event description" })
    @Column({ type: DataType.TEXT, allowNull: true })
    event: string;

    @ApiProperty({ example: 'create', description: "Action type" })
    @Column({
        type: DataType.ENUM('create', 'update', 'delete', 'login', 'logout', 'view', 'export', 'other'),
        allowNull: false,
        defaultValue: 'other'
    })
    action: string;

    @ApiProperty({ example: 'assistant', description: "Entity type affected" })
    @Column({
        type: DataType.STRING,
        allowNull: true
    })
    entity: string;

    @ApiProperty({ example: 42, description: "ID of the affected entity" })
    @Column({ type: DataType.INTEGER, allowNull: true })
    entityId: number;

    @ApiProperty({ example: '{"name": "Old Bot"}', description: "Previous data before change" })
    @Column({ type: DataType.JSON, allowNull: true })
    oldData: any;

    @ApiProperty({ example: '{"name": "New Bot"}', description: "Updated data after change" })
    @Column({ type: DataType.JSON, allowNull: true })
    newData: any;

    @ApiProperty({ example: '192.168.1.1', description: "Client IP address" })
    @Column({ type: DataType.STRING, allowNull: true })
    ipAddress: string;

    @ApiProperty({ example: 'Mozilla/5.0...', description: "Client User-Agent" })
    @Column({ type: DataType.STRING, allowNull: true })
    userAgent: string;

    @ApiProperty({ example: 1, description: "Legacy event ID" })
    @Column({ type: DataType.INTEGER, allowNull: true })
    eventId: number;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    userId: number;

    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User;
}
