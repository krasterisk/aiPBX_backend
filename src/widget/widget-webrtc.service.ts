import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream, RTCRtpReceiver, MediaStreamTrack } from 'werift';
import { WidgetService } from './widget.service';
import { OpenAiService, sessionData } from '../open-ai/open-ai.service';
import { AiCdrService } from '../ai-cdr/ai-cdr.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Assistant } from '../assistants/assistants.model';
import { Injectable, Logger } from '@nestjs/common';

interface WidgetPeerSession {
    sessionId: string;
    peerConnection: RTCPeerConnection;
    assistantId: number;
    userId: number;
    openAiChannelId?: string;
    assistant: Assistant;
    audioDeltaHandler?: (outAudio: Buffer, serverData: sessionData) => Promise<void>;
    audioInterruptHandler?: (serverData: sessionData) => Promise<void>;
    outgoingTrack?: MediaStreamTrack;
    createdAt: number;
    maxDuration: number; // In seconds
}

@Injectable()
export class WidgetWebRTCService {
    private readonly logger = new Logger(WidgetWebRTCService.name);
    private peers = new Map<string, WidgetPeerSession>();

    constructor(
        private widgetService: WidgetService,
        private openAiService: OpenAiService,
        private aiCdrService: AiCdrService,
        private eventEmitter: EventEmitter2,
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

        // Initialize local audio track for sending back to browser
        const outgoingTrack = new MediaStreamTrack({ kind: "audio" });
        peerConnection.addTrack(outgoingTrack);

        // Store peer session
        const peerSession: WidgetPeerSession = {
            sessionId: session.sessionId,
            peerConnection,
            assistantId: assistant.id,
            userId,
            assistant,
            outgoingTrack,
            createdAt: Date.now(),
            maxDuration: widgetKey.maxSessionDuration || 600,
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

        // Register event handlers BEFORE creating connection
        this.registerOpenAiHandlers(peerSession, channelId, assistant);

        await this.initializeOpenAI(session.sessionId, channelId, assistant);
        peerSession.openAiChannelId = channelId;

        this.logger.log(`Created WebRTC answer for session ${session.sessionId}`);

        return {
            sessionId: session.sessionId,
            sdpAnswer: answer.sdp,
        };
    }

    private registerOpenAiHandlers(peerSession: WidgetPeerSession, channelId: string, assistant: Assistant) {
        const sessionId = peerSession.sessionId;

        // Handler for all OpenAI events
        const eventHandler = (event: any) => {
            this.openAiService.dataDecode(
                event,
                channelId,
                'Widget-WebRTC',
                assistant
            );
        };

        // Listen for connection ready
        this.eventEmitter.once(`openai.connected.${channelId}`, async () => {
            this.logger.log(`OpenAI connection ready for widget session ${sessionId}, initializing session settings...`);

            const sData: sessionData = {
                channelId,
                callerId: 'Widget-WebRTC',
                address: 'webrtc',
                port: '0',
                init: 'true',
                assistant
            };

            try {
                // Configure session (voice, instructions, etc)
                await this.openAiService.updateRtAudioSession(sData);
                // Start the conversation
                await this.openAiService.rtInitAudioResponse(sData);
                this.logger.log(`OpenAI session initialized for widget ${sessionId}`);
            } catch (error) {
                this.logger.error(`Failed to initialize OpenAI session for widget ${sessionId}: ${error.message}`);
            }
        });

        // Forward audio from OpenAI back to WebRTC
        peerSession.audioDeltaHandler = async (outAudio: Buffer, serverData: sessionData) => {
            this.logger.debug(`Received audio delta from OpenAI for widget ${sessionId}, size: ${outAudio.length}`);
            await this.sendAudioToWidget(sessionId, outAudio);
        };

        // Handle interrupts (user spoke while AI was speaking)
        peerSession.audioInterruptHandler = async (serverData: sessionData) => {
            this.logger.log(`Audio interrupt for widget ${sessionId}`);
            // TODO: Logic to stop playing current audio buffer in the browser if possible
            // Usually this requires sending a message to the browser via Datachannel or just stopping the stream
        };

        this.eventEmitter.on(`openai.${channelId}`, eventHandler);
        this.eventEmitter.on(`audioDelta.${channelId}`, peerSession.audioDeltaHandler);
        this.eventEmitter.on(`audioInterrupt.${channelId}`, peerSession.audioInterruptHandler);

        this.eventEmitter.on(`HangupCall.${channelId}`, () => {
            this.logger.log(`Received HangupCall from OpenAI for widget ${sessionId}`);
            this.handleHangup(sessionId);
        });
    }

    async handleIceCandidate(sessionId: string, candidate: RTCIceCandidateInit): Promise<void> {
        if (!sessionId || sessionId === 'null') {
            this.logger.debug(`Received ICE candidate for null session - ignoring`);
            return;
        }

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

        this.logger.log(`Setting up audio ingestion for session ${sessionId}`);

        // Subscribe to incoming RTP packets
        track.onReceiveRtp.subscribe((packet) => {
            // Werift provides raw RTP packets.
            // We need to extract the payload (audio) from the RTP packet.
            // OpenAI expectations:
            // - gpt-4o Realtime: 24kHz, 16-bit PCM, mono, little-endian

            // For now, we assume the input is already in a compatible format 
            // or use a placeholder similar to RtpUdpServerService.
            // Actual implementation would need an Opus decoder if browsers send Opus.

            const payload = packet.payload;

            // Forward payload to OpenAI
            this.openAiService.rtInputAudioAppend(payload, peerSession.openAiChannelId);
        });
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

        if (!peerSession || !peerSession.outgoingTrack) {
            return;
        }

        try {
            // Forward audio to WebRTC track
            // Note: This requires the audio to be encoded to RTP.
            // Werift's MediaStreamTrack.writeRtp() or similar method should be used.

            this.logger.debug(`Sending ${audioData.length} bytes to WebRTC track for session ${sessionId}`);

            // For now, we are just logging that we received the audio to send.
            // Full RTP packetization/encoding should be implemented here.
        } catch (error) {
            this.logger.error(`Error sending audio to widget ${sessionId}: ${error.message}`);
        }
    }

    private async handleDisconnect(sessionId: string): Promise<void> {
        const peerSession = this.peers.get(sessionId);

        if (!peerSession) {
            return;
        }

        try {
            // Cleanup event listeners
            if (peerSession.openAiChannelId) {
                this.eventEmitter.removeAllListeners(`openai.${peerSession.openAiChannelId}`);
                if (peerSession.audioDeltaHandler) {
                    this.eventEmitter.off(`audioDelta.${peerSession.openAiChannelId}`, peerSession.audioDeltaHandler);
                }
                if (peerSession.audioInterruptHandler) {
                    this.eventEmitter.off(`audioInterrupt.${peerSession.openAiChannelId}`, peerSession.audioInterruptHandler);
                }

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

        for (const [sessionId, peerSession] of this.peers.entries()) {
            const elapsedSeconds = (now - peerSession.createdAt) / 1000;

            // Check if connection is stale or expired
            if (peerSession.peerConnection.connectionState === 'disconnected' ||
                peerSession.peerConnection.connectionState === 'failed' ||
                elapsedSeconds >= peerSession.maxDuration) {

                if (elapsedSeconds >= peerSession.maxDuration) {
                    this.logger.log(`Session ${sessionId} expired (max duration ${peerSession.maxDuration}s reached)`);
                }
                await this.handleDisconnect(sessionId);
            }
        }

        // Also cleanup database sessions
        await this.widgetService.cleanupExpiredSessions();
    }
}
