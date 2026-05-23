import { buildUpdFileId, buildUpdNschfdopprXml } from './upd-nschfdoppr-xml';
import type { InvoiceChetopParty } from '../sbis-invoice-party';

const seller: InvoiceChetopParty = {
    legalForm: 'ul',
    inn: '2465264296',
    kpp: '246501001',
    name: 'ООО "КРАСТЕРИСК"',
    address: 'г.Красноярск, пр-кт.Комсомольский, д.5, к.А, оф.212, 660118',
    okpo: '30474988',
    phone: '8 (391) 223-62-63',
    email: 'info@krasterisk.ru',
    bank: {
        bic: '045004774',
        corrAccount: '30101810600000000774',
        name: 'ФИЛИАЛ "НОВОСИБИРСКИЙ" АО "АЛЬФА-БАНК"',
        settlementAccount: '40702810123300000519',
    },
};

const buyer: InvoiceChetopParty = {
    legalForm: 'ul',
    inn: '3808211329',
    kpp: '381201001',
    name: 'ООО "ЭСМИКОМ И К"',
    address: 'Иркутская обл., г. Иркутск, д. 5, 664014',
    okpo: '64843492',
    bank: {
        bic: '045004774',
        corrAccount: '30101810600000000774',
        name: 'ФИЛИАЛ "НОВОСИБИРСКИЙ" АО "АЛЬФА-БАНК"',
        settlementAccount: '40702810523020000677',
    },
};

describe('upd-nschfdoppr-xml', () => {
    it('buildUpdFileId matches SBIS ON_NSCHFDOPPR pattern', () => {
        const id = buildUpdFileId(seller, buyer, '2026-05-22', '984ADA3D-ED9E-46B7-87B2-AB2C41529E69');
        expect(id).toBe(
            'ON_NSCHFDOPPR_2465264296246501001_3808211329381201001_20260522_984ADA3D-ED9E-46B7-87B2-AB2C41529E69_0_0_0_0_0_00',
        );
    });

    it('buildUpdNschfdopprXml matches SBIS reference structure (status 2 ДОП)', () => {
        const { xmlUtf8, fileName } = buildUpdNschfdopprXml({
            number: '336',
            documentDate: '2026-05-31',
            periodFrom: '2026-04-01',
            periodTo: '2026-04-30',
            amountRub: 3750,
            lineItemName: 'Услуги AIPBX.RU',
            note: 'Лицевой счёт AIPBX-1. Период оказания услуг: 01.04.2026 — 30.04.2026.',
            personalAccountNote: 'л/с AIPBX-1',
            seller,
            buyer,
            infoDateRu: '22.05.2026',
            infoTime: '11:37:05',
            fileUuid: '984ADA3D-ED9E-46B7-87B2-AB2C41529E69',
        });

        expect(fileName).toContain('ON_NSCHFDOPPR_');
        expect(xmlUtf8).toContain('ВерсФорм="5.03"');
        expect(xmlUtf8).toContain('КНД="1115131"');
        expect(xmlUtf8).toContain('Функция="ДОП"');
        expect(xmlUtf8).toContain('НомерДок="336"');
        expect(xmlUtf8).toContain('ДатаДок="31.05.2026"');
        expect(xmlUtf8).toContain('ИННЮЛ="2465264296"');
        expect(xmlUtf8).toContain('ИННЮЛ="3808211329"');
        expect(xmlUtf8).toContain('НаимТов="Услуги AIPBX.RU"');
        expect(xmlUtf8).toContain('ПрТовРаб="4"');
        expect(xmlUtf8).toContain('СтТовБезНДС="3750.00"');
        expect(xmlUtf8).toContain('<БезНДС>без НДС</БезНДС>');
        expect(xmlUtf8).toContain('СодОпер="Услуги оказаны в полном объеме"');
        expect(xmlUtf8).toContain('<БезДокОснПер>1</БезДокОснПер>');
    });
});
