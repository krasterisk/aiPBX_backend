import { computeAudioSha256 } from './audio-hash';

describe('audio-hash', () => {
    it('computes deterministic SHA-256 hex', () => {
        const buf = Buffer.from('test-audio');
        expect(computeAudioSha256(buf)).toMatch(/^[a-f0-9]{64}$/);
        expect(computeAudioSha256(buf)).toBe(computeAudioSha256(buf));
    });

    it('differs for different buffers', () => {
        expect(computeAudioSha256(Buffer.from('a'))).not.toBe(computeAudioSha256(Buffer.from('b')));
    });
});
