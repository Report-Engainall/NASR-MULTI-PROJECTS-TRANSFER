/**
 * Actual XLSX/OOXML writer using ZIP store entries, with no third-party spreadsheet dependency.
 * First worksheet has the exact 27 reference columns. The second carries the order/customer header.
 * Import compatibility is not certified until the owner's Onyx version accepts this workbook.
 */
export const ONYX_ORDER_COLUMNS = [
  'رقم الصنف','اسم الصنف','الوحدة','المخزن','الكمية','ك.المجانية','السعر','رقم الدفعة',
  'تاريخ الانتهاء','رقم المستفيد','مركز التكلفة','المشروع','النشاط','رقم عرض السعر','الوحدة العددية',
  'الخصم1','الخصم2','الخصم3','نوع الخصم (1-نسبة، 2-مبلغ)','حجز الكميات','إلى تاريخ',
  'الكمية المحجوزة','البيان','الطول','العرض','الارتفاع','العدد',
] as const;

export type OnyxExportItem = {
  item_code: string;
  product_name_snapshot: string;
  unit_snapshot: string | null;
  quantity: number;
  approved_quantity?: number | null;
  unit_price_snapshot: number;
  approved_unit_price?: number | null;
};

export type OnyxOrderWorkbookInput = {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  orderCreatedAt: string;
  customerCode: string;
  customerName: string;
  items: readonly OnyxExportItem[];
};

type CellValue = string | number | null | undefined;

function xmlEscape(value: string): string {
  // Imported business text can contain XML 1.0-forbidden control code points.
  // Remove them before escaping so one dirty cell cannot invalidate the XLSX package.
  const xmlSafe = Array.from(value).filter((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (
      codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff)
    );
  }).join('');
  return xmlSafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function finiteNonNegative(value: unknown, fieldLabel: string): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new Error('لا يمكن تصدير أونكس: قيمة ' + fieldLabel + ' غير صالحة.');
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('لا يمكن تصدير أونكس: قيمة ' + fieldLabel + ' غير صالحة.');
  }
  return parsed;
}

function positiveQuantity(value: unknown): number {
  const quantity = finiteNonNegative(value, 'الكمية');
  if (quantity <= 0) throw new Error('لا يمكن تصدير أونكس: يجب أن تكون كمية كل بند أكبر من صفر.');
  return quantity;
}

function cellXml(reference: string, value: CellValue): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return '<c r="' + reference + '" t="n"><v>' + String(value) + '</v></c>';
  }
  // Business IDs are inline strings (not formulas), preserving leading-zero SKUs such as 000125.
  return '<c r="' + reference + '" t="inlineStr"><is><t xml:space="preserve">' +
    xmlEscape(String(value)) + '</t></is></c>';
}

function worksheetXml(rows: readonly (readonly CellValue[])[], freezeFirstRow = false): string {
  const maxColumns = Math.max(1, ...rows.map((row) => row.length));
  const lastColumn = columnName(maxColumns - 1);
  const rowXml = rows.map((row, rowIndex) => '<row r="' + (rowIndex + 1) + '">' +
    row.map((value, columnIndex) => cellXml(columnName(columnIndex) + (rowIndex + 1), value)).join('') +
    '</row>').join('');
  const view = freezeFirstRow
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const filter = freezeFirstRow && rows.length > 1
    ? '<autoFilter ref="A1:' + lastColumn + rows.length + '"/>'
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    view + '<sheetFormatPr defaultRowHeight="18"/><sheetData>' + rowXml + '</sheetData>' +
    filter + '</worksheet>';
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let bit = 0; bit < 8; bit += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number): void { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number): void { view.setUint32(offset, value >>> 0, true); }

