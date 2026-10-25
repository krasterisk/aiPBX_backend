import { journalOrderExpression } from './journal-order';
describe('journal order whitelist', () => {
    it('accepts only static supported expressions, never a supplied SQL fragment', () => {
        expect(journalOrderExpression("topic'; DROP TABLE users", 'postgres')).toBeNull();
        expect(journalOrderExpression('qualityScore', 'sqlite')).toBeNull();
        expect(journalOrderExpression('qualityScore', 'postgres')).toBe('"analytics"."qualityScore"');
        expect(journalOrderExpression('qualityScore', 'mysql')).toBe('`analytics`.`qualityScore`');
        expect(journalOrderExpression('topic', 'postgres')).toContain('string_agg');
        expect(journalOrderExpression('scenarioSuccess', 'postgres')).toContain('COALESCE');
    });
});
