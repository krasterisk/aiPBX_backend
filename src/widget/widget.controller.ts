import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    Headers,
    Ip,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WidgetWebRTCService } from './widget-webrtc.service';
import { WidgetService } from './widget.service';
import { WidgetKeysService } from '../widget-keys/widget-keys.service';
import { WidgetOfferDto } from './dto/widget-offer.dto';
import { WidgetIceCandidateDto } from './dto/widget-ice-candidate.dto';
import { WidgetHangupDto } from './dto/widget-hangup.dto';

@ApiTags('Widget (Public)')
@Controller('widget')
export class WidgetController {
    constructor(
        private readonly widgetWebRTCService: WidgetWebRTCService,
        private readonly widgetService: WidgetService,
        private readonly widgetKeysService: WidgetKeysService,
    ) { }

    @Post('offer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Create WebRTC session with SDP offer (public endpoint)' })
    @ApiResponse({
        status: 200,
        description: 'WebRTC session created, returns SDP answer',
        schema: {
            type: 'object',
            properties: {
                sessionId: { type: 'string', example: 'sess_1a2b3c4d5e6f7g8h' },
                sdpAnswer: { type: 'string', example: 'v=0\r\no=- ...' }
            }
        }
    })
    @ApiResponse({ status: 403, description: 'Forbidden - Invalid key or domain' })
    @ApiResponse({ status: 404, description: 'Widget key not found' })
    @ApiResponse({ status: 400, description: 'Max concurrent sessions reached' })
    async handleOffer(
        @Body() dto: WidgetOfferDto,
        @Headers('user-agent') userAgent: string,
        @Ip() ipAddress: string,
    ): Promise<{ sessionId: string; sdpAnswer: string }> {
        return this.widgetWebRTCService.handleOffer(
            dto.publicKey,
            dto.domain,
            dto.sdpOffer,
            { userAgent, ipAddress }
        );
    }

    @Post('ice-candidate')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Add ICE candidate to existing session' })
    @ApiResponse({ status: 200, description: 'ICE candidate added' })
    @ApiResponse({ status: 404, description: 'Session not found' })
    async handleIceCandidate(@Body() dto: WidgetIceCandidateDto): Promise<{ success: boolean }> {
        await this.widgetWebRTCService.handleIceCandidate(dto.sessionId, dto.candidate);
        return { success: true };
    }

    @Post('hangup')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Terminate widget session' })
    @ApiResponse({ status: 200, description: 'Session terminated' })
    @ApiResponse({ status: 404, description: 'Session not found' })
    async handleHangup(@Body() dto: WidgetHangupDto): Promise<{ success: boolean }> {
        await this.widgetWebRTCService.handleHangup(dto.sessionId);
        return { success: true };
    }

    @Get('config/:publicKey')
    @ApiOperation({ summary: 'Get widget configuration (public endpoint)' })
    @ApiResponse({
        status: 200,
        description: 'Widget configuration',
        schema: {
            type: 'object',
            properties: {
                assistantName: { type: 'string', example: 'Customer Support Bot' },
                greeting: { type: 'string', example: 'Hello! How can I help you?' },
                voice: { type: 'string', example: 'alloy' }
            }
        }
    })

    @ApiResponse({ status: 404, description: 'Widget key not found' })
    @ApiResponse({ status: 403, description: 'Widget key is not active' })
    async getConfig(@Param('publicKey') publicKey: string): Promise<any> {
        const widgetKey = await this.widgetKeysService.findByPublicKey(publicKey);

        if (!widgetKey) {
            throw new Error('Widget key not found');
        }

        if (!widgetKey.isActive) {
            throw new Error('Widget key is not active');
        }

        const assistant = widgetKey.assistant;

        return {
            assistantName: assistant.name,
            greeting: assistant.greeting || 'Hello! How can I assist you today?',
            voice: assistant.voice,
        };
    }
}
