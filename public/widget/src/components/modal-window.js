import { EventEmitter } from '../utils/events.js';
import { AudioVisualizer } from './audio-visualizer.js';

/**
 * Modal Window Component
 */
export class ModalWindow extends EventEmitter {
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
