import { parseKeywordList, spotKeywords } from './keyword-spotting';

describe('keyword-spotting', () => {
    describe('parseKeywordList', () => {
        it('parses comma-separated keywords', () => {
            expect(parseKeywordList('конкурент, возврат, GDPR')).toEqual(['конкурент', 'возврат', 'GDPR']);
        });

        it('returns empty for blank input', () => {
            expect(parseKeywordList('')).toEqual([]);
            expect(parseKeywordList(undefined)).toEqual([]);
        });
    });

    describe('spotKeywords', () => {
        it('finds case-insensitive matches', () => {
            const hits = spotKeywords('Клиент упомянул КОНКУРЕНТ в разговоре', ['конкурент', 'возврат']);
            expect(hits).toEqual(['конкурент']);
        });

        it('returns empty when nothing matches', () => {
            expect(spotKeywords('Обычный диалог', ['конкурент'])).toEqual([]);
        });
    });
});
