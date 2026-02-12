import { BelongsTo, BelongsToMany, Column, DataType, ForeignKey, HasOne, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";
import { AiTool } from "../ai-tools/ai-tool.model";
import { AssistantToolsModel } from "../ai-tools/assistant-tools.model";
import { SipAccounts } from "../pbx-servers/sip-accounts.model";

interface CreateAssistantAttr {
    name: string;
    userId: number;
}

@Table({ tableName: "aiAssistants" })
export class Assistant extends Model<Assistant, CreateAssistantAttr> {
    @ApiProperty({ example: 'VoiceBot', description: "Ai Bot name" })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;
    @ApiProperty({ example: 'Bot unique id', description: "Ai Bot unique id" })
    @Column({ type: DataType.STRING, allowNull: false })
    uniqueId: string;
    @ApiProperty({ example: 'Hello, what can i do for you?', description: "Greeting phrase" })
    @Column({ type: DataType.TEXT, allowNull: true })
    greeting: string
    @ApiProperty({ example: 'GPT-4o', description: "Model name" })
    @Column({ type: DataType.STRING, allowNull: false })
    model: string
    @ApiProperty({ example: 'Alloy', description: "TTS Voice" })
    @Column({ type: DataType.STRING, allowNull: false })
    voice: string
    @ApiProperty({ example: 'pcm16', description: "Input audio format" })
    @Column({ type: DataType.STRING, allowNull: true })
    input_audio_format: string
    @ApiProperty({ example: 'pcm16', description: "Output audio format" })
    @Column({ type: DataType.STRING, allowNull: true })
    output_audio_format: string
    @ApiProperty({ example: 'You are a helpful consultant by name Alex', description: "Bot instructions" })
    @Column({ type: DataType.TEXT, allowNull: false })
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
    @ApiProperty({ example: '10000', description: "Idle timeout ms" })
    @Column({ type: DataType.STRING, allowNull: true })
    idle_timeout_ms: string
    @ApiProperty({ example: 'auto', description: "Tool choice method" })
    @Column({ type: DataType.STRING, allowNull: true })
    tool_choice: string
    @ApiProperty({ example: 'auto', description: "Semantic eagerness(Low,Medium,High)" })
    @Column({ type: DataType.STRING, allowNull: true })
    semantic_eagerness: string
    @ApiProperty({ example: 'none', description: "Type of noise reduction: none, near_field, far_field" })
    @Column({ type: DataType.STRING, allowNull: true })
    input_audio_noise_reduction: string
    @ApiProperty({ example: '0.8', description: "Temperature" })
    @Column({ type: DataType.STRING, allowNull: true })
    temperature: string
    @ApiProperty({ example: 'inf', description: "Max tokens" })
    @Column({ type: DataType.STRING, allowNull: true })
    max_response_output_tokens: string
    @ApiProperty({ example: 'default', description: "moh class" })
    @Column({ type: DataType.STRING, allowNull: true })
    moh: string
    @ApiProperty({ example: true, description: "Enable post-call analytics" })
    @Column({ type: DataType.BOOLEAN, defaultValue: false, allowNull: true })
    analytic: boolean;
    @ApiProperty({ example: 'comment', description: "Any comments" })
    @Column({ type: DataType.STRING, allowNull: true })
    comment: string
    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER })
    userId: number
    @BelongsTo(() => User, { onDelete: 'CASCADE' })
    user: User

    @BelongsToMany(() => AiTool, () => AssistantToolsModel)
    tools: AiTool[]

    @HasOne(() => SipAccounts)
    sipAccount: SipAccounts
}
