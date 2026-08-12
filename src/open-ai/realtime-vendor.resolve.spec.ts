import {
    inferVendorFromModelName,
    isRealtimeVendor,
    resolveRealtimeRouting,
    RealtimeVendor,
} from './realtime-vendor.resolve';

describe('resolveRealtimeRouting', () => {
    it('uses catalog realtimeVendor over name prefix', () => {
        const resolved = resolveRealtimeRouting('gpt-looking-name', {
            name: 'gpt-looking-name',
            realtimeVendor: 'yandex',
            wireModelId: 'speech-realtime-deepseek-v4-flash/latest',
        });
        expect(resolved.vendor).toBe('yandex');
        expect(resolved.wireModelId).toBe('speech-realtime-deepseek-v4-flash/latest');
    });

    it('falls back to legacy yandex/qwen/openai prefixes when catalog vendor missing', () => {
        expect(resolveRealtimeRouting('yandex-speech', null).vendor).toBe('yandex');
        expect(resolveRealtimeRouting('qwen-omni', null).vendor).toBe('qwen');
        expect(resolveRealtimeRouting('gpt-realtime-mini', null).vendor).toBe('openai');
        expect(resolveRealtimeRouting('unknown-model', null).vendor).toBe('openai');
    });

    it('uses assistant model name as wireModelId when catalog wireModelId empty', () => {
        expect(resolveRealtimeRouting('yandex-foo', { name: 'yandex-foo', realtimeVendor: 'yandex' }))
            .toEqual({ vendor: 'yandex', wireModelId: 'yandex-foo' });
    });

    it('ignores invalid catalog vendor strings', () => {
        expect(resolveRealtimeRouting('yandex-x', { realtimeVendor: 'nope' }).vendor).toBe('yandex');
    });
});

describe('inferVendorFromModelName / isRealtimeVendor', () => {
    it('detects prefixes case-insensitively', () => {
        expect(inferVendorFromModelName('Yandex-X')).toBe('yandex');
        expect(inferVendorFromModelName('Qwen-X')).toBe('qwen');
    });

    it('validates vendor enum', () => {
        expect(isRealtimeVendor('openai')).toBe(true);
        expect(isRealtimeVendor('yandex')).toBe(true);
        expect(isRealtimeVendor('qwen')).toBe(true);
        expect(isRealtimeVendor('ollama')).toBe(false);
        expect(isRealtimeVendor(null)).toBe(false);
    });

    it('exports RealtimeVendor union via assignment', () => {
        const v: RealtimeVendor = 'openai';
        expect(v).toBe('openai');
    });
});
