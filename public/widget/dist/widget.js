(function () {
  'use strict';

  function styleInject(css, ref) {
    if ( ref === void 0 ) ref = {};
    var insertAt = ref.insertAt;

    if (typeof document === 'undefined') { return; }

    var head = document.head || document.getElementsByTagName('head')[0];
    var style = document.createElement('style');
    style.type = 'text/css';

    if (insertAt === 'top') {
      if (head.firstChild) {
        head.insertBefore(style, head.firstChild);
      } else {
        head.appendChild(style);
      }
    } else {
      head.appendChild(style);
    }

    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }
  }

  var css_248z = "/* AI Voice Widget Styles */\r\n\r\n/* Floating Button */\r\n.ai-widget-btn {\r\n    position: fixed;\r\n    bottom: 20px;\r\n    right: 20px;\r\n    width: 60px;\r\n    height: 60px;\r\n    border-radius: 50%;\r\n    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\r\n    border: none;\r\n    cursor: pointer;\r\n    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);\r\n    z-index: 9999;\r\n    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    outline: none;\r\n}\r\n\r\n.ai-widget-btn:hover {\r\n    transform: scale(1.1) translateY(-2px);\r\n    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);\r\n}\r\n\r\n.ai-widget-btn:active {\r\n    transform: scale(1.05);\r\n}\r\n\r\n/* Modal Window */\r\n.ai-widget-modal {\r\n    position: fixed;\r\n    bottom: 90px;\r\n    right: 20px;\r\n    width: 350px;\r\n    max-height: 500px;\r\n    background: white;\r\n    border-radius: 16px;\r\n    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);\r\n    z-index: 9998;\r\n    display: flex;\r\n    flex-direction: column;\r\n    opacity: 0;\r\n    transform: translateY(20px);\r\n    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\r\n    pointer-events: none;\r\n    overflow: hidden;\r\n}\r\n\r\n.ai-widget-modal.visible {\r\n    opacity: 1;\r\n    transform: translateY(0);\r\n    pointer-events: all;\r\n}\r\n\r\n/* Modal Header */\r\n.modal-header {\r\n    padding: 16px 20px;\r\n    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\r\n    color: white;\r\n    display: flex;\r\n    justify-content: space-between;\r\n    align-items: center;\r\n}\r\n\r\n.modal-header h3 {\r\n    margin: 0;\r\n    font-size: 16px;\r\n    font-weight: 600;\r\n    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\r\n}\r\n\r\n.close-btn {\r\n    background: none;\r\n    border: none;\r\n    color: white;\r\n    font-size: 28px;\r\n    line-height: 1;\r\n    cursor: pointer;\r\n    padding: 0;\r\n    width: 30px;\r\n    height: 30px;\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    border-radius: 4px;\r\n    transition: background 0.2s;\r\n}\r\n\r\n.close-btn:hover {\r\n    background: rgba(255, 255, 255, 0.2);\r\n}\r\n\r\n/* Modal Body */\r\n.modal-body {\r\n    flex: 1;\r\n    padding: 24px 20px;\r\n    display: flex;\r\n    flex-direction: column;\r\n    align-items: center;\r\n    gap: 16px;\r\n    min-height: 250px;\r\n}\r\n\r\n#ai-widget-visualizer {\r\n    width: 100%;\r\n    height: 150px;\r\n    background: linear-gradient(135deg, #f5f7fa 0%, #e3e8ee 100%);\r\n    border-radius: 12px;\r\n}\r\n\r\n.status {\r\n    text-align: center;\r\n    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\r\n}\r\n\r\n.status-icon {\r\n    font-size: 32px;\r\n    display: block;\r\n    margin-bottom: 8px;\r\n}\r\n\r\n.status-text {\r\n    margin: 0;\r\n    font-size: 14px;\r\n    color: #4a5568;\r\n    font-weight: 500;\r\n}\r\n\r\n/* Modal Footer */\r\n.modal-footer {\r\n    padding: 16px 20px;\r\n    display: flex;\r\n    gap: 12px;\r\n    justify-content: center;\r\n    border-top: 1px solid #e2e8f0;\r\n}\r\n\r\n.btn {\r\n    padding: 12px 24px;\r\n    border: none;\r\n    border-radius: 8px;\r\n    cursor: pointer;\r\n    font-weight: 600;\r\n    font-size: 14px;\r\n    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\r\n    transition: all 0.2s;\r\n    outline: none;\r\n    flex: 1;\r\n}\r\n\r\n.btn-primary {\r\n    background: #667eea;\r\n    color: white;\r\n}\r\n\r\n.btn-primary:hover:not(:disabled) {\r\n    background: #5568d3;\r\n    transform: translateY(-1px);\r\n    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);\r\n}\r\n\r\n.btn-danger {\r\n    background: #ef4444;\r\n    color: white;\r\n}\r\n\r\n.btn-danger:hover:not(:disabled) {\r\n    background: #dc2626;\r\n    transform: translateY(-1px);\r\n    box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);\r\n}\r\n\r\n.btn:disabled {\r\n    background: #cbd5e0;\r\n    cursor: not-allowed;\r\n    transform: none;\r\n    box-shadow: none;\r\n}\r\n\r\n.btn:active:not(:disabled) {\r\n    transform: translateY(0);\r\n}\r\n\r\n/* Toast Notifications */\r\n.ai-widget-toast {\r\n    position: fixed;\r\n    top: 20px;\r\n    right: 20px;\r\n    max-width: 350px;\r\n    padding: 16px 20px;\r\n    background: white;\r\n    border-radius: 8px;\r\n    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);\r\n    z-index: 10000;\r\n    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\r\n    font-size: 14px;\r\n    opacity: 0;\r\n    transform: translateY(-10px);\r\n    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\r\n    pointer-events: none;\r\n}\r\n\r\n.ai-widget-toast.visible {\r\n    opacity: 1;\r\n    transform: translateY(0);\r\n}\r\n\r\n.ai-widget-toast.error {\r\n    background: #fee2e2;\r\n    color: #991b1b;\r\n    border-left: 4px solid #ef4444;\r\n}\r\n\r\n/* Mobile Responsive */\r\n@media (max-width: 768px) {\r\n    .ai-widget-modal {\r\n        bottom: 0;\r\n        right: 0;\r\n        left: 0;\r\n        width: 100%;\r\n        max-width: 100%;\r\n        height: 100vh;\r\n        max-height: 100vh;\r\n        border-radius: 0;\r\n    }\r\n\r\n    .ai-widget-btn {\r\n        bottom: 16px;\r\n        right: 16px;\r\n    }\r\n\r\n    .ai-widget-toast {\r\n        top: 16px;\r\n        right: 16px;\r\n        left: 16px;\r\n        max-width: none;\r\n    }\r\n}";
  styleInject(css_248z);

  /**
   * Simple logger utility
   */
  class Logger {
      constructor(namespace, enabled = true) {
          this.namespace = namespace;
          this.enabled = enabled;
      }

      log(...args) {
          if (this.enabled) {
              console.log(`[${this.namespace}]`, ...args);
          }
      }

      error(...args) {
          if (this.enabled) {
              console.error(`[${this.namespace}]`, ...args);
          }
      }

      warn(...args) {
          if (this.enabled) {
              console.warn(`[${this.namespace}]`, ...args);
          }
      }

      debug(...args) {
          if (this.enabled) {
              console.debug(`[${this.namespace}]`, ...args);
          }
      }
  }

  /**
   * API Client for widget backend communication
   */
  class ApiClient {
      constructor(baseUrl) {
          this.baseUrl = baseUrl;
          this.logger = new Logger('ApiClient');
      }

      async fetchConfig(publicKey) {
          try {
              const response = await fetch(`${this.baseUrl}/widget/config/${publicKey}`);

              if (!response.ok) {
                  if (response.status === 404) {
                      throw new Error('INVALID_KEY');
                  }
                  if (response.status === 403) {
                      throw new Error('KEY_INACTIVE');
                  }
                  throw new Error('NETWORK_ERROR');
              }

              const config = await response.json();
              this.logger.log('Fetched config:', config);
              return config;
          } catch (error) {
              this.logger.error('Failed to fetch config:', error);
              throw error;
          }
      }

      async sendOffer(publicKey, domain, sdpOffer) {
          try {
              const response = await fetch(`${this.baseUrl}/widget/offer`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                      publicKey,
                      domain,
                      sdpOffer
                  })
              });

              if (!response.ok) {
                  if (response.status === 403) {
                      throw new Error('DOMAIN_NOT_ALLOWED');
                  }
                  if (response.status === 400) {
                      const data = await response.json();
                      if (data.message?.includes('concurrent')) {
                          throw new Error('MAX_SESSIONS_REACHED');
                      }
                  }
                  throw new Error('NETWORK_ERROR');
              }

              const data = await response.json();
              this.logger.log('Session created:', data.sessionId);
              return data;
          } catch (error) {
              this.logger.error('Failed to send offer:', error);
              throw error;
          }
      }

      async sendIceCandidate(sessionId, candidate) {
          try {
              await fetch(`${this.baseUrl}/widget/ice-candidate`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                      sessionId,
                      candidate
                  })
              });

              this.logger.debug('ICE candidate sent');
          } catch (error) {
              this.logger.error('Failed to send ICE candidate:', error);
          }
      }

      async hangup(sessionId) {
          try {
              await fetch(`${this.baseUrl}/widget/hangup`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ sessionId })
              });

              this.logger.log('Session ended:', sessionId);
          } catch (error) {
              this.logger.error('Failed to send hangup:', error);
          }
      }
  }

  /**
   * Event Emitter utility for pub/sub pattern
   */
  class EventEmitter {
      constructor() {
          this.events = {};
      }

      on(event, listener) {
          if (!this.events[event]) {
              this.events[event] = [];
          }
          this.events[event].push(listener);
          return () => this.off(event, listener);
      }

      off(event, listenerToRemove) {
          if (!this.events[event]) return;
          this.events[event] = this.events[event].filter(listener => listener !== listenerToRemove);
      }

      emit(event, ...args) {
          if (!this.events[event]) return;
          this.events[event].forEach(listener => listener(...args));
      }

      once(event, listener) {
          const onceWrapper = (...args) => {
              listener(...args);
              this.off(event, onceWrapper);
          };
          this.on(event, onceWrapper);
      }
  }

  /**
   * WebRTC Connection Manager
   */
  class WebRTCManager extends EventEmitter {
      constructor(apiClient) {
          super();
          this.api = apiClient;
          this.pc = null;
          this.sessionId = null;
          this.localStream = null;
          this.logger = new Logger('WebRTC');
      }

      async startSession(publicKey, domain) {
          try {
              // 1. Request microphone access
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

              // 2. Create RTCPeerConnection
              this.pc = new RTCPeerConnection({
                  iceServers: [
                      { urls: 'stun:stun.l.google.com:19302' },
                      { urls: 'stun:stun1.l.google.com:19302' }
                  ]
              });

              // 3. Add local audio tracks
              this.localStream.getTracks().forEach(track => {
                  this.pc.addTrack(track, this.localStream);
                  this.logger.debug('Added audio track:', track.label);
              });

              // 4. Handle incoming audio tracks
              this.pc.ontrack = (event) => {
                  this.logger.log('Received remote audio track');
                  const audioElement = new Audio();
                  audioElement.srcObject = event.streams[0];
                  audioElement.autoplay = true;

                  this.emit('audioReceived', event.streams[0]);
              };

              // 5. Handle ICE candidates
              this.pc.onicecandidate = async (event) => {
                  if (event.candidate) {
                      this.logger.debug('New ICE candidate');
                      await this.api.sendIceCandidate(this.sessionId, event.candidate);
                  }
              };

              // 6. Handle connection state changes
              this.pc.onconnectionstatechange = () => {
                  this.logger.log('Connection state:', this.pc.connectionState);

                  if (this.pc.connectionState === 'connected') {
                      this.emit('connected');
                  } else if (this.pc.connectionState === 'disconnected' ||
                      this.pc.connectionState === 'failed') {
                      this.emit('disconnected');
                  }
              };

              // 7. Create SDP offer
              this.logger.log('Creating SDP offer...');
              const offer = await this.pc.createOffer();
              await this.pc.setLocalDescription(offer);

              // 8. Send offer to backend
              this.emit('connecting');
              const response = await this.api.sendOffer(publicKey, domain, offer.sdp);
              this.sessionId = response.sessionId;

              // 9. Set remote description (answer from backend)
              await this.pc.setRemoteDescription({
                  type: 'answer',
                  sdp: response.sdpAnswer
              });

              this.logger.log('Session established:', this.sessionId);

          } catch (error) {
              this.logger.error('Failed to start session:', error);

              if (error.name === 'NotAllowedError') {
                  this.emit('error', 'MICROPHONE_PERMISSION_DENIED');
              } else if (error.message === 'DOMAIN_NOT_ALLOWED') {
                  this.emit('error', 'DOMAIN_NOT_ALLOWED');
              } else if (error.message === 'MAX_SESSIONS_REACHED') {
                  this.emit('error', 'MAX_SESSIONS_REACHED');
              } else {
                  this.emit('error', 'NETWORK_ERROR');
              }

              this.cleanup();
              throw error;
          }
      }

      async stopSession() {
          this.logger.log('Stopping session...');

          // Send hangup to backend
          if (this.sessionId) {
              await this.api.hangup(this.sessionId);
          }

          this.cleanup();
          this.emit('stopped');
      }

      cleanup() {
          // Close peer connection
          if (this.pc) {
              this.pc.close();
              this.pc = null;
          }

          // Stop local stream
          if (this.localStream) {
              this.localStream.getTracks().forEach(track => track.stop());
              this.localStream = null;
          }

          this.sessionId = null;
      }
  }

  /**
   * Floating Button Component
   */
  class FloatingButton extends EventEmitter {
      constructor() {
          super();
          this.button = this.create();
      }

      create() {
          const btn = document.createElement('button');
          btn.className = 'ai-widget-btn';
          btn.setAttribute('aria-label', 'Open AI Assistant');
          btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
      </svg>
    `;

          btn.addEventListener('click', () => this.emit('click'));

          return btn;
      }

      show() {
          if (!document.body.contains(this.button)) {
              document.body.appendChild(this.button);
          }
      }

      hide() {
          if (document.body.contains(this.button)) {
              this.button.remove();
          }
      }

      destroy() {
          this.hide();
      }
  }

  /**
   * Audio Visualizer Component
   */
  class AudioVisualizer {
      constructor(canvasElement) {
          this.canvas = canvasElement;
          this.ctx = this.canvas.getContext('2d');
          this.analyser = null;
          this.animationId = null;
          this.audioContext = null;
      }

      connect(audioStream) {
          try {
              this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
              const source = this.audioContext.createMediaStreamSource(audioStream);

              this.analyser = this.audioContext.createAnalyser();
              this.analyser.fftSize = 128;
              this.analyser.smoothingTimeConstant = 0.8;

              source.connect(this.analyser);

              this.draw();
          } catch (error) {
              console.error('Failed to create audio visualizer:', error);
          }
      }

      draw() {
          this.animationId = requestAnimationFrame(() => this.draw());

          if (!this.analyser) return;

          const bufferLength = this.analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          this.analyser.getByteFrequencyData(dataArray);

          // Clear canvas
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

          // Draw bars
          const barWidth = (this.canvas.width / bufferLength) * 2.5;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
              const barHeight = (dataArray[i] / 255) * this.canvas.height * 0.8;

              // Gradient color
              const hue = (i / bufferLength) * 280 + 240; // Purple to blue
              this.ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;

              // Draw rounded bar
              this.ctx.beginPath();
              this.ctx.roundRect(
                  x,
                  this.canvas.height - barHeight,
                  barWidth - 2,
                  barHeight,
                  2
              );
              this.ctx.fill();

              x += barWidth;
          }
      }

      disconnect() {
          if (this.animationId) {
              cancelAnimationFrame(this.animationId);
              this.animationId = null;
          }

          if (this.audioContext) {
              this.audioContext.close();
              this.audioContext = null;
          }

          this.analyser = null;
      }
  }

  /**
   * Modal Window Component
   */
  class ModalWindow extends EventEmitter {
      constructor(config) {
          super();
          this.config = config;
          this.modal = this.create();
          this.visualizer = null;
      }

      create() {
          const modal = document.createElement('div');
          modal.className = 'ai-widget-modal';
          modal.innerHTML = `
      <div class="modal-header">
        <h3>${this.config.assistantName || 'AI Assistant'}</h3>
        <button class="close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <canvas id="ai-widget-visualizer" width="300" height="150"></canvas>
        <div class="status">
          <span class="status-icon">🎤</span>
          <p class="status-text">Ready to talk...</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary btn-start">Start</button>
        <button class="btn btn-danger btn-stop" disabled>Stop</button>
      </div>
    `;

          // Event listeners
          modal.querySelector('.close-btn').addEventListener('click', () => {
              this.hide();
              this.emit('close');
          });

          modal.querySelector('.btn-start').addEventListener('click', () => {
              this.emit('start');
          });

          modal.querySelector('.btn-stop').addEventListener('click', () => {
              this.emit('stop');
          });

          return modal;
      }

      show() {
          if (!document.body.contains(this.modal)) {
              document.body.appendChild(this.modal);
          }
          setTimeout(() => this.modal.classList.add('visible'), 10);
      }

      hide() {
          this.modal.classList.remove('visible');
          setTimeout(() => {
              if (document.body.contains(this.modal)) {
                  this.modal.remove();
              }
          }, 300);
      }

      setStatus(state, message) {
          const statusText = this.modal.querySelector('.status-text');
          const statusIcon = this.modal.querySelector('.status-icon');
          const startBtn = this.modal.querySelector('.btn-start');
          const stopBtn = this.modal.querySelector('.btn-stop');

          statusText.textContent = message;

          switch (state) {
              case 'connecting':
                  statusIcon.textContent = '⏳';
                  startBtn.disabled = true;
                  stopBtn.disabled = true;
                  break;

              case 'connected':
                  statusIcon.textContent = '✅';
                  startBtn.disabled = true;
                  stopBtn.disabled = false;
                  break;

              case 'error':
                  statusIcon.textContent = '❌';
                  startBtn.disabled = false;
                  stopBtn.disabled = true;
                  break;

              case 'ready':
              default:
                  statusIcon.textContent = '🎤';
                  startBtn.disabled = false;
                  stopBtn.disabled = true;
          }
      }

      attachVisualizer(audioStream) {
          const canvas = this.modal.querySelector('#ai-widget-visualizer');
          if (!canvas) return;

          if (this.visualizer) {
              this.visualizer.disconnect();
          }

          this.visualizer = new AudioVisualizer(canvas);
          this.visualizer.connect(audioStream);
      }

      destroyVisualizer() {
          if (this.visualizer) {
              this.visualizer.disconnect();
              this.visualizer = null;
          }
      }

      destroy() {
          this.destroyVisualizer();
          this.hide();
      }
  }

  /**
   * Main AI Voice Widget Class
   */
  class AIVoiceWidget {
      constructor(publicKey, apiUrl) {
          this.publicKey = publicKey;
          this.apiUrl = apiUrl;
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
              await this.webrtc.startSession(this.publicKey, domain);
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

      if (!publicKey) {
          console.error('[AI Widget] Missing data-key attribute');
          return;
      }

      const initWidget = () => {
          const widget = new AIVoiceWidget(publicKey, apiUrl);
          widget.init();
      };

      if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initWidget);
      } else {
          initWidget();
      }
  })();

})();
//# sourceMappingURL=widget.js.map
