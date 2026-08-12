export type RealtimeVendor = 'openai' | 'yandex' | 'qwen';

export interface RealtimeModelCatalogFields {
    name?: string | null;
    realtimeVendor?: string | null;
    wireModelId?: string | null;
}

export interface ResolvedRealtimeRouting {
    vendor: RealtimeVendor;
    /** Value passed as `?model=` on the realtime WebSocket URL */
    wireModelId: string;
}

const VENDORS: RealtimeVendor[] = ['openai', 'yandex', 'qwen'];

export function isRealtimeVendor(value: unknown): value is RealtimeVendor {
    return typeof value === 'string' && (VENDORS as string[]).includes(value);
}

/**
 * Infer vendor from legacy model-name prefixes (gpt* / yandex* / qwen*).
 * Models that do not match a known prefix default to openai.
 */
export function inferVendorFromModelName(modelName?: string | null): RealtimeVendor {
    const name = (modelName || '').toLowerCase();
    if (name.startsWith('yandex')) return 'yandex';
    if (name.startsWith('qwen')) return 'qwen';
    return 'openai';
}

/**
 * Resolve realtime vendor + wire model id.
 * Priority: catalog.realtimeVendor → legacy name prefix → openai.
 * wireModelId: catalog.wireModelId → assistant/catalog name → env fallback applied later per vendor.
 */
export function resolveRealtimeRouting(
    assistantModel: string | null | undefined,
    catalog?: RealtimeModelCatalogFields | null,
): ResolvedRealtimeRouting {
    const modelName = (assistantModel || catalog?.name || '').trim() || 'gpt-realtime-mini';

    let vendor: RealtimeVendor;
    if (isRealtimeVendor(catalog?.realtimeVendor)) {
        vendor = catalog.realtimeVendor;
    } else {
        vendor = inferVendorFromModelName(modelName);
    }

    const wireFromCatalog = catalog?.wireModelId?.trim();
    const wireModelId = wireFromCatalog || modelName;

    return { vendor, wireModelId };
}
