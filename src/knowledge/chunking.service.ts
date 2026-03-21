import { Injectable, Logger } from '@nestjs/common';

/**
 * Chunking Service — splits text into overlapping chunks for embedding.
 *
 * Strategy: paragraph → sentence → character (cascade).
 * Target: ~500 tokens (~2000 characters) per chunk with 200-char overlap.
 */
@Injectable()
export class ChunkingService {
    private readonly logger = new Logger(ChunkingService.name);
    private readonly maxChunkSize = 2000;    // ~500 tokens
    private readonly overlapSize = 200;      // overlap between chunks

    /**
     * Split text into chunks suitable for embedding.
     * Returns array of { content, metadata } objects.
     */
    chunkText(text: string, metadata?: Record<string, any>): { content: string; metadata: Record<string, any> }[] {
        if (!text || text.trim().length === 0) return [];

        // Normalize whitespace
        const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

        // Split by paragraphs first
        const paragraphs = normalized.split(/\n\n+/);
        const chunks: { content: string; metadata: Record<string, any> }[] = [];
        let currentChunk = '';
        let chunkIndex = 0;

        for (const paragraph of paragraphs) {
            const trimmed = paragraph.trim();
            if (!trimmed) continue;

            // If adding this paragraph exceeds max size, flush
            if (currentChunk.length > 0 && (currentChunk.length + trimmed.length + 2) > this.maxChunkSize) {
                chunks.push({
                    content: currentChunk.trim(),
                    metadata: { ...metadata, chunkIndex: chunkIndex++, position: chunks.length },
                });

                // Start with overlap from previous chunk
                const overlapText = currentChunk.slice(-this.overlapSize);
                currentChunk = overlapText + '\n\n' + trimmed;
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
            }

            // If single paragraph exceeds max, split by sentences
            if (currentChunk.length > this.maxChunkSize) {
                const subChunks = this.splitLongText(currentChunk, metadata, chunkIndex);
                for (const sc of subChunks) {
                    chunks.push(sc);
                    chunkIndex++;
                }
                currentChunk = '';
            }
        }

        // Flush remaining
        if (currentChunk.trim().length > 0) {
            chunks.push({
                content: currentChunk.trim(),
                metadata: { ...metadata, chunkIndex: chunkIndex++, position: chunks.length },
            });
        }

        this.logger.debug(`Chunked text into ${chunks.length} chunks (avg ${Math.round(normalized.length / Math.max(chunks.length, 1))} chars/chunk)`);
        return chunks;
    }

    /**
     * Split a long text by sentences when paragraph splitting isn't enough.
     */
    private splitLongText(
        text: string,
        metadata: Record<string, any>,
        startIndex: number,
    ): { content: string; metadata: Record<string, any> }[] {
        const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
        const chunks: { content: string; metadata: Record<string, any> }[] = [];
        let current = '';
        let idx = startIndex;

        for (const sentence of sentences) {
            if (current.length + sentence.length > this.maxChunkSize && current.length > 0) {
                chunks.push({
                    content: current.trim(),
                    metadata: { ...metadata, chunkIndex: idx++, position: chunks.length },
                });
                const overlap = current.slice(-this.overlapSize);
                current = overlap + sentence;
            } else {
                current += sentence;
            }
        }

        if (current.trim().length > 0) {
            chunks.push({
                content: current.trim(),
                metadata: { ...metadata, chunkIndex: idx, position: chunks.length },
            });
        }

        return chunks;
    }
}
