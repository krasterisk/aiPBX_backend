import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";

interface CreateAiModels {
    name: string;
    userId: number;
}

@Table({ tableName: "aiModels" })
export class aiModel extends Model<aiModel, CreateAiModels> {
    @ApiProperty({ example: '1', description: "Unique ID" })
    @Column({ type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: 'gpt4-mini-realtime', description: "Ai model" })
    @Column({ type: DataType.STRING, unique: true, allowNull: false })
    name: string;
    @ApiProperty({ example: 'beta', description: "beta llm model" })
    @Column({ type: DataType.STRING })
    comment: string
}
