import {
    buildChetopFileId,
    buildInvoiceChetopXml,
    formatIsoDateRu,
    wrapLineItemForChetop,
} from './invoice-chetop-xml';
import type { InvoiceChetopParty } from '../sbis-invoice-party';

const sellerUl: InvoiceChetopParty = {
    legalForm: 'ul',
    inn: '2465264296',
    kpp: '246501001',
    name: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "КРАСТЕРИСК"',
    address: 'г.Красноярск, пр-кт.Комсомольский, д.5, к.А, оф.212, 660118',
    okpo: '30474988',
    phone: '8 (391) 223-62-63',
    email: 'info@krasterisk.ru',
    bank: {
        bic: '045004774',
        corrAccount: '30101810600000000774',
        name: 'ФИЛИАЛ "НОВОСИБИРСКИЙ" АО "АЛЬФА-БАНК" Г. Новосибирск',
        settlementAccount: '40702810123300000519',
    },
};

const buyerIp: InvoiceChetopParty = {
    legalForm: 'ip',
    inn: '246513890738',
    name: 'ИП Перязев Андрей Александрович',
    shortName: 'ИП Перязев Андрей Александрович',
    address: '660118, г. Красноярск, пр. Комсомольский 5а-212',
    ogrnip: '316246800066038',
    ogrnipRegDate: '10.03.2016',
    okpo: '0080192858',
    fio: { family: 'Перязев', first: 'Андрей', patronymic: 'Александрович' },
    bank: {
        bic: '045004774',
        corrAccount: '30101810600000000774',
        name: 'ФИЛИАЛ "НОВОСИБИРСКИЙ" АО "АЛЬФА-БАНК" Г. Новосибирск',
        settlementAccount: '40802810623300000935',
    },
};

describe('invoice-chetop-xml', () => {
    it('formatIsoDateRu converts ISO to DD.MM.YYYY', () => {
        expect(formatIsoDateRu('2026-05-18')).toBe('18.05.2026');
    });

    it('buildChetopFileId uses inn+kpp for UL seller', () => {
        const id = buildChetopFileId(sellerUl, buyerIp, '2026-05-22', '628b4317-b60b-4c40-8e75-672287920a18');
        expect(id).toBe(
            'ON_CHETOP_2465264296246501001_246513890738_20260522_628B4317-B60B-4C40-8E75-672287920A18',
        );
    });

    it('wrapLineItemForChetop inserts line breaks for long text', () => {
        const wrapped = wrapLineItemForChetop(
            'Аванс за предоставление доступа к облачному сервису обработки голосовых вызовов (AIPBX.RU)',
            48,
        );
        expect(wrapped).toContain('&#xA;');
    });

    it('buildInvoiceChetopXml matches SBIS reference structure', () => {
        const longName =
            'Аванс за предоставление доступа к облачному сервису обработки голосовых вызовов (распознавание речи, речевая аналитика, генерация AI-ответов) с использованием технологий искусственного интеллекта (AIPBX.RU)';
        const { xmlUtf8 } = buildInvoiceChetopXml({
            number: 'AIPBX-01425',
            documentDate: '2026-05-22',
            amountRub: 1003,
            lineItemName: longName,
            productCode: 'X9303005',
            paymentDesignation: 'Оплата по счету № AIPBX-01425 от 22.05.2026',
            infoPolNote: 'Оплата по счёту №AIPBX-01425 от 22.05.2026, л/с AIPBX-00000095',
            personalAccountNote: 'л/с AIPBX-00000095',
            seller: sellerUl,
            buyer: buyerIp,
            fileUuid: '59bec70f-a531-4a9b-a810-45dd05121499',
            infoTime: '11:32:01',
        });

        expect(xmlUtf8).toContain('СвЮЛУч');
        expect(xmlUtf8).toContain('&quot;КРАСТЕРИСК&quot;');
        expect(xmlUtf8).toContain('НаимТов="Аванс');
        expect(xmlUtf8).toContain('&#xA;');
        expect(xmlUtf8).toContain('Идентиф="Примечание"');
        expect(xmlUtf8).toContain('Идентиф="ИнфПередТабл"');
        expect(xmlUtf8).toContain('л/с AIPBX-00000095');
        expect(xmlUtf8).toContain('ДатаОГРНИП="10.03.2016"');
        expect(xmlUtf8).toContain('СвГосРегИП="316246800066038,10.03.2016"');
        expect(xmlUtf8).toContain('<Тлф>8 (391) 223-62-63</Тлф>');
        expect(xmlUtf8).toContain('<ЭлПочта>info@krasterisk.ru</ЭлПочта>');
        expect(xmlUtf8).toContain('СокрНаим="ИП Перязев');
    });
});