function zipStore(files: readonly { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;
  const utf8Flag = 0x0800;
  const dosDate = 0x0021;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, utf8Flag);
    write16(localView, 8, 0);
    write16(localView, 10, 0);
    write16(localView, 12, dosDate);
    write32(localView, 14, crc);
    write32(localView, 18, data.length);
    write32(localView, 22, data.length);
    write16(localView, 26, name.length);
    write16(localView, 28, 0);
    localHeader.set(name, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, utf8Flag);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, dosDate);
    write32(centralView, 16, crc);
    write32(centralView, 20, data.length);
    write32(centralView, 24, data.length);
    write16(centralView, 28, name.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
    centralSize += centralHeader.length;
  }

  const centralOffset = localOffset;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, centralOffset);
  write16(endView, 20, 0);

  const output = new Uint8Array(centralOffset + centralSize + end.length);
  let offset = 0;
  for (const part of localParts) { output.set(part, offset); offset += part.length; }
  for (const part of centralParts) { output.set(part, offset); offset += part.length; }
  output.set(end, offset);
  return output;
}

export function buildOnyxDetailRows(input: OnyxOrderWorkbookInput): CellValue[][] {
  return [
    [...ONYX_ORDER_COLUMNS],
    ...input.items.map((item) => {
      const quantity = positiveQuantity(item.approved_quantity ?? item.quantity);
      const price = finiteNonNegative(item.approved_unit_price ?? item.unit_price_snapshot, 'سعر الوحدة');
      return [
        String(item.item_code ?? ''),
        String(item.product_name_snapshot ?? ''),
        String(item.unit_snapshot ?? ''),
        '', quantity, '', price,
        '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '',
        String(input.orderNumber),
        '', '', '', '',
      ];
    }),
  ];
}

function workbookFiles(input: OnyxOrderWorkbookInput): { name: string; content: string }[] {
  const detailRows = buildOnyxDetailRows(input);
  const headerRows: CellValue[][] = [
    ['الحقل', 'القيمة'],
    ['النظام المصدر', 'Aghbari Commerce'],
    ['رقم الطلب', input.orderNumber],
    ['المعرف الداخلي للطلب', input.orderId],
    ['تاريخ الطلب', input.orderCreatedAt],
    ['حالة الطلب', input.orderStatus],
    ['رقم العميل', input.customerCode],
    ['اسم العميل', input.customerName],
    ['وقت إنشاء الملف', new Date().toISOString()],
    ['حالة توافق أونكس', 'غير مثبت — يلزم اختبار الاستيراد على إصدار أونكس المستهدف'],
    ['ملاحظة', 'الحقول غير المتاحة تُركت فارغة؛ لم تُختلق بيانات.'],
  ];
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  const packageRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="تفاصيل الأصناف" sheetId="1" r:id="rId1"/><sheet name="رأس المستند" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029"/></workbook>';
  const workbookRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '</Relationships>';
  const coreProperties = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>متجر الأغبري — ' + xmlEscape(input.orderNumber) + '</dc:title><dc:creator>Aghbari Commerce</dc:creator>' +
    '<dc:subject>Onyx import layout draft; compatibility not certified</dc:subject>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:created></cp:coreProperties>';
  const appProperties = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>Aghbari Commerce</Application><TitlesOfParts><vt:vector size="2" baseType="lpstr">' +
    '<vt:lpstr>تفاصيل الأصناف</vt:lpstr><vt:lpstr>رأس المستند</vt:lpstr></vt:vector></TitlesOfParts></Properties>';
  return [
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: packageRelationships },
    { name: 'docProps/core.xml', content: coreProperties },
    { name: 'docProps/app.xml', content: appProperties },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelationships },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(detailRows, true) },
    { name: 'xl/worksheets/sheet2.xml', content: worksheetXml(headerRows) },
  ];
}

export function buildOnyxOrderWorkbook(input: OnyxOrderWorkbookInput): Uint8Array {
  if (!input.orderId.trim() || !input.orderNumber.trim()) throw new Error('رقم الطلب ومعرّفه مطلوبان للتصدير.');
  if (!input.items.length) throw new Error('لا يمكن إنشاء ملف طلب بلا أصناف.');
  return zipStore(workbookFiles(input));
}

export function onyxOrderWorkbookFilename(orderNumber: string): string {
  const safe = orderNumber.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'order';
  return 'Aghbari-Onyx-' + safe + '.xlsx';
}
