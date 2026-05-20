import { amountInWordsRu } from './invoice-num2str-ru';

describe('amountInWordsRu', () => {
    it('formats thousands correctly', () => {
        const words = amountInWordsRu(1000);
        expect(words).toContain('тысяч');
        expect(words).not.toMatch(/^один рубл/);
        expect(words).toMatch(/00 копеек$/);
    });

    it('formats fractional rubles', () => {
        const words = amountInWordsRu(1);
        expect(words).toMatch(/один рубль 00 копеек/);
    });

    it('formats complex amount', () => {
        const words = amountInWordsRu(1234.56);
        expect(words).toContain('рубл');
        expect(words).toContain('56 копеек');
    });
});
