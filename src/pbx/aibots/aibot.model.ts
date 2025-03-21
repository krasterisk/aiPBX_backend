import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";

interface CreateAiBotAttr {
    name: string;
    instruction: string; // Added to the model
    vpbx_user_id: number;
    filename?: string | null; // Optional in creation
}

@Table({ tableName: "pbxAiBots" })
export class AiBot extends Model<AiBot, CreateAiBotAttr> {
    @ApiProperty({ example: 'VoiceBot', description: "Ai Bot name" })
    @Column({ type: DataType.STRING, unique: true, allowNull: false })
    name: string;

    @ApiProperty({ example: 'You are a helpful consultant by name Alex', description: "Bot instructions" })
    @Column({ type: DataType.STRING, allowNull: false })
    instruction: string;

    @ApiProperty({ example: '4', description: "vPbx user id" })
    @Column({ type: DataType.INTEGER })
    vpbx_user_id: number;
}
