import { User } from './users.model';

/** Stable billing id for bank payment purpose (ASCII, fits Russian bank fields). */
export function formatPersonalAccountNumber(ownerUserId: number): string {
    return `AIPBX-${String(ownerUserId).padStart(8, '0')}`;
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
 */
export async function ensureOwnerPersonalAccount(
    usersRepository: typeof User,
    userId: number,
): Promise<string> {
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
}
