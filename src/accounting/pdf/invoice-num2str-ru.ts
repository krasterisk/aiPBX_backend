/**
 * Сумма прописью (рубли и копейки). Порт логики num2str / morph из chet2pdf.php.
 */
function morph(n: number, f1: string, f2: string, f5: string): string {
    let x = Math.abs(Math.trunc(n)) % 100;
    if (x > 10 && x < 20) return f5;
    x %= 10;
    if (x > 1 && x < 5) return f2;
    if (x === 1) return f1;
    return f5;
}

const nul = 'ноль';
const ten: [string[], string[]] = [
    ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
    ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
];
const a20 = [
    'десять',
    'одиннадцать',
    'двенадцать',
    'тринадцать',
    'четырнадцать',
    'пятнадцать',
    'шестнадцать',
    'семнадцать',
    'восемнадцать',
    'девятнадцать',
];
const tens: Record<number, string> = {
    2: 'двадцать',
    3: 'тридцать',
    4: 'сорок',
    5: 'пятьдесят',
    6: 'шестьдесят',
    7: 'семьдесят',
    8: 'восемьдесят',
    9: 'девяносто',
};
const hundred = [
    '',
    'сто',
    'двести',
    'триста',
    'четыреста',
    'пятьсот',
    'шестьсот',
    'семьсот',
    'восемьсот',
    'девятьсот',
];
/** [именительный ед, род ед, род мн, род для цифр 1-9 внутри триады] — как в PHP */
const unit: [string, string, string, number][] = [
    ['копейка', 'копейки', 'копеек', 1],
    ['рубль', 'рубля', 'рублей', 0],
    ['тысяча', 'тысячи', 'тысяч', 1],
    ['миллион', 'миллиона', 'миллионов', 0],
    ['миллиард', 'миллиарда', 'миллиардов', 0],
];

export function amountInWordsRu(amount: number): string {
    const [rubRaw, kop] = amount.toFixed(2).split('.');
    const rub = rubRaw.padStart(15, '0');
    const out: string[] = [];
    const rubInt = parseInt(rub, 10);
    const kopInt = parseInt(kop, 10);

    if (rubInt > 0) {
        for (let chunkIdx = 0; chunkIdx < 5; chunkIdx++) {
            const v = rub.slice(chunkIdx * 3, chunkIdx * 3 + 3);
            if (!parseInt(v, 10)) continue;
            const uk = unit.length - chunkIdx - 1;
            const gender = unit[uk][3];
            const i1 = parseInt(v[0], 10);
            const i2 = parseInt(v[1], 10);
            const i3 = parseInt(v[2], 10);
            out.push(hundred[i1] || '');
            if (i2 > 1) {
                out.push(`${tens[i2]} ${ten[gender][i3]}`.trim());
            } else {
                out.push(i2 > 0 ? a20[i3] : ten[gender][i3]);
            }
            if (uk > 1) {
                out.push(morph(parseInt(v, 10), unit[uk][0], unit[uk][1], unit[uk][2]));
            }
        }
    } else {
        out.push(nul);
    }
    out.push(morph(rubInt, unit[1][0], unit[1][1], unit[1][2]));
    out.push(`${kop} ${morph(kopInt, unit[0][0], unit[0][1], unit[0][2])}`);
    return out
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
