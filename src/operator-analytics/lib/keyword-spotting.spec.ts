import { parseKeywordList, spotKeywords, spotTaxonomyTags } from './keyword-spotting';

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

    describe('spotTaxonomyTags', () => {
        const billingTheme = {
            id: 'billing',
            name: 'Счета',
            aliases: ['счёт', 'счет'],
        };
        const returnsTheme = {
            id: 'returns',
            name: 'Возвраты',
            aliases: ['возврат'],
        };

        it('matches a synonym as a whole word', () => {
            expect(spotTaxonomyTags('Клиент просит выставите счёт', [billingTheme])).toEqual(['billing']);
        });

        it('does not match synonym embedded in a longer word', () => {
            expect(spotTaxonomyTags('У нас сломался счётчик воды', [billingTheme])).toEqual([]);
        });

        it('matches case-insensitively for Cyrillic and Latin', () => {
            const taxonomy = [{ id: 'gdpr', name: 'GDPR', aliases: ['gdpr'] }];
            expect(spotTaxonomyTags('We discussed GDPR compliance', taxonomy)).toEqual(['gdpr']);
            expect(spotTaxonomyTags('обсудили GDPR', taxonomy)).toEqual(['gdpr']);
        });

        it('treats regex punctuation in synonyms literally', () => {
            const taxonomy = [{ id: 'price', name: 'Price', aliases: ['$100'] }];
            expect(spotTaxonomyTags('Скидка $100 на заказ', taxonomy)).toEqual(['price']);
            expect(spotTaxonomyTags('Скидка 100 на заказ', taxonomy)).toEqual([]);
        });

        it('skips empty or whitespace-only synonyms', () => {
            const taxonomy = [{ id: 'bad', name: 'Bad', aliases: ['', '   ', 'valid'] }];
            expect(spotTaxonomyTags('Клиент сказал valid слово', taxonomy)).toEqual(['bad']);
            expect(spotTaxonomyTags('любой текст без valid', [{ id: 'bad', name: 'Bad', aliases: ['', '   '] }])).toEqual([]);
        });

        it('returns a theme once when multiple aliases match', () => {
            const taxonomy = [{ id: 'returns', name: 'Возвраты', aliases: ['возврат', 'вернуть товар'] }];
            expect(spotTaxonomyTags('Клиент хочет возврат и вернуть товар', taxonomy)).toEqual(['returns']);
        });

        it('caps results deterministically in taxonomy order', () => {
            const taxonomy = Array.from({ length: 12 }, (_, i) => ({
                id: `tag_${i}`,
                name: `Tag ${i}`,
                aliases: [`keyword${i}`],
            }));
            const transcript = taxonomy.map(t => t.aliases[0]).join(' ');
            expect(spotTaxonomyTags(transcript, taxonomy, 10)).toHaveLength(10);
            expect(spotTaxonomyTags(transcript, taxonomy, 10)[0]).toBe('tag_0');
            expect(spotTaxonomyTags(transcript, taxonomy, 10)[9]).toBe('tag_9');
        });

        it('returns empty for empty taxonomy, empty transcript, or theme without synonyms', () => {
            expect(spotTaxonomyTags('', [billingTheme])).toEqual([]);
            expect(spotTaxonomyTags('текст', [])).toEqual([]);
            expect(spotTaxonomyTags('текст', [{ id: 'x', name: '', aliases: [] }])).toEqual([]);
        });

        it('falls back to theme name when aliases are absent', () => {
            expect(spotTaxonomyTags('обсуждали возврат', [returnsTheme])).toEqual(['returns']);
        });
    });
});
