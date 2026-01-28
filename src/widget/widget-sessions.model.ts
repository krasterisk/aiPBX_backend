import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { WidgetKey } from "../widget-keys/widget-keys.model";

interface WidgetSessionCreationAttrs {
    sessionId: string;
    widgetKeyId: number;
    peerId: string;
    domain: string;
    userAgent?: string;
    ipAddress?: string;
    startedAt?: Date;
    endedAt?: Date;
    isActive?: boolean;
}

@Table({ tableName: "widget_sessions" })
export class WidgetSession extends Model<WidgetSession, WidgetSessionCreationAttrs> {
    @ApiProperty({ example: 'sess_1a2b3c4d5e6f7g8h', description: "Unique session ID" })
    @Column({ type: DataType.STRING, unique: true, allowNull: false })
    sessionId: string;

    @ApiProperty({ example: 1, description: "Widget Key ID" })
    @ForeignKey(() => WidgetKey)
    @Column({ type: DataType.INTEGER, allowNull: false })
    widgetKeyId: number;

    @ApiProperty({ example: 'peer_xyz123', description: "WebRTC Peer Connection ID" })
    @Column({ type: DataType.STRING, allowNull: false })
    peerId: string;

    @ApiProperty({ example: 'example.com', description: "Domain from which widget connected" })
    @Column({ type: DataType.STRING, allowNull: false })
    domain: string;

    @ApiProperty({ example: 'Mozilla/5.0...', description: "User agent string" })
    @Column({ type: DataType.TEXT, allowNull: true })
    userAgent: string;

    @ApiProperty({ example: '192.168.1.1', description: "Client IP address" })
    @Column({ type: DataType.STRING, allowNull: true })
    ipAddress: string;

    @ApiProperty({ example: '2026-01-27T15:30:00Z', description: "Session start time" })
    @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
    startedAt: Date;

    @ApiProperty({ example: '2026-01-27T15:45:00Z', description: "Session end time" })
    @Column({ type: DataType.DATE, allowNull: true })
    endedAt: Date;

    @ApiProperty({ example: true, description: "Is session active" })
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
    isActive: boolean;

    @BelongsTo(() => WidgetKey)
    widgetKey: WidgetKey;
}
