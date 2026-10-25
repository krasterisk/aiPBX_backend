import { Op } from 'sequelize';
import { applyJournalSelection, journalDateWhere, journalOption, journalPeople, journalValues } from './journal-selection';

describe('journal selections', () => {
    it.each(['{}', 'null', '[1]', '["unknown"]', '[' + Array(101).fill('"call"').join(',') + ']'])('rejects invalid bounded values %s', raw => {
        expect(() => journalValues(raw, ['call'])).toThrow();
    });
    it('deduplicates valid enum values', () => {
        expect(journalValues('["call","call"]', ['call'])).toEqual(['call']);
    });
    it.each(['[{}]', '[{"userId":"99","operatorId":"1","assistantId":"2"}]', '[{"operatorId":"1"}]', '[{"userId":"99","name":2}]'])('rejects ambiguous identities %s', raw => {
        expect(() => journalPeople(raw)).toThrow();
    });
    it('unions selected identities but intersects them with the authenticated scope', () => {
        const where: any = { userId: '99', [Op.and]: [{ projectId: 5 }] };
        applyJournalSelection(where, { userId: 'evil', people: JSON.stringify([{ userId: '99', operatorId: '218' }, { userId: 'elsewhere', assistantId: '8' }]), sources: '["external-api","external-front"]', callTypes: '["incoming","outgoing"]' } as any);
        expect(where.userId).toBe('99');
        expect(where[Op.and]).toHaveLength(4);
        expect(where[Op.and][0]).toEqual({ projectId: 5 });
        expect(where[Op.and][3][Op.or]).toEqual([{ userId: '99', operatorId: '218' }, { userId: 'elsewhere', assistantId: '8' }]);
        expect(where[Op.and][2][Op.or][0][Op.or]).toContainEqual({ callType: null });
    });
    it('preserves hostile-looking names as data and prevents legacy name aliases from matching stable IDs', () => {
        const where: any = {};
        const name = "Name' OR 1=1 --";
        applyJournalSelection(where, { people: JSON.stringify([{ userId: '99', name }]) } as any);
        const person = where[Op.and][0][Op.or][0];
        expect(person.assistantName).toBe(name);
        expect(person[Op.and]).toHaveLength(2);
    });
    it('keeps ISO boundaries precise across UTC midnight', () => {
        const range = journalDateWhere('2026-10-24T17:00:00.000Z', '2026-10-25T16:59:59.999Z');
        expect(range[Op.gte].toISOString()).toBe('2026-10-24T17:00:00.000Z');
        expect(range[Op.lte].toISOString()).toBe('2026-10-25T16:59:59.999Z');
    });
    it.each([['bad', '2026-10-25'], ['2026-10-26', '2026-10-25'], [['bad'], '2026-10-25']])('rejects invalid date bounds', (from, to) => {
        expect(() => journalDateWhere(from as any, to)).toThrow();
    });
    it('uses account+stable operator, account+assistant, or exact legacy name in options', () => {
        expect(JSON.parse(journalOption({ userId: '99', operatorId: '218', assistantId: '7', assistantName: 'One' }).value)).toEqual({ userId: '99', operatorId: '218' });
        expect(JSON.parse(journalOption({ userId: '99', assistantId: '7', assistantName: 'One' }).value)).toEqual({ userId: '99', assistantId: '7' });
        expect(JSON.parse(journalOption({ userId: '99', assistantId: '0', assistantName: 'One' }).value)).toEqual({ userId: '99', name: 'One' });
        expect(journalOption({ userId: '99', assistantName: 'Unknown Operator' })).toBeNull();
    });
});
