import { UserAgent, Inviter } from 'sip.js';
import { EventEmitter } from './utils/events.js';
import { Logger } from './utils/logger.js';

/**
 * WebRTC Connection Manager (SIP.js implementation)
 */
export class WebRTCManager extends EventEmitter {
    constructor(apiClient) {
        super();
        this.api = apiClient;
        this.userAgent = null;
        this.session = null;
        this.localStream = null;
        this.logger = new Logger('WebRTC');
    }

    async startSession(publicKey, domain, config) {
        try {
            // 1. Request microphone access for visualizer and permission check
            this.logger.log('Requesting microphone access...');
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                }
            });

            this.emit('microphoneGranted', this.localStream);
            this.logger.log('Microphone access granted');

            // 2. Configure SIP UserAgent
            const wsServer = config?.wsUrl || 'wss://asterisk-domain.com:8089/ws';
            const sipDomain = config?.sipDomain || 'asterisk-domain.com';
            const targetUser = config?.extension || '100';

            this.logger.log(`Initializing SIP UserAgent: ${wsServer}`);

            this.userAgent = new UserAgent({
                uri: UserAgent.makeURI(`sip:anonymous@${sipDomain}`),
                transportOptions: {
                    server: wsServer
                },
                logLevel: 'error',
                delegate: {
                    onConnect: () => {
                        this.logger.log('SIP / WS Connected');
                        this.emit('connected');
                    },
                    onDisconnect: (error) => {
                        this.logger.log('SIP / WS Disconnected', error);
                        this.emit('disconnected');
                    }
                }
            });

            await this.userAgent.start();
            this.logger.log('SIP UserAgent started');

            // 3. Invite
            const targetURI = UserAgent.makeURI(`sip:${targetUser}@${sipDomain}`);
            if (!targetURI) throw new Error('Invalid target URI');

            this.logger.log(`Inviting ${targetURI}...`);
            const inviter = new Inviter(this.userAgent, targetURI, {
                sessionDescriptionHandlerOptions: {
                    constraints: { audio: true, video: false }
                }
            });

            this.session = inviter;

            // Handle session state
            inviter.stateChange.addListener((newState) => {
                this.logger.log('Session state:', newState);
                switch (newState) {
                    case 'Established':
                        this.setupRemoteAudio();
                        break;
                    case 'Terminated':
                        this.cleanup(); // Clean up session but keep UA? Or full cleanup?
                        this.emit('stopped');
                        break;
                }
            });

            this.emit('connecting');

            // Invite with extra headers for authentication/routing
            await inviter.invite({
                requestDelegate: {
                    onReject: (response) => {
                        this.logger.warn('Call rejected', response);
                        this.emit('error', 'CALL_REJECTED');
                    }
                },
                extraHeaders: [
                    `X-Widget-Key: ${publicKey}`
                ]
            });

        } catch (error) {
            this.logger.error('Failed to start session:', error);

            if (error.name === 'NotAllowedError') {
                this.emit('error', 'MICROPHONE_PERMISSION_DENIED');
            } else {
                this.emit('error', 'NETWORK_ERROR');
            }

            this.cleanup();
            throw error;
        }
    }

    setupRemoteAudio() {
        if (!this.session || !this.session.sessionDescriptionHandler) return;

        const sdh = this.session.sessionDescriptionHandler;
        const pc = sdh.peerConnection;

        if (!pc) return;

        const remoteStream = new MediaStream();

        // Collect existing tracks
        pc.getReceivers().forEach(receiver => {
            if (receiver.track) {
                remoteStream.addTrack(receiver.track);
                this.logger.log('Added remote track');
            }
        });

        // Listen for future tracks
        pc.ontrack = (event) => {
            this.logger.log('Remote track received via event');
            if (event.streams && event.streams[0]) {
                this.playAudio(event.streams[0]);
            } else if (event.track) {
                const newStream = new MediaStream([event.track]);
                this.playAudio(newStream);
            }
        };

        if (remoteStream.getTracks().length > 0) {
            this.playAudio(remoteStream);
        }
    }

    playAudio(stream) {
        const audioElement = new Audio();
        audioElement.srcObject = stream;
        audioElement.autoplay = true;
        audioElement.play().catch(e => this.logger.error('Audio play failed', e));
        this.emit('audioReceived', stream);
    }

    async stopSession() {
        this.logger.log('Stopping session...');
        if (this.session) {
            switch (this.session.state) {
                case 'Initial':
                case 'Establishing':
                    if (this.session instanceof Inviter) {
                        try {
                            await this.session.cancel();
                        } catch (e) { this.logger.warn('Cancel failed', e); }
                    }
                    break;
                case 'Established':
                    try {
                        await this.session.bye();
                    } catch (e) { this.logger.warn('Bye failed', e); }
                    break;
            }
        }

        if (this.userAgent) {
            try {
                await this.userAgent.stop();
            } catch (e) { this.logger.warn('UA stop failed', e); }
        }

        this.cleanup();
        this.emit('stopped');
    }

    cleanup() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        this.session = null;
        this.userAgent = null;
    }
}
