import { randomUUID } from 'node:crypto';
import * as iconv from 'iconv-lite';
import { parsePersonFio, type InvoiceChetopParty } from '../sbis-invoice-party';

export interface InvoiceChetopBuildInput {
    number: string;
    /** ISO YYYY-MM-DD */
    documentDate: string;
    amountRub: number;
    /** Base nomenclature (without л/с); may contain &#xA; line breaks. */
    lineItemName: string;
    productCode?: string | null;
    /** Short payment designation (ДопСв/@НазнПл). */
    paymentDesignation: string;
    /** Full note for document/line ИнфПол (payment purpose + л/с). */
    infoPolNote: string;
    /** Line ИнфПол «Примечание» (e.g. л/с AIPBX-…). */
    personalAccountNote?: string | null;
    seller: InvoiceChetopParty;
    buyer: InvoiceChetopParty;
    fileUuid?: string;
    /** HH:MM:SS; defaults to current local time. */
    infoTime?: string;
}

export interface InvoiceChetopBuildResult {
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

/** Attribute value: preserve SBIS line-break entities (&#xA;) from wrapLineItemForChetop. */
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

/** Soft-wrap long line item like SBIS export (&#xA; in НаимТов attribute). */
export function wrapLineItemForChetop(text: string, maxLineLen = 48): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLineLen) return normalized;

    const words = normalized.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > maxLineLen && line) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    return lines.join('&#xA;');
}

export function formatIsoDateRu(iso: string): string {
    const p = iso.trim().split('-');
    if (p.length === 3 && p[0].length === 4) {
        return `${p[2]}.${p[1]}.${p[0]}`;
    }
    return iso;
}

