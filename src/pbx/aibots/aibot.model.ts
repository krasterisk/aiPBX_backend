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
    @ApiProperty({ example: 'voice-mail', description: "Voice mail" })
    @Column({ type: DataType.STRING, unique: true, allowNull: false })
    name: string;

    @ApiProperty({ example: 'Handle voice mail', description: "Bot instructions" })
    @Column({ type: DataType.STRING, allowNull: false }) // Add missing column
    instruction: string;

    @ApiProperty({ example: 'voice_mail.conf', description: "filename" })
    @Column({ type: DataType.STRING })
    filename: string | null; // Allow null

    @ApiProperty({ example: '4', description: "VPBX user id" })
    @Column({ type: DataType.INTEGER })
    vpbx_user_id: number;
}
