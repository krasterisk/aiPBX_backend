import { Logger } from './utils/logger.js';

/**
 * API Client for widget backend communication
 */
export class ApiClient {
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
