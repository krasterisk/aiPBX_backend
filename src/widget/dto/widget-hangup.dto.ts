import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class WidgetHangupDto {
    @ApiProperty({
        example: 'sess_1a2b3c4d5e6f7g8h',
        description: 'Session ID to terminate',
        required: true
    })
    @IsString()
    sessionId: string;
}
