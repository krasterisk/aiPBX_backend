import { Controller } from '@nestjs/common';
import { PlaygroundService } from './playground.service';

@Controller('assistants/playground')
export class PlaygroundController {
    constructor(private readonly playgroundService: PlaygroundService) { }

    // Legacy WebRTC SDP endpoint - deprecated in favor of WebSocket connection
    // @Post('sdp')
    // async sendSdpOffer(@Body() body: PlaygroundSdpDto): Promise<PlaygroundSdpResponse> {
    //     throw new Error('WebRTC playground is deprecated. Use WebSocket connection.');
    // }
}
