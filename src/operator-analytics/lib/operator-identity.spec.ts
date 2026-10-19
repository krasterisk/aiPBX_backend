import { operatorGroupIdentity, operatorIdentityFields, operatorIdentityKey } from './operator-identity';

describe('external operator identity', () => {
    it('groups one employee at different workplaces and after a name change', () => {
        expect(operatorIdentityKey({ userId: '99', operatorId: 'pbx:a:12', assistantName: 'Anna' }))
            .toBe(operatorIdentityKey({ userId: '99', operatorId: 'pbx:a:12', assistantName: 'Anna Smith' }));
    });
    it('keeps same-name employees, different source IDs and tenants separate', () => {
        const key = operatorIdentityKey({ userId: '99', operatorId: 'pbx:a:12', assistantName: 'Anna' });
        expect(key).not.toBe(operatorIdentityKey({ userId: '99', operatorId: 'pbx:a:13', assistantName: 'Anna' }));
        expect(key).not.toBe(operatorIdentityKey({ userId: '99', operatorId: 'pbx:b:12', assistantName: 'Anna' }));
        expect(key).not.toBe(operatorIdentityKey({ userId: '100', operatorId: 'pbx:a:12', assistantName: 'Anna' }));
    });
    it('preserves legacy names and missing-operator grouping', () => {
        expect(operatorIdentityFields({})).toEqual({});
        expect(operatorIdentityKey({ assistantName: ' Anna ' })).toBe(operatorIdentityKey({ assistantName: 'Anna' }));
        expect(operatorIdentityKey({})).toBe(operatorIdentityKey({ assistantName: 'Unknown Operator' }));
    });
    it('stores ID and extension independently and rejects invalid multipart metadata', () => {
        expect(operatorIdentityFields({ operatorId: ' pbx:a:12 ', operatorExtension: '0301' })).toEqual({ operatorId: 'pbx:a:12', operatorExtension: '0301' });
        expect(() => operatorIdentityFields({ operatorId: 123 as unknown as string })).toThrow('Invalid operatorId');
        expect(() => operatorIdentityFields({ operatorExtension: '3\n01' })).toThrow('Invalid operatorExtension');
        expect(() => operatorIdentityFields({ operatorId: 'a'.repeat(129) })).toThrow();
    });
    it('uses the latest display name without adding workplace to identity', () => {
        expect(operatorGroupIdentity([{ operatorId: 'a', assistantName: 'Old', createdAt: '2026-01-01' }, { operatorId: 'a', assistantName: 'New', createdAt: '2026-02-01' }]))
            .toEqual({ operatorId: 'a', operatorName: 'New' });
    });
});
