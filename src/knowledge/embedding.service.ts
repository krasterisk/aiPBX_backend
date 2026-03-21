import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Embedding Service — generates vector embeddings via Ollama.
 *
 * Uses nomic-embed-text:v2-moe (Mixture of Experts, 768 dim, 100+ languages).
 * API: POST http://ollama:11434/api/embed
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
    private readonly logger = new Logger(EmbeddingService.name);
    private readonly ollamaUrl: string;
    private readonly model: string;
    private available = false;

    constructor() {
        this.ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
        this.model = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
    }

    async onModuleInit() {
        try {
            const res = await fetch(`${this.ollamaUrl}/api/tags`);
            if (res.ok) {
                const data = await res.json();
                const models = data.models?.map((m: any) => m.name) || [];
                const hasModel = models.some((n: string) => n.includes('nomic-embed'));
                this.available = true;
                this.logger.log(`Ollama connected. Embedding model available: ${hasModel}. Models: ${models.join(', ')}`);
            }
        } catch (err) {
            this.logger.warn(`Ollama not reachable at ${this.ollamaUrl}: ${err.message}. Embedding service disabled.`);
        }
    }

    /**
     * Generate embedding vector for a single text.
     * Returns float array of 768 dimensions.
     */
    async embed(text: string): Promise<number[]> {
        if (!this.available) {
            throw new Error('Embedding service is not available (Ollama not connected)');
        }

        const res = await fetch(`${this.ollamaUrl}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                input: text,
            }),
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Embedding API error (${res.status}): ${error}`);
        }

        const data = await res.json();

        // Ollama returns { embeddings: [[...]] } for single input
        if (data.embeddings?.[0]) {
            return data.embeddings[0];
        }

        throw new Error('Unexpected embedding response format');
    }

    /**
     * Generate embeddings for multiple texts in batch.
     * More efficient than calling embed() individually.
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (!this.available) {
            throw new Error('Embedding service is not available');
        }

        if (texts.length === 0) return [];

        // Ollama supports array input
        const res = await fetch(`${this.ollamaUrl}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                input: texts,
            }),
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Embedding batch API error (${res.status}): ${error}`);
        }

        const data = await res.json();

        if (data.embeddings?.length === texts.length) {
            return data.embeddings;
        }

        throw new Error(`Expected ${texts.length} embeddings, got ${data.embeddings?.length || 0}`);
    }

    /**
     * Get embedding vector dimension (768 for nomic-embed-text v2).
     */
    getDimension(): number {
        return 768;
    }

    isAvailable(): boolean {
        return this.available;
    }
}
