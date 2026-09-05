import { Logger } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { ApiKeyService, API_KEY_SCOPES } from '../api-keys/api-key.service';
import { extractApiKeyToken, VoiceSessionStartDto } from './voice-session.protocol';
import { VoiceSessionService } from './voice-session.service';

@WebSocketGateway(3033, {
    namespace: '/voice',
    cors: { origin: '*' },
})
export class VoiceSessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(VoiceSessionGateway.name);

    @WebSocketServer()
    server: Namespace;

    constructor(
        private readonly apiKeyService: ApiKeyService,
        private readonly voiceSessionService: VoiceSessionService,
    ) {}

    afterInit(server: Namespace) {
        server.use(async (socket, next) => {
            const token = extractApiKeyToken(socket.handshake);
            if (!token?.startsWith('aipbx_')) {
                return next(new Error('unauthorized'));
            }
            const apiKey = await this.apiKeyService.validate(token, API_KEY_SCOPES.VOICE_SESSION);
            if (!apiKey) {
                return next(new Error('unauthorized'));
            }
            socket.data.userId = apiKey.userId;
            socket.data.apiKeyId = apiKey.id;
            next();
        });
        this.logger.log('Voice session namespace /voice listening on port 3033');
    }

    handleConnection(client: Socket) {
        this.logger.log(`Voice client connected: ${client.id} userId=${client.data.userId}`);
    }

    async handleDisconnect(client: Socket) {
        this.logger.log(`Voice client disconnected: ${client.id}`);
        await this.voiceSessionService.endSession(client.id);
    }

    @SubscribeMessage('session.start')
    async onStart(@MessageBody() dto: VoiceSessionStartDto | undefined, @ConnectedSocket() client: Socket) {
        await this.voiceSessionService.startSession(
            client,
            Number(client.data.userId),
            dto ?? { assistantId: '' },
        );
    }

    @SubscribeMessage('audio')
    async onAudio(@MessageBody() audio: unknown, @ConnectedSocket() client: Socket) {
        await this.voiceSessionService.handleAudio(client.id, audio);
    }

    @SubscribeMessage('session.end')
    async onEnd(@ConnectedSocket() client: Socket) {
        await this.voiceSessionService.endSession(client.id);
        client.emit('session.ended');
    }
}
