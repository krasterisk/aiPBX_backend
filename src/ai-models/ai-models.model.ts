import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";

interface CreateAiModels {
    name: string;
    userId?: number;
    publish?: boolean;
    publishName?: string;
    comment?: string;
    realtimeVendor?: string | null;
    wireModelId?: string | null;
}

@Table({ tableName: "aiModels" })
export class aiModel extends Model<aiModel, CreateAiModels> {
    @ApiProperty({ example: '1', description: "Unique ID" })
    @Column({ type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: 'gpt4-mini-realtime', description: "Ai model" })
    @Column({ type: DataType.STRING, unique: true, allowNull: false })
    name: string;

    @ApiProperty({ example: false, description: "Whether this CDR is published" })
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    publish: boolean

    @ApiProperty({ example: 'Demo call', description: "Published name" })
    @Column({ type: DataType.STRING, allowNull: true })
    publishName: string

    @ApiProperty({ example: 'beta', description: "beta llm model" })
    @Column({ type: DataType.STRING })
    comment: string

    @ApiProperty({
        example: 'yandex',
        description: 'Realtime API vendor/adapter: openai | yandex | qwen',
        enum: ['openai', 'yandex', 'qwen'],
        required: false,
    })
    @Column({ type: DataType.STRING, allowNull: true })
    realtimeVendor: string | null

    @ApiProperty({
        example: 'speech-realtime-deepseek-v4-flash/latest',
        description: 'Model id sent on realtime WebSocket (?model=). Falls back to name when empty.',
        required: false,
    })
    @Column({ type: DataType.STRING, allowNull: true })
    wireModelId: string | null
}
