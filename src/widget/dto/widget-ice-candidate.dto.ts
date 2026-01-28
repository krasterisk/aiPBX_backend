import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsObject } from "class-validator";

export class WidgetIceCandidateDto {
    @ApiProperty({
        example: 'sess_1a2b3c4d5e6f7g8h',
        description: 'Session ID from offer response',
        required: true
    })
    @IsString()
    sessionId: string;

    @ApiProperty({
        example: {
            candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
            sdpMLineIndex: 0,
            sdpMid: '0'
        },
        description: 'ICE candidate object',
        required: true
    })
    @IsObject()
    candidate: RTCIceCandidateInit;
}
