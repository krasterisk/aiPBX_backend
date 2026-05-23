import { randomUUID } from 'node:crypto';
import * as iconv from 'iconv-lite';
import { parsePersonFio, type InvoiceChetopParty } from '../sbis-invoice-party';
import { formatIsoDateRu, wrapLineItemForChetop } from './invoice-chetop-xml';

export interface UpdNschfdopprBuildInput {
    /** SBIS document number (НомерДок); omit until assigned by SBIS. */
    number?: string | null;
    /** ISO YYYY-MM-DD — date on UPD (ДатаДок / ДатаПер). */
    documentDate: string;
    periodFrom: string;
    periodTo: string;
    amountRub: number;
    lineItemName: string;
    productCode?: string | null;
    /** Full SBIS Примечание / ИнфПол (period, л/с, USN). */
    note: string;
    personalAccountNote?: string | null;
    seller: InvoiceChetopParty;
    buyer: InvoiceChetopParty;
    fileUuid?: string;
    /** HH:MM:SS for ВремИнфПр. */
    infoTime?: string;
    /** DD.MM.YYYY for ДатаИнфПр; defaults to today (generation date). */
    infoDateRu?: string;
    transferOperationText?: string;
}

export interface UpdNschfdopprBuildResult {
    fileId: string;
    fileName: string;
    xmlUtf8: string;
    xmlBase64: string;
}

function normalizeXmlAttributeText(value: string): string {
    return value.replace(/[""„«»]/g, '"');
}

