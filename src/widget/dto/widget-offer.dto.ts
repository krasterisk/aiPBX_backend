import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class WidgetOfferDto {
    @ApiProperty({
        example: 'wk_1a2b3c4d5e6f7g8h9i0j',
        description: 'Public widget key',
        required: true
    })
    @IsString()
    publicKey: string;

    @ApiProperty({
        example: 'example.com',
        description: 'Domain from which widget is connecting',
        required: true
    })
    @IsString()
    domain: string;

    @ApiProperty({
        example: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\n...',
        description: 'WebRTC SDP Offer',
        required: true
    })
    @IsString()
    sdpOffer: string;
}
