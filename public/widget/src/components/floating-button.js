import { EventEmitter } from '../utils/events.js';

/**
 * Floating Button Component
 */
export class FloatingButton extends EventEmitter {
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