function escapeXml(value: string): string {
    return normalizeXmlAttributeText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeXmlAttributeValue(value: string): string {
    return value
        .split('&#xA;')
        .map((part) => escapeXml(part))
        .join('&#xA;');
}

function attr(name: string, value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (!s) return '';
    return ` ${name}="${escapeXmlAttributeValue(s)}"`;
}

function formatIsoDateFileKey(iso: string): string {
    const p = iso.trim().split('-');
    if (p.length === 3 && p[0].length === 4) {
        return `${p[0]}${p[1]}${p[2]}`;
    }
    return iso.replace(/\D/g, '');
}

function formatMoney2(amount: number): string {
    return amount.toFixed(2);
}

function formatUnitPrice(amount: number): string {
    if (Number.isInteger(amount)) return String(amount);
    return amount.toFixed(2);
}

function partyFileKey(party: InvoiceChetopParty): string {
    const inn = party.inn.replace(/\D/g, '');
    const kpp = (party.kpp || '').replace(/\D/g, '');
    return `${inn}${kpp}`;
}

export function buildUpdFileId(
    seller: InvoiceChetopParty,
    buyer: InvoiceChetopParty,
    documentDateIso: string,
    fileUuid: string,
): string {
    const dateKey = formatIsoDateFileKey(documentDateIso);
    return `ON_NSCHFDOPPR_${partyFileKey(seller)}_${partyFileKey(buyer)}_${dateKey}_${fileUuid.toUpperCase()}_0_0_0_0_0_00`;
}

function currentInfoTime(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function currentInfoDateRu(): string {
    return formatIsoDateRu(new Date().toISOString().slice(0, 10));
}

function buildFioAttrs(fio: InvoiceChetopParty['fio']): string {
    if (!fio) return '';
    let s = attr('Имя', fio.first) + attr('Фамилия', fio.family);
    if (fio.patronymic) s += attr('Отчество', fio.patronymic);
    return s;
}

function buildIdSv(party: InvoiceChetopParty): string {
    if (party.legalForm === 'ip') {
        const fio = party.fio || parsePersonFio(party.shortName || party.name);
        const ogrnip = party.ogrnip || party.ogrn || '';
        const regDate = party.ogrnipRegDate || '';
        const svGos =
            ogrnip && regDate ? `${ogrnip},${regDate}` : ogrnip ? String(ogrnip) : '';
        return `<ИдСв>
          <СвИП${attr('ИННФЛ', party.inn)}${attr('ОГРНИП', ogrnip)}${attr('ДатаОГРНИП', regDate)}${attr('СвГосРегИП', svGos)}>
            <ФИО${buildFioAttrs(fio)}/>
          </СвИП>
        </ИдСв>`;
    }
    return `<ИдСв>
          <СвЮЛУч${attr('НаимОрг', party.name)}${attr('ИННЮЛ', party.inn)}${attr('КПП', party.kpp)}/>
        </ИдСв>`;
}

function buildAddress(party: InvoiceChetopParty): string {
    if (!party.address.trim()) return '';
    return `<Адрес>
          <АдрИнф${attr('КодСтр', '643')}${attr('НаимСтран', 'РОССИЯ')}${attr('АдрТекст', party.address)}/>
        </Адрес>`;
}

function buildBankRekv(party: InvoiceChetopParty): string {
    const bank = party.bank;
    if (!bank) return '';
    return `<БанкРекв${attr('НомерСчета', bank.settlementAccount)}>
          <СвБанк${attr('БИК', bank.bic)}${attr('КорСчет', bank.corrAccount)}${attr('НаимБанк', bank.name)}/>
        </БанкРекв>`;
}

function buildContact(party: InvoiceChetopParty): string {
    const phone = (party.phone || '').trim();
    const email = (party.email || '').trim();
    if (!phone && !email) return '';
    let block = '<Контакт>';
    if (phone) block += `\n          <Тлф>${escapeXml(phone)}</Тлф>`;
    if (email) block += `\n          <ЭлПочта>${escapeXml(email)}</ЭлПочта>`;
    block += '\n        </Контакт>';
    return block;
}

function buildSvProd(party: InvoiceChetopParty): string {
    let block = `<СвПрод${attr('ОКПО', party.okpo)}>
        ${buildIdSv(party)}`;
    const addr = buildAddress(party);
    if (addr) block += `\n        ${addr}`;
    const bank = buildBankRekv(party);
    if (bank) block += `\n        ${bank}`;
    const contact = buildContact(party);
    if (contact) block += `\n        ${contact}`;
    block += '\n      </СвПрод>';
    return block;
}

function buildSvPokup(party: InvoiceChetopParty): string {
    let block = `<СвПокуп${attr('ОКПО', party.okpo)}>
        ${buildIdSv(party)}`;
    const addr = buildAddress(party);
    if (addr) block += `\n        ${addr}`;
    const bank = buildBankRekv(party);
    if (bank) block += `\n        ${bank}`;
    block += '\n      </СвПокуп>';
    return block;
}

function buildInfoPolFhxj1(note: string, personalAccountNote?: string | null): string {
    const rows: string[] = [];
    const pa = (personalAccountNote || '').trim();
    if (pa) {
        rows.push(`        <ТекстИнф${attr('Идентиф', 'Примечание')}${attr('Значен', pa)}/>`);
    }
    const periodNote = note.trim();
    if (periodNote) {
        rows.push(`        <ТекстИнф${attr('Идентиф', 'ИнфПередТабл')}${attr('Значен', periodNote)}/>`);
    }
    if (!rows.length) return '';
    return `\n      <ИнфПолФХЖ1>\n${rows.join('\n')}\n      </ИнфПолФХЖ1>`;
}

const PO_FACT_HZH =
    'Документ об отгрузке товаров (выполнении работ), передаче имущественных прав (документ об оказании услуг)';

export function buildUpdNschfdopprXml(input: UpdNschfdopprBuildInput): UpdNschfdopprBuildResult {
    const fileUuid = (input.fileUuid || randomUUID()).toUpperCase();
    const docDateRu = formatIsoDateRu(input.documentDate);
    const infoDateRu = input.infoDateRu || currentInfoDateRu();
    const infoTime = input.infoTime || currentInfoTime();
    const fileId = buildUpdFileId(input.seller, input.buyer, input.documentDate, fileUuid);
    const fileName = `${fileId}.xml`;

    const amountStr = formatMoney2(input.amountRub);
    const priceStr = formatUnitPrice(input.amountRub);
    const lineItemName = wrapLineItemForChetop(input.lineItemName);
    const productCode = (input.productCode || process.env.SBIS_CLOSING_PRODUCT_CODE || '').trim();
    const unitName = (process.env.SBIS_CLOSING_UPD_UNIT_NAME || 'усл').trim() || 'усл';
    const okei = (process.env.SBIS_CLOSING_UPD_OKEI || '796').trim() || '796';
    const transferText =
        (input.transferOperationText || process.env.SBIS_CLOSING_UPD_TRANSFER_TEXT || '').trim() ||
        'Услуги оказаны в полном объеме';

    const productCodeAttr = productCode ? attr('КодТов', productCode) : '';
    const docNumber = (input.number || '').trim();
    const docNumberAttrs = docNumber ? attr('НомерДок', docNumber) : '';
    const docRekvNumberAttrs = docNumber ? attr('РеквНомерДок', docNumber) : '';

    const xmlUtf8 = `<?xml version="1.0" encoding="WINDOWS-1251" ?>
<Файл${attr('ВерсПрог', 'FED 3')}${attr('ВерсФорм', '5.03')}${attr('ИдФайл', fileId)}>

  <Документ${attr('ВремИнфПр', infoTime)}${attr('ДатаИнфПр', infoDateRu)}${attr('КНД', '1115131')}${attr('НаимДокОпр', 'Универсальный передаточный документ')}${attr('НаимЭконСубСост', input.seller.name)}${attr('ПоФактХЖ', PO_FACT_HZH)}${attr('Функция', 'ДОП')}>
    <СвСчФакт${attr('ДатаДок', docDateRu)}${docNumberAttrs}>
      ${buildSvProd(input.seller)}
      <ДокПодтвОтгрНом${attr('РеквНаимДок', 'Универсальный передаточный документ')}${docRekvNumberAttrs}${attr('РеквДатаДок', docDateRu)}/>
      ${buildSvPokup(input.buyer)}
      <ДенИзм${attr('КодОКВ', '643')}${attr('НаимОКВ', 'Российский рубль')}/>${buildInfoPolFhxj1(input.note, input.personalAccountNote)}
    </СвСчФакт>
    <ТаблСчФакт>
      <СведТов${attr('НомСтр', '1')}${attr('НаимТов', lineItemName)}${attr('ОКЕИ_Тов', okei)}${attr('НаимЕдИзм', unitName)}${attr('КолТов', '1')}${attr('ЦенаТов', priceStr)}${attr('СтТовБезНДС', amountStr)}${attr('СтТовУчНал', amountStr)}${attr('НалСт', 'без НДС')}>
        <ДопСведТов${productCodeAttr}${attr('ПрТовРаб', '4')}/>
        <Акциз>
          <БезАкциз>без акциза</БезАкциз>
        </Акциз>
        <СумНал>
          <БезНДС>без НДС</БезНДС>
        </СумНал>
      </СведТов>
      <ВсегоОпл${attr('СтТовБезНДСВсего', amountStr)}${attr('СтТовУчНалВсего', amountStr)}${attr('КолНеттоВс', '1')}>
        <СумНалВсего>
          <БезНДС>без НДС</БезНДС>
        </СумНалВсего>
      </ВсегоОпл>
    </ТаблСчФакт>
    <СвПродПер>
      <СвПер${attr('ДатаПер', docDateRu)}${attr('СодОпер', transferText)}>
        <БезДокОснПер>1</БезДокОснПер>
      </СвПер>
    </СвПродПер>
  </Документ>

</Файл>
`;

    const xmlBase64 = iconv.encode(xmlUtf8, 'win1251').toString('base64');
    return { fileId, fileName, xmlUtf8, xmlBase64 };
}
