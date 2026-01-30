/**
 * Simple logger utility
 */
export class Logger {
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
