import { normalizeAuthEmail } from './email.util';

describe('normalizeAuthEmail', () => {
    it('trims and lowercases email', () => {
        expect(normalizeAuthEmail('  User@Example.COM  ')).toBe('user@example.com');
    });

    it('returns empty string for nullish input', () => {
        expect(normalizeAuthEmail(null)).toBe('');
        expect(normalizeAuthEmail(undefined)).toBe('');
    });
});
