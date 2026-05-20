import { isBalanceDepleted } from './balance-notification.util';

describe('isBalanceDepleted', () => {
    it('returns true for zero and negative balances', () => {
        expect(isBalanceDepleted(0)).toBe(true);
        expect(isBalanceDepleted(-0.01)).toBe(true);
    });

    it('returns false for positive balance', () => {
        expect(isBalanceDepleted(0.01)).toBe(false);
        expect(isBalanceDepleted(100)).toBe(false);
    });
});
