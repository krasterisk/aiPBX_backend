import { Injectable, Logger } from '@nestjs/common';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream, RTCRtpReceiver } from 'werift';
import { WidgetService } from './widget.service';
import { OpenAiService } from '../open-ai/open-ai.service';
import { AiCdrService } from '../ai-cdr/ai-cdr.service';

interface WidgetPeerSession {
    sessionId: string;
    peerConnection: RTCPeerConnection;
    assistantId: number;
    userId: number;
    openAiChannelId?: string;
}

@Injectable()
export class WidgetWebRTCService {
    private readonly logger = new Logger(WidgetWebRTCService.name);
    private peers = new Map<string, WidgetPeerSession>();

    constructor(
        private widgetService: WidgetService,
        private openAiService: OpenAiService,
        private aiCdrService: AiCdrService,
    ) { }

    async handleOffer(
        publicKey: string,
        domain: string,
        sdpOffer: string,
        metadata: { userAgent?: string; ipAddress?: string }
    ): Promise<{ sessionId: string; sdpAnswer: string }> {
        this.logger.log(`Handling WebRTC offer from ${domain} with key ${publicKey}`);

        // Create WebRTC PeerConnection
        const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        const peerId = peerConnection.connectionState || `peer_${Date.now()}`;

        // Create widget session in database
        const session = await this.widgetService.createSession(
            publicKey,
            domain,
            peerId,
            metadata
        );

        // Get assistant from session
        const widgetKey = (await this.widgetService.findSessionById(session.sessionId))?.widgetKey;
        if (!widgetKey) {
            throw new Error('Widget key not found');
        }

        const assistant = widgetKey.assistant;
        const userId = widgetKey.userId;

        // Store peer session
        const peerSession: WidgetPeerSession = {
            sessionId: session.sessionId,
            peerConnection,
            assistantId: assistant.id,
            userId,
        };
        this.peers.set(session.sessionId, peerSession);

        // Handle incoming audio track from browser
        peerConnection.onTrack.subscribe((track) => {
            this.logger.log(`Received audio track for session ${session.sessionId}`);
            this.handleIncomingAudioTrack(session.sessionId, track);
        });

        // Handle ICE connection state changes
        peerConnection.connectionStateChange.subscribe(() => {
            this.logger.log(`Peer connection state: ${peerConnection.connectionState} for session ${session.sessionId}`);

            if (peerConnection.connectionState === 'disconnected' ||
                peerConnection.connectionState === 'failed' ||
                peerConnection.connectionState === 'closed') {
                this.handleDisconnect(session.sessionId);
            }
        });

        // Set remote description (offer from browser)
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(sdpOffer, 'offer')
        );

        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Initialize OpenAI connection
        const channelId = `widget_${session.sessionId}`;
        await this.initializeOpenAI(session.sessionId, channelId, assistant);
        peerSession.openAiChannelId = channelId;

        this.logger.log(`Created WebRTC answer for session ${session.sessionId}`);

        return {
            sessionId: session.sessionId,
            sdpAnswer: answer.sdp,
        };
    }

    async handleIceCandidate(sessionId: string, candidate: RTCIceCandidateInit): Promise<void> {
        const peerSession = this.peers.get(sessionId);

        if (!peerSession) {
            this.logger.warn(`Session ${sessionId} not found for ICE candidate`);
            return;
        }

        try {
            await peerSession.peerConnection.addIceCandidate(
                new RTCIceCandidate({
                    candidate: candidate.candidate,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    sdpMid: candidate.sdpMid
                })
            );
            this.logger.debug(`Added ICE candidate for session ${sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to add ICE candidate for session ${sessionId}: ${error.message}`);
        }
    }

    async handleHangup(sessionId: string): Promise<void> {
        this.logger.log(`Handling hangup for session ${sessionId}`);
        await this.handleDisconnect(sessionId);
    }

    private async handleIncomingAudioTrack(sessionId: string, track: any): Promise<void> {
        const peerSession = this.peers.get(sessionId);
        if (!peerSession || !peerSession.openAiChannelId) {
            return;
        }

        // In a real implementation, we would:
        // 1. Get audio data from the MediaStreamTrack
        // 2. Convert to PCM format expected by OpenAI
        // 3. Send to OpenAI via rtInputAudioAppend

        // For now, this is a placeholder - actual implementation requires
        // reading from WebRTC MediaStreamTrack and converting to raw PCM
        this.logger.log(`Audio track handler set up for session ${sessionId}`);

        // Note: werift doesn't provide direct access to raw audio data like browser MediaStreamTrack
        // We'll need to implement audio extraction here or use a different approach
    }

    private async initializeOpenAI(sessionId: string, channelId: string, assistant: any): Promise<void> {
        try {
            // Create OpenAI connection
            await this.openAiService.createConnection(channelId, assistant);

            // Create CDR log
            await this.openAiService.cdrCreateLog(channelId, 'widget', assistant);

            this.logger.log(`Initialized OpenAI for widget session ${sessionId}, channel ${channelId}`);
        } catch (error) {
            this.logger.error(`Failed to initialize OpenAI for session ${sessionId}: ${error.message}`);
            throw error;
        }
    }

    async sendAudioToWidget(sessionId: string, audioData: Buffer): Promise<void> {
        const peerSession = this.peers.get(sessionId);

        if (!peerSession) {
            return;
        }

        // Send audio back to browser via WebRTC
        // This requires creating an audio track and sending the data
        // Actual implementation depends on werift's API for sending audio

        this.logger.debug(`Sending audio to widget session ${sessionId}`);
    }

    private async handleDisconnect(sessionId: string): Promise<void> {
        const peerSession = this.peers.get(sessionId);

        if (!peerSession) {
            return;
        }

        try {
            // Close OpenAI connection
            if (peerSession.openAiChannelId) {
                await this.openAiService.closeConnection(peerSession.openAiChannelId);

                // CDR hangup for billing
                await this.aiCdrService.cdrHangup(
                    peerSession.openAiChannelId,
                    peerSession.assistantId || null
                );
            }

            // Close peer connection
            peerSession.peerConnection.close();

            // End session in database
            await this.widgetService.endSession(sessionId);

            // Remove from map
            this.peers.delete(sessionId);

            this.logger.log(`Disconnected widget session ${sessionId}`);
        } catch (error) {
            this.logger.error(`Error during disconnect for session ${sessionId}: ${error.message}`);
        }
    }

    // Cleanup method to be called periodically
    async cleanup(): Promise<void> {
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hour

        for (const [sessionId, peerSession] of this.peers.entries()) {
            // Check if connection is stale
            if (peerSession.peerConnection.connectionState === 'disconnected' ||
                peerSession.peerConnection.connectionState === 'failed') {
                await this.handleDisconnect(sessionId);
            }
        }

        // Also cleanup database sessions
        await this.widgetService.cleanupExpiredSessions();
    }
}
