import {
    encodePersonalAccountSerial,
    formatPersonalAccountNumber,
    readPersonalAccountEncoding,
} from './personal-account.util';

describe('personal-account.util', () => {
    const envBackup = { ...process.env };

    afterEach(() => {
        process.env = envBackup;
    });

    it('encodePersonalAccountSerial uses K and offset from env', () => {
        process.env.PERSONAL_ACCOUNT_K = '73856093';
        process.env.PERSONAL_ACCOUNT_OFFSET = '48291037';
        expect(encodePersonalAccountSerial(1)).toBe(22147130);
        expect(encodePersonalAccountSerial(42)).toBe(50246943);
    });

    it('formatPersonalAccountNumber prefixes AIPBX- and pads to 8 digits', () => {
        process.env.PERSONAL_ACCOUNT_K = '73856093';
        process.env.PERSONAL_ACCOUNT_OFFSET = '48291037';
        expect(formatPersonalAccountNumber(1)).toBe('AIPBX-22147130');
        expect(formatPersonalAccountNumber(42)).toBe('AIPBX-50246943');
    });

    it('falls back to defaults when K is divisible by 2 or 5', () => {
        process.env.PERSONAL_ACCOUNT_K = '10';
        process.env.PERSONAL_ACCOUNT_OFFSET = '48291037';
        expect(readPersonalAccountEncoding()).toEqual({
            k: 73856093,
            offset: 48291037,
        });
        expect(formatPersonalAccountNumber(1)).toBe('AIPBX-22147130');
    });

    it('different owner ids produce different serials for small ids', () => {
        process.env.PERSONAL_ACCOUNT_K = '73856093';
        process.env.PERSONAL_ACCOUNT_OFFSET = '48291037';
        const a = encodePersonalAccountSerial(1);
        const b = encodePersonalAccountSerial(2);
        const c = encodePersonalAccountSerial(3);
        expect(new Set([a, b, c]).size).toBe(3);
    });
});
