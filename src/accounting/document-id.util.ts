const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Sequelize / DB drivers may expose UUID as string, Buffer, or nested object.
 * Never use String(raw) alone — plain objects become "[object Object]".
 */
export function extractOrganizationDocumentId(raw: unknown): string {
    if (raw == null) return '';
    if (typeof raw === 'string') {
        const t = raw.trim();
        return t;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return String(Math.trunc(raw));
    }
    if (typeof raw === 'bigint') {
        return raw.toString();
    }
    if (Buffer.isBuffer(raw)) {
        const utf = raw.toString('utf8').trim();
        if (UUID_RE.test(utf)) return utf;
        if (raw.length === 16) {
            const hex = raw.toString('hex');
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }
        return raw.toString('hex');
    }
    if (typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (o.type === 'Buffer' && Array.isArray(o.data)) {
            return extractOrganizationDocumentId(Buffer.from(o.data as number[]));
        }
        if (o.dataValues != null && typeof o.dataValues === 'object') {
            return extractOrganizationDocumentId((o.dataValues as Record<string, unknown>).id);
        }
        if ('id' in o && o.id !== raw) {
            return extractOrganizationDocumentId(o.id);
        }
        try {
            const flat = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
            for (const v of Object.values(flat)) {
                if (typeof v === 'string' && UUID_RE.test(v)) return v;
            }
        } catch {
            /* noop */
        }
    }
    return '';
}
