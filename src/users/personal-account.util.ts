import { User } from './users.model';

const PERSONAL_ACCOUNT_MOD = 100_000_000;
const PERSONAL_ACCOUNT_PREFIX = 'AIPBX-';

/** Must match migrations/mysql|postgres/2026-05-21-personal-account-encoding.sql */
export const DEFAULT_PERSONAL_ACCOUNT_ENCODING: PersonalAccountEncoding = {
    k: 73856093,
    offset: 48291037,
};

export interface PersonalAccountEncoding {
    k: number;
    offset: number;
}

let loggedInvalidPersonalAccountEnv = false;

function isValidPersonalAccountEncoding(k: number, offset: number): boolean {
    return (
        Number.isFinite(k)
        && Number.isInteger(k)
        && k > 0
        && k % 2 !== 0
        && k % 5 !== 0
        && Number.isFinite(offset)
        && Number.isInteger(offset)
        && offset >= 0
    );
}

function warnInvalidPersonalAccountEnv(reason: string): void {
    if (loggedInvalidPersonalAccountEnv) {
        return;
    }
    loggedInvalidPersonalAccountEnv = true;
    console.warn(
        `[personal-account] Invalid PERSONAL_ACCOUNT_K / PERSONAL_ACCOUNT_OFFSET (${reason}); `
        + `using defaults K=${DEFAULT_PERSONAL_ACCOUNT_ENCODING.k}, `
        + `OFFSET=${DEFAULT_PERSONAL_ACCOUNT_ENCODING.offset}. `
        + 'Fix .env to match migration 2026-05-21-personal-account-encoding.sql.',
    );
}

/** Read K/offset from env. K must not be divisible by 2 or 5 (coprime to 10^8) to avoid serial collisions. */
export function readPersonalAccountEncoding(): PersonalAccountEncoding {
    const kRaw = process.env.PERSONAL_ACCOUNT_K;
    const offsetRaw = process.env.PERSONAL_ACCOUNT_OFFSET;

    const k = kRaw != null && kRaw !== ''
        ? parseInt(kRaw, 10)
        : DEFAULT_PERSONAL_ACCOUNT_ENCODING.k;
    const offset = offsetRaw != null && offsetRaw !== ''
        ? parseInt(offsetRaw, 10)
        : DEFAULT_PERSONAL_ACCOUNT_ENCODING.offset;

    if (!isValidPersonalAccountEncoding(k, offset)) {
        warnInvalidPersonalAccountEnv(
            `K=${String(kRaw ?? '(default)')}, OFFSET=${String(offsetRaw ?? '(default)')}`,
        );
        return { ...DEFAULT_PERSONAL_ACCOUNT_ENCODING };
    }

    return { k, offset };
}

/** 0 .. 99_999_999 — obfuscated tenant serial (not equal to ownerUserId). */
export function encodePersonalAccountSerial(
    ownerUserId: number,
    encoding: PersonalAccountEncoding = readPersonalAccountEncoding(),
): number {
    const id = Math.trunc(ownerUserId);
    if (!Number.isFinite(id) || id <= 0) {
        throw new Error('ownerUserId must be a positive integer');
    }
    const raw = id * encoding.k + encoding.offset;
    return ((raw % PERSONAL_ACCOUNT_MOD) + PERSONAL_ACCOUNT_MOD) % PERSONAL_ACCOUNT_MOD;
}

/** Stable billing id for bank payment purpose (ASCII, fits Russian bank fields). */
export function formatPersonalAccountNumber(ownerUserId: number): string {
    const serial = encodePersonalAccountSerial(ownerUserId);
    return `${PERSONAL_ACCOUNT_PREFIX}${String(serial).padStart(8, '0')}`;
}

export function buildInvoicePaymentPurpose(
    invoiceNumber: string,
    documentDateIso: string,
    personalAccountNumber: string,
): string {
    const dateRu = formatDateRuIso(documentDateIso);
    return `Оплата по счёту №${invoiceNumber} от ${dateRu}, л/с ${personalAccountNumber}`;
}

function formatDateRuIso(iso: string): string {
    const p = iso.trim().split('-');
    if (p.length === 3 && p[0].length === 4) {
        return `${p[2]}.${p[1]}.${p[0]}`;
    }
    return iso;
}

/**
 * Returns personal account for tenant owner; generates and persists if missing.
 * Sub-users always receive the owner's number (never a separate l/s).
 */
export async function ensureOwnerPersonalAccount(
    usersRepository: typeof User,
    userId: number,
): Promise<string | null> {
    try {
        const user = await usersRepository.findByPk(userId, {
            attributes: ['id', 'vpbx_user_id', 'personalAccountNumber'],
        });
        if (!user) {
            return formatPersonalAccountNumber(userId);
        }

        const ownerId = user.vpbx_user_id ?? user.id;
        let owner = user;
        if (user.vpbx_user_id) {
            owner = await usersRepository.findByPk(ownerId, {
                attributes: ['id', 'personalAccountNumber'],
            });
            if (!owner) {
                return formatPersonalAccountNumber(ownerId);
            }
        }

        if (owner.personalAccountNumber?.trim()) {
            return owner.personalAccountNumber.trim();
        }

        const generated = formatPersonalAccountNumber(ownerId);
        await owner.update({ personalAccountNumber: generated });
        return generated;
    } catch (e) {
        console.warn(`[personal-account] Failed to ensure l/s for user #${userId}`, e);
        return null;
    }
}
