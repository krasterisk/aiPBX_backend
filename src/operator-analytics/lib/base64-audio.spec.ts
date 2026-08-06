import { HttpStatus } from '@nestjs/common';
import {
    assertAudioFilename,
    assertDecodedSize,
    decodeBase64Audio,
    MAX_AUDIO_BYTES,
} from './base64-audio';

describe('base64-audio', () => {
    describe('decodeBase64Audio', () => {
        it('decodes raw Base64', () => {
            const raw = Buffer.from('hello-audio').toString('base64');
            const { buffer, mime } = decodeBase64Audio(raw);
            expect(buffer.toString()).toBe('hello-audio');
            expect(mime).toBeUndefined();
        });

        it('decodes data-URI and returns mime', () => {
            const raw = Buffer.from('wav-bytes').toString('base64');
            const { buffer, mime } = decodeBase64Audio(`data:audio/wav;base64,${raw}`);
            expect(buffer.toString()).toBe('wav-bytes');
            expect(mime).toBe('audio/wav');
        });

        it('rejects empty input', () => {
            try {
                decodeBase64Audio('   ');
                fail('expected throw');
            } catch (e: any) {
                expect(e.status).toBe(HttpStatus.BAD_REQUEST);
            }
        });

        it('rejects unsupported data-URI mime', () => {
            try {
                decodeBase64Audio('data:image/png;base64,aaaa');
                fail('expected throw');
            } catch (e: any) {
                expect(e.status).toBe(HttpStatus.BAD_REQUEST);
                expect(e.message).toMatch(/Unsupported audio MIME/);
            }
        });

        it('rejects payload that decodes to empty buffer', () => {
            try {
                decodeBase64Audio('!!!');
                fail('expected throw');
            } catch (e: any) {
                expect(e.status).toBe(HttpStatus.BAD_REQUEST);
            }
        });

        it('rejects truncated Base64 (length % 4 === 1)', () => {
            try {
                decodeBase64Audio('AAAAA'); // 5 chars
                fail('expected throw');
            } catch (e: any) {
                expect(e.status).toBe(HttpStatus.BAD_REQUEST);
                expect(e.message).toMatch(/truncated/i);
            }
        });
    });

    describe('assertDecodedSize', () => {
        it('allows buffers within limit', () => {
            expect(() => assertDecodedSize(Buffer.alloc(100))).not.toThrow();
        });

        it('rejects oversized buffers with 413', () => {
            try {
                assertDecodedSize(Buffer.alloc(MAX_AUDIO_BYTES + 1));
                fail('expected throw');
            } catch (e: any) {
                expect(e.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
            }
        });
    });

    describe('assertAudioFilename', () => {
        it('accepts known extensions', () => {
            expect(() => assertAudioFilename('call.mp3')).not.toThrow();
            expect(() => assertAudioFilename('a.WAV')).not.toThrow();
        });

        it('rejects missing filename', () => {
            try {
                assertAudioFilename('');
                fail('expected throw');
            } catch (e: any) {
                expect(e.status).toBe(HttpStatus.BAD_REQUEST);
            }
        });

        it('rejects unsupported extension', () => {
            try {
                assertAudioFilename('doc.pdf');
                fail('expected throw');
            } catch (e: any) {
                expect(e.status).toBe(HttpStatus.BAD_REQUEST);
                expect(e.message).toMatch(/Unsupported/);
            }
        });
    });
});
