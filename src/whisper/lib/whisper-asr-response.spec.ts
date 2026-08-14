import {
    buildWhisperAsrUrl,
    parseWhisperAsrResponse,
    sanitizePythonJson,
} from './whisper-asr-response';

describe('whisper-asr-response', () => {
    describe('buildWhisperAsrUrl', () => {
        it('forces output=json and replaces an existing output=txt', () => {
            const url = buildWhisperAsrUrl('http://whisper:9000/asr?output=txt&task=transcribe', {
                language: 'ru',
            });
            const parsed = new URL(url);
            expect(parsed.searchParams.get('output')).toBe('json');
            expect(parsed.searchParams.getAll('output')).toEqual(['json']);
            expect(parsed.searchParams.get('task')).toBe('transcribe');
            expect(parsed.searchParams.get('language')).toBe('ru');
            expect(parsed.searchParams.get('vad_filter')).toBe('true');
        });

        it('skips language=auto', () => {
            const url = new URL(buildWhisperAsrUrl('http://whisper:9000/asr', { language: 'auto' }));
            expect(url.searchParams.get('language')).toBeNull();
        });
    });

    describe('parseWhisperAsrResponse', () => {
        it('parses whisper JSON with segments', () => {
            const parsed = parseWhisperAsrResponse(JSON.stringify({
                text: 'Hello there',
                language: 'en',
                segments: [
                    { start: 0.1, end: 1.2, text: ' Hello', avg_logprob: -0.2 },
                    { start: 1.3, end: 2.4, text: ' there' },
                ],
            }));
            expect(parsed.structured).toBe(true);
            expect(parsed.text).toBe('Hello there');
            expect(parsed.segments).toEqual([
                { start: 0.1, end: 1.2, text: 'Hello', avg_logprob: -0.2 },
                { start: 1.3, end: 2.4, text: 'there' },
            ]);
        });

        it('parses Python JSON with NaN / Infinity', () => {
            const raw = '{"text":"Hi","segments":[{"start":0,"end":1,"text":"Hi","avg_logprob":NaN,"no_speech_prob":-Infinity}]}';
            expect(() => JSON.parse(raw)).toThrow();
            const parsed = parseWhisperAsrResponse(raw);
            expect(parsed.structured).toBe(true);
            expect(parsed.segments[0].text).toBe('Hi');
            expect(parsed.segments[0].avg_logprob).toBeUndefined();
        });

        it('parses VTT cues', () => {
            const parsed = parseWhisperAsrResponse(
                'WEBVTT\n\n00:00.000 --> 00:01.500\nHello\n\n00:01.500 --> 00:03.000\nthere\n',
            );
            expect(parsed.structured).toBe(true);
            expect(parsed.segments.map(s => s.text)).toEqual(['Hello', 'there']);
            expect(parsed.segments[1].end).toBe(3);
        });

        it('leaves plain transcript unstructured', () => {
            const parsed = parseWhisperAsrResponse('Здравствуйте, чем могу помочь?');
            expect(parsed.structured).toBe(false);
            expect(parsed.segments).toEqual([]);
            expect(parsed.text).toContain('Здравствуйте');
        });
    });

    describe('sanitizePythonJson', () => {
        it('replaces non-JSON numeric tokens', () => {
            expect(sanitizePythonJson('{"a":NaN,"b":Infinity,"c":-Infinity}')).toBe(
                '{"a":null,"b":null,"c":null}',
            );
        });
    });
});
