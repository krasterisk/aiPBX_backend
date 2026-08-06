import type { DigestConfig } from '../interfaces/digest-config.interface';
import { getDigestTimezone, zonedParts } from './digest-window';

const MANUAL_COOLDOWN_MS = 5 * 60 * 1000;

/** Whether the hourly cron should send a digest for this config at `now`. */
export function isDigestDue(
    config: DigestConfig,
    now: Date = new Date(),
    timeZone: string = getDigestTimezone(),
): boolean {
    if (!config.enabled) return false;
    if (!config.emails.length && !config.telegramChatIds.length) return false;

    const z = zonedParts(now, timeZone);
    const sendHour = config.sendHour ?? 9;
    if (z.hour !== sendHour) return false;

    if (config.schedule === 'weekly') {
        const weeklyDay = config.weeklyDay ?? 1;
        if (z.isoWeekday !== weeklyDay) return false;
    } else if (config.schedule === 'monthly') {
        const monthlyDay = config.monthlyDay ?? 1;
        if (z.day !== monthlyDay) return false;
    }

    if (config.lastSentAt) {
        const last = zonedParts(new Date(config.lastSentAt), timeZone);
        if (last.year === z.year && last.month === z.month && last.day === z.day) {
            return false;
        }
    }

    return true;
}

export function canSendManualDigest(
    config: DigestConfig | null | undefined,
    now: Date = new Date(),
): { ok: true } | { ok: false; reason: string } {
    const emails = config?.emails ?? [];
    const chats = config?.telegramChatIds ?? [];
    if (!emails.length && !chats.length) {
        return { ok: false, reason: 'Add at least one email or Telegram chat id' };
    }
    if (config?.lastManualSentAt) {
        const elapsed = now.getTime() - new Date(config.lastManualSentAt).getTime();
        if (elapsed < MANUAL_COOLDOWN_MS) {
            const waitSec = Math.ceil((MANUAL_COOLDOWN_MS - elapsed) / 1000);
            return { ok: false, reason: `Please wait ${waitSec}s before sending again` };
        }
    }
    return { ok: true };
}

export { MANUAL_COOLDOWN_MS };
