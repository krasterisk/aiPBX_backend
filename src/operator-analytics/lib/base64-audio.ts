import { HttpException, HttpStatus } from '@nestjs/common';

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB

/** Extensions accepted for Base64 uploads (aligned with multipart MIME allowlist). */
export const ALLOWED_AUDIO_EXTENSIONS = new Set([
    'mp3', 'mpeg', 'wav', 'ogg', 'mp4', 'm4a', 'webm', 'flac',
]);

/** MIME types accepted from data-URI prefix (aligned with controller ALLOWED_MIMES). */
export const ALLOWED_AUDIO_MIMES = new Set([
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/flac',
]);

const DATA_URI_RE = /^data:([^;,]+)?(?:;[^,]*)*;base64,([\s\S]+)$/i;

export interface DecodedBase64Audio {
    buffer: Buffer;
    mime?: string;
}

/**
 * Decode raw Base64 or a data:audio/...;base64,... URI into a Buffer.
 * Throws HttpException 400 on empty/invalid input.
 */
export function decodeBase64Audio(input: string): DecodedBase64Audio {
    if (typeof input !== 'string' || !input.trim()) {
        throw new HttpException('file/data Base64 is required', HttpStatus.BAD_REQUEST);
    }

    const trimmed = input.trim();
    let mime: string | undefined;
    let b64 = trimmed;

    const match = DATA_URI_RE.exec(trimmed);
    if (match) {
        mime = match[1]?.toLowerCase();
        b64 = match[2];
        if (mime && !ALLOWED_AUDIO_MIMES.has(mime)) {
            throw new HttpException(
                `Unsupported audio MIME in data-URI: ${mime}`,
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    // Strip whitespace/newlines common in pasted Base64
    b64 = b64.replace(/\s+/g, '');
    if (!b64) {
        throw new HttpException('Base64 payload is empty', HttpStatus.BAD_REQUEST);
    }

    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length === 0) {
        throw new HttpException('Invalid Base64 audio payload', HttpStatus.BAD_REQUEST);
    }

    return { buffer, mime };
}

export function assertDecodedSize(buffer: Buffer, maxBytes: number = MAX_AUDIO_BYTES): void {
    if (buffer.length > maxBytes) {
        throw new HttpException(
            `File exceeds ${Math.floor(maxBytes / (1024 * 1024))} MB limit`,
            HttpStatus.PAYLOAD_TOO_LARGE,
        );
    }
}

export function assertAudioFilename(filename: string): void {
    if (typeof filename !== 'string' || !filename.trim()) {
        throw new HttpException('filename is required for Base64 audio', HttpStatus.BAD_REQUEST);
    }
    const name = filename.trim();
    const ext = name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_AUDIO_EXTENSIONS.has(ext) || name === ext) {
        throw new HttpException(
            `Unsupported audio filename/extension: ${name}`,
            HttpStatus.BAD_REQUEST,
        );
    }
}
