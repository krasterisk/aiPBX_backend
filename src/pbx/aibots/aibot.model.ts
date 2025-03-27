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
    @ApiProperty({ example: 'Alloy', description: "TTS Voice" })
    @Column({ type: DataType.STRING, unique: true, allowNull: false })
    voice: string
    @ApiProperty({ example: 'pcm16', description: "Input audio format" })
    @Column({ type: DataType.STRING, allowNull: true })
    input_audio_format: string
    @ApiProperty({ example: 'pcm16', description: "Output audio format" })
    @Column({ type: DataType.STRING, allowNull: true })
    output_audio_format: string
    @ApiProperty({ example: 'You are a helpful consultant by name Alex', description: "Bot instructions" })
    @Column({ type: DataType.STRING, allowNull: false })
    instruction: string;
    @ApiProperty({ example: 'whisper-1', description: "Input audio transcription model" })
    @Column({ type: DataType.STRING, allowNull: true })
    input_audio_transcription_model: string
    @ApiProperty({ example: 'en', description: "Input audio transcription language" })
    @Column({ type: DataType.STRING, allowNull: true })
    input_audio_transcription_language: string
    @ApiProperty({ example: 'server_vad', description: "Turn detection type" })
    @Column({ type: DataType.STRING, allowNull: true })
    turn_detection_type: string
    @ApiProperty({ example: '0.5', description: "Turn detection threshold" })
    @Column({ type: DataType.STRING, allowNull: true })
    turn_detection_threshold: string
    @ApiProperty({ example: '300', description: "Prefix padding ms" })
    @Column({ type: DataType.STRING, allowNull: true })
    turn_detection_prefix_padding_ms: string
    @ApiProperty({ example: '500', description: "Silence duration ms" })
    @Column({ type: DataType.STRING, allowNull: true })
    turn_detection_silence_duration_ms: string
    @ApiProperty({ example: 'Auto', description: "Semantic eagerness(Low,Medium,High)" })
    @Column({ type: DataType.STRING, allowNull: true })
    semantic_eagerness: string
    @ApiProperty({ example: '0.8', description: "Temperature" })
    @Column({ type: DataType.STRING, allowNull: true })
    temperature: string
    @ApiProperty({ example: 'tools', description: "JSON object" })
    @Column({ type: DataType.TEXT, allowNull: true })
    tools: string
    @ApiProperty({ example: '4', description: "vPbx user id" })
    @Column({ type: DataType.INTEGER })
    vpbx_user_id: number;
}
