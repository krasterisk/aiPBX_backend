import { col, fn, where } from 'sequelize';

export function normalizeAuthEmail(email: string | null | undefined): string {
    if (email == null) {
        return '';
    }
    return String(email).trim().toLowerCase();
}

/** Case-insensitive match for stored emails (legacy rows may differ in casing). */
export function emailWhereClause(email: string) {
    const normalized = normalizeAuthEmail(email);
    return where(fn('LOWER', col('email')), normalized);
}
