import './styles.css';
import { ApiClient } from './api-client.js';
import { WebRTCManager } from './webrtc-manager.js';
import { FloatingButton } from './components/floating-button.js';
import { ModalWindow } from './components/modal-window.js';
import { Logger } from './utils/logger.js';

/**
 * Main AI Voice Widget Class
 */
class AIVoiceWidget {
    constructor(publicKey, apiUrl, wssUrl = null) {
        this.publicKey = publicKey;
        this.apiUrl = apiUrl;
        this.wssUrl = wssUrl;
        this.config = null;
        this.logger = new Logger('AIWidget');

        // Components
        this.api = new ApiClient(apiUrl);
        this.webrtc = new WebRTCManager(this.api);
        this.floatingButton = new FloatingButton();
        this.modal = null;

        // State
        this.isSessionActive = false;
    }

    async init() {
        try {
            this.logger.log('Initializing widget with key:', this.publicKey);

            // Fetch configuration
            this.config = await this.api.fetchConfig(this.publicKey);
            this.logger.log('Configuration loaded:', this.config);

            // Create UI
            this.modal = new ModalWindow(this.config);
            this.setupEventListeners();

            // Show floating button
            this.floatingButton.show();

            // Export global API
            this.exposePublicAPI();

            this.logger.log('Widget initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize widget:', error);
            this.showError('Failed to initialize AI assistant. Please check your configuration.');
        }
    }

    setupEventListeners() {
        // Floating button
        this.floatingButton.on('click', () => {
            if (!this.isSessionActive) {
                this.modal.show();
            }
        });

        // Modal
        this.modal.on('close', () => {
            if (this.isSessionActive) {
                this.stopSession();
            }
        });

        this.modal.on('start', () => {
            this.startSession();
        });

        this.modal.on('stop', () => {
            this.stopSession();
        });

        // WebRTC events
        this.webrtc.on('connecting', () => {
            this.modal.setStatus('connecting', 'Connecting...');
        });

        this.webrtc.on('microphoneGranted', (stream) => {
            this.logger.log('Microphone granted, attaching visualizer');
            this.modal.attachVisualizer(stream);
        });

        this.webrtc.on('connected', () => {
            this.logger.log('Successfully connected');
            this.modal.setStatus('connected', 'Connected! Start talking...');
            this.isSessionActive = true;
        });

        this.webrtc.on('audioReceived', (stream) => {
            this.logger.log('Receiving audio from AI');
        });

        this.webrtc.on('disconnected', () => {
            this.logger.log('Disconnected');
            this.stopSession();
        });

        this.webrtc.on('stopped', () => {
            this.modal.setStatus('ready', 'Ready to talk...');
            this.modal.destroyVisualizer();
            this.isSessionActive = false;
        });

        this.webrtc.on('error', (errorType) => {
            this.handleError(errorType);
        });
    }

    async startSession() {
        try {
            const domain = window.location.hostname;
            // Merge config with defaults
            const sessionConfig = {
                ...this.config,
                wsUrl: this.config?.wsUrl || this.wssUrl
            };
            await this.webrtc.startSession(this.publicKey, domain, sessionConfig);
        } catch (error) {
            this.logger.error('Failed to start session:', error);
        }
    }

    async stopSession() {
        try {
            await this.webrtc.stopSession();
        } catch (error) {
            this.logger.error('Failed to stop session:', error);
        }
    }

    handleError(errorType) {
        let message;

        switch (errorType) {
            case 'MICROPHONE_PERMISSION_DENIED':
                message = 'Please allow microphone access to use voice chat';
                break;
            case 'NETWORK_ERROR':
                message = 'Connection failed. Please check your internet';
                break;
            case 'INVALID_KEY':
                message = 'Widget configuration error. Please contact support';
                break;
            case 'MAX_SESSIONS_REACHED':
                message = 'Service is busy. Please try again in a few minutes';
                break;
            case 'DOMAIN_NOT_ALLOWED':
                message = 'This widget is not authorized for this domain';
                break;
            default:
                message = 'An error occurred. Please try again';
        }

        this.modal.setStatus('error', message);
        this.showError(message);
        this.isSessionActive = false;
    }

    showError(message) {
        const toast = document.createElement('div');
        toast.className = 'ai-widget-toast error';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    exposePublicAPI() {
        window.AIWidget = {
            show: () => this.modal.show(),
            hide: () => this.modal.hide(),
            start: () => this.startSession(),
            stop: () => this.stopSession(),
            isActive: () => this.isSessionActive
        };
    }

    destroy() {
        this.floatingButton.destroy();
        if (this.modal) {
            this.modal.destroy();
        }
        if (this.isSessionActive) {
            this.stopSession();
        }
    }
}

// Auto-initialization
(function () {
    const scriptTag = document.currentScript;
    if (!scriptTag) {
        console.error('[AI Widget] Could not find script tag');
        return;
    }

    const publicKey = scriptTag.getAttribute('data-key');
    const apiUrl = scriptTag.getAttribute('data-api') || 'http://localhost:3000';
    const wssUrl = scriptTag.getAttribute('data-wss');

    if (!publicKey) {
        console.error('[AI Widget] Missing data-key attribute');
        return;
    }

    const initWidget = () => {
        const widget = new AIVoiceWidget(publicKey, apiUrl, wssUrl);
        widget.init();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }
})();