export function formatIsoDateFileKey(iso: string): string {
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

export function buildChetopFileId(
    seller: InvoiceChetopParty,
    buyer: InvoiceChetopParty,
    documentDateIso: string,
    fileUuid: string,
): string {
    const sellerKey = partyFileKey(seller);
    const buyerKey = partyFileKey(buyer);
    const dateKey = formatIsoDateFileKey(documentDateIso);
    return `ON_CHETOP_${sellerKey}_${buyerKey}_${dateKey}_${fileUuid.toUpperCase()}`;
}

function buildFioAttrs(fio: InvoiceChetopParty['fio']): string {
    if (!fio) return '';
    let s = attr('Имя', fio.first) + attr('Фамилия', fio.family);
    if (fio.patronymic) s += attr('Отчество', fio.patronymic);
    return s;
}

function buildIdSvSeller(party: InvoiceChetopParty): string {
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

function buildIdSvBuyer(party: InvoiceChetopParty): string {
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

function buildBankRekv(bank: NonNullable<InvoiceChetopParty['bank']>): string {
    return `<БанкРекв${attr('БИК', bank.bic)}${attr('КорСчет', bank.corrAccount)}${attr('НаимБанк', bank.name)}${attr('НомерСчета', bank.settlementAccount)}/>`;
}

function buildAddress(party: InvoiceChetopParty): string {
    if (!party.address.trim()) return '';
    const rf = party.addressRf;
    if (rf && (rf.index || rf.city || rf.street)) {
        return `<Адрес>
          <АдрРФ${attr('Индекс', rf.index)}${attr('КодРегион', rf.regionCode)}${attr('НаимРегион', rf.regionName)}${attr('Город', rf.city)}${attr('Улица', rf.street)}${attr('Дом', rf.house)}${attr('Кварт', rf.flat)}/>
        </Адрес>`;
    }
    return `<Адрес>
          <АдрИнф${attr('КодСтр', '643')}${attr('НаимСтран', 'РОССИЯ')}${attr('АдрТекст', party.address)}/>
        </Адрес>`;
}

function buildContactBlock(party: InvoiceChetopParty): string {
    const phone = (party.phone || '').trim();
    const email = (party.email || '').trim();
    if (!phone && !email) return '';
    let block = '<Контакт>';
    if (phone) block += `\n          <Тлф>${escapeXml(phone)}</Тлф>`;
    if (email) block += `\n          <ЭлПочта>${escapeXml(email)}</ЭлПочта>`;
    block += '\n        </Контакт>';
    return block;
}

function buildSellerBlock(party: InvoiceChetopParty): string {
    let block = `<СвПрод${attr('ОКПО', party.okpo)}>
        ${buildIdSvSeller(party)}`;
    if (party.bank) block += `\n        ${buildBankRekv(party.bank)}`;
    const addr = buildAddress(party);
    if (addr) block += `\n        ${addr}`;
    const contact = buildContactBlock(party);
    if (contact) block += `\n        ${contact}`;
    block += '\n      </СвПрод>';
    return block;
}

function buildBuyerBlock(party: InvoiceChetopParty): string {
    let block = `<СвПокуп${attr('ОКПО', party.okpo)}${attr('СокрНаим', party.shortName || party.name)}>
        ${buildIdSvBuyer(party)}`;
    if (party.bank) block += `\n        ${buildBankRekv(party.bank)}`;
    const addr = buildAddress(party);
    if (addr) block += `\n        ${addr}`;
    block += '\n      </СвПокуп>';
    return block;
}

function buildInfoPolBlock(ident: string, value: string): string {
    return `<ТекстИнф${attr('Идентиф', ident)}${attr('Значен', value)}/>`;
}

function currentInfoTime(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function buildInvoiceChetopXml(input: InvoiceChetopBuildInput): InvoiceChetopBuildResult {
    const fileUuid = (input.fileUuid || randomUUID()).toUpperCase();
    const dateRu = formatIsoDateRu(input.documentDate);
    const infoTime = input.infoTime || currentInfoTime();
    const fileId = buildChetopFileId(input.seller, input.buyer, input.documentDate, fileUuid);
    const fileName = `${fileId}.xml`;

    const amountStr = formatMoney2(input.amountRub);
    const priceStr = formatUnitPrice(input.amountRub);
    const productCodeAttr = input.productCode ? attr('КодТов', input.productCode) : '';
    const lineItemName = wrapLineItemForChetop(input.lineItemName);

    const lineInfoPol = input.personalAccountNote?.trim()
        ? `\n        <ИнфПол>\n          ${buildInfoPolBlock('Примечание', input.personalAccountNote)}\n        </ИнфПол>`
        : '';

    const docInfoPol = input.infoPolNote.trim()
        ? `\n    <ИнфПол>\n      ${buildInfoPolBlock('Примечание', input.infoPolNote)}\n      ${buildInfoPolBlock('ИнфПередТабл', input.infoPolNote)}\n    </ИнфПол>`
        : '';

    const xmlUtf8 = `<?xml version="1.0" encoding="WINDOWS-1251" ?>
<Файл${attr('ВерсПрог', 'FED 3')}${attr('ВерсФорм', '5.01')}${attr('ИдФайл', fileId)}>

  <Документ${attr('ВрИнф', infoTime)}${attr('ДатаИнф', dateRu)}${attr('КНД', '1110379')}${attr('Функция', '0')}>
    <СодСч${attr('ДатаДок', dateRu)}${attr('НомерДок', input.number)}>
      <СведТовЦенПок${attr('НомСтр', '1')}${attr('НаимТов', lineItemName)}${attr('КолТов', '1')}${attr('НаимЕдИзм', 'шт')}${attr('ОКЕИТов', '796')}${attr('ЦенаТов', priceStr)}${attr('СтТовБезНДС', amountStr)}${attr('СтТовУчНал', amountStr)}>
        <НалСт>без НДС</НалСт>
        <СумНал>
          <СумНал>0.00</СумНал>
        </СумНал>
        <СумНалБезСки>
          <СумНал>0.00</СумНал>
        </СумНалБезСки>${productCodeAttr ? `\n        <ДопСведТов${productCodeAttr}/>` : ''}${lineInfoPol}
      </СведТовЦенПок>
      <ВсегоОпл${attr('СтТовБезНДСВсего', amountStr)}${attr('СтТовУчНалВсего', amountStr)}>
        <СумНалВсего>
          <БезНДС>без НДС</БезНДС>
        </СумНалВсего>
      </ВсегоОпл>
      <ДопСв${attr('НазнПл', input.paymentDesignation)}/>
      <ДенИзм${attr('НаимОКВ', 'Российский рубль')}>
        <КодОКВ>643</КодОКВ>
      </ДенИзм>
      ${buildSellerBlock(input.seller)}
      ${buildBuyerBlock(input.buyer)}
    </СодСч>${docInfoPol}
  </Документ>

</Файл>
`;

    const xmlBase64 = iconv.encode(xmlUtf8, 'win1251').toString('base64');
    return { fileId, fileName, xmlUtf8, xmlBase64 };
}
