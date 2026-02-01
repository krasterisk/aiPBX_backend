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
import { TelegramService } from '../telegram/telegram.service';
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
        private readonly telegramService: TelegramService,
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
        console.log('handleHangup', dto);
        await this.widgetWebRTCService.handleHangup(dto.sessionId, dto.publicKey);
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
                assistantId: { type: 'string', example: 'uuid-1234-5678' },
                assistantName: { type: 'string', example: 'Customer Support Bot' },
                greeting: { type: 'string', example: 'Hello! How can I help you?' },
                voice: { type: 'string', example: 'alloy' },
                language: { type: 'string', example: 'en' },
                wsUrl: { type: 'string', example: 'wss://pbx.example.com:8089/ws' },
                sipDomain: { type: 'string', example: 'pbx.example.com' },
                logo: { type: 'string', example: '/static/uuid.jpg' }
            }
        }
    })

    @ApiResponse({ status: 404, description: 'Widget key not found' })
    @ApiResponse({ status: 403, description: 'Widget key is not active or domain not allowed' })
    @ApiResponse({ status: 400, description: 'Max concurrent sessions reached' })
    async getConfig(
        @Param('publicKey') publicKey: string,
        @Headers('origin') origin?: string,
        @Headers('referer') referer?: string,
    ): Promise<any> {
        // Determine domain from Origin or Referer header
        const domain = origin || (referer ? new URL(referer).hostname : undefined);

        const widgetKey = await this.widgetService.validateKey(publicKey, domain);

        // Notify via Telegram that widget was loaded/opened
        const tgMessage = `<b>🌐 Widget Loaded</b>\n\n` +
            `<b>Domain:</b> ${domain || 'unknown'}\n` +
            `<b>Widget:</b> ${widgetKey.name}\n` +
            `<b>Assistant:</b> ${widgetKey.assistant.name}`;

        this.telegramService.sendMessage(tgMessage, { parse_mode: 'HTML' })
            .catch(err => console.warn(`Failed to send Telegram notification: ${err.message}`));

        const assistant = widgetKey.assistant;
        const pbxServer = widgetKey.pbxServer;

        // Determine WSS URL:
        // 1. Use explicit WSS URL if set in PbxServers
        // 2. Fallback to constructing from SIP host if possible (assuming standard port 8089 and WSS)
        // 3. Null (client will use default or fail)
        let wsUrl = pbxServer?.wss_url;

        if (!wsUrl && pbxServer?.sip_host) {
            // Basic fallback heuristic: replace port 5060/5061 with 8089 and prepend wss://
            const hostPart = pbxServer.sip_host.split(':')[0];
            wsUrl = `wss://${hostPart}:8089/ws`;
        }

        return {
            assistantId: assistant.uniqueId,
            assistantName: widgetKey.name || assistant.name,
            greeting: assistant.greeting || 'Hello! How can I assist you today?',
            voice: assistant.voice,
            language: widgetKey.language || 'en',
            wsUrl: wsUrl,
            sipDomain: pbxServer?.sip_host ? pbxServer.sip_host.split(':')[0] : undefined,
            logo: widgetKey.logo ? `/static/${widgetKey.logo}` : undefined,
        };
    }
}
