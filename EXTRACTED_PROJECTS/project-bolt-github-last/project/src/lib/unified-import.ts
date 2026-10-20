// Unified import engine: CSV streaming, XLSX parsing, SHA-256 hashing, data quality, import profile rules.

export const MAX_IMPORT_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_IMPORT_COLUMNS = 200;
export const MAX_IMPORT_ROWS = 100_000;
export const MAX_CELL_LENGTH = 4000;
export const UPLOAD_CHUNK_BYTES = 64 * 1024;
export const PROCESSING_CHUNK_ROWS = 500;

export const DEFAULT_SYNONYMS: Record<string, string> = {
  'رمز الصنف': 'item_code',
  'اسم المنتج': 'product_name',
  'الصنف': 'item_code',
  'الاسم': 'product_name',
  'الكمية': 'quantity',
  'quantity': 'quantity',
  'item_code': 'item_code',
  'product_name': 'product_name',
  'barcode': 'barcode',
  'الباركود': 'barcode',
  'unit': 'unit',
  'الوحدة': 'unit',
  'price': 'base_price',
  'السعر': 'base_price',
  'category': 'category_name',
  'الفئة': 'category_name',
  'description': 'description',
  'الوصف': 'description',
  'date': 'date',
  'التاريخ': 'date',
};

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

export function normalizeHeader(raw: string): string {
  const normalized = raw
    .trim()
    .normalize('NFKC')
    .replace(/\u0640/g, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .toLocaleLowerCase('ar')
    .replace(/\s+/g, ' ')
    .trim();

  if (DEFAULT_SYNONYMS[normalized]) return DEFAULT_SYNONYMS[normalized];
  if (DEFAULT_SYNONYMS[raw.trim()]) return DEFAULT_SYNONYMS[raw.trim()];

  return normalized
    .replace(/[^\p{L}\p{N}_]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJsonStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableJsonStringify((value as Record<string, unknown>)[k])).join(',') + '}';
}

// --- SHA-256 incremental hashing ---

export class IncrementalSha256 {
  private state: Uint8Array;
  private buffer: Uint8Array;
  private bufferLength: number;
  private totalLength: bigint;

  constructor() {
    this.state = new Uint8Array(32);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.totalLength = 0n;
    // Initialize SHA-256 state
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const view = new DataView(this.state.buffer);
    for (let i = 0; i < 8; i++) view.setUint32(i * 4, H[i], false);
  }

  update(data: Uint8Array): void {
    const view = new DataView(this.state.buffer);
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    const rotr = (n: number, s: number) => ((n >>> s) | (n << (32 - s))) >>> 0;

    this.totalLength += BigInt(data.length);

    let offset = 0;
    while (offset < data.length) {
      const space = 64 - this.bufferLength;
      const toCopy = Math.min(space, data.length - offset);
      this.buffer.set(data.subarray(offset, offset + toCopy), this.bufferLength);
      this.bufferLength += toCopy;
      offset += toCopy;

      if (this.bufferLength === 64) {
        const w = new Int32Array(64);
        for (let i = 0; i < 16; i++) {
          w[i] = (this.buffer[i * 4] << 24) | (this.buffer[i * 4 + 1] << 16) | (this.buffer[i * 4 + 2] << 8) | this.buffer[i * 4 + 3];
        }
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = ((w[i - 16] + s0 + w[i - 7] + s1) | 0) >>> 0;
        }

        let [a, b, c, d, e, f, g, h] = [
          view.getUint32(0, false), view.getUint32(4, false), view.getUint32(8, false), view.getUint32(12, false),
          view.getUint32(16, false), view.getUint32(20, false), view.getUint32(24, false), view.getUint32(28, false),
        ];

        for (let i = 0; i < 64; i++) {
          const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
          const ch = (e & f) ^ (~e & g);
          const temp1 = (((h + S1 + ch + K[i] + w[i]) | 0) >>> 0);
          const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const temp2 = ((S0 + maj) | 0) >>> 0;
          h = g; g = f; f = e; e = ((d + temp1) | 0) >>> 0;
          d = c; c = b; b = a; a = ((temp1 + temp2) | 0) >>> 0;
        }

        view.setUint32(0, (view.getUint32(0, false) + a) >>> 0, false);
        view.setUint32(4, (view.getUint32(4, false) + b) >>> 0, false);
        view.setUint32(8, (view.getUint32(8, false) + c) >>> 0, false);
        view.setUint32(12, (view.getUint32(12, false) + d) >>> 0, false);
        view.setUint32(16, (view.getUint32(16, false) + e) >>> 0, false);
        view.setUint32(20, (view.getUint32(20, false) + f) >>> 0, false);
        view.setUint32(24, (view.getUint32(24, false) + g) >>> 0, false);
        view.setUint32(28, (view.getUint32(28, false) + h) >>> 0, false);

        this.bufferLength = 0;
      }
    }
  }

  digestHex(): string {
    const view = new DataView(this.state.buffer);
    const padding = new Uint8Array(72);
    padding[0] = 0x80;
    const bitLength = this.totalLength * 8n;
    const paddingLength = this.bufferLength < 56 ? 56 - this.bufferLength : 120 - this.bufferLength;
    const padded = new Uint8Array(this.bufferLength + paddingLength + 8);
    padded.set(this.buffer.subarray(0, this.bufferLength), 0);
    padded[this.bufferLength] = 0x80;
    const view2 = new DataView(padded.buffer);
    view2.setUint32(padded.length - 4, Number(bitLength & 0xFFFFFFFFn), false);
    view2.setUint32(padded.length - 8, Number((bitLength >> 32n) & 0xFFFFFFFFn), false);

    this.state = new Uint8Array(32);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const v = new DataView(this.state.buffer);
    for (let i = 0; i < 8; i++) v.setUint32(i * 4, H[i], false);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;

    this.update(padded);

    let hex = '';
    for (let i = 0; i < 32; i++) {
      hex += this.state[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
}

export async function hashFileSha256(file: Blob): Promise<string> {
  const hasher = new IncrementalSha256();
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value as Uint8Array);
  }
  return hasher.digestHex();
}

// --- CSV streaming parser ---

export class StreamingCsvParser {
  private pending = '';
  private inQuotes = false;
  private field = '';
  private row: string[] = [];
  private started = false;

  async push(
    chunk: string,
    onRow: (row: string[]) => void,
    isFinal = false,
  ): Promise<void> {
    this.pending += chunk;
    let i = 0;
    while (i < this.pending.length) {
      const char = this.pending[i];
      if (this.inQuotes) {
        if (char === '"') {
          if (this.pending[i + 1] === '"') {
            this.field += '"';
            i += 2;
            continue;
          }
          this.inQuotes = false;
          i++;
          continue;
        }
        this.field += char;
        i++;
        continue;
      }
      if (char === '"') {
        this.inQuotes = true;
        this.started = true;
        i++;
        continue;
      }
      if (char === ',') {
        this.row.push(this.field);
        this.field = '';
        this.started = false;
        i++;
        continue;
      }
      if (char === '\r') {
        if (this.pending[i + 1] === '\n') {
          i++;
        }
        this.row.push(this.field);
        this.field = '';
        this.started = false;
        onRow(this.row);
        this.row = [];
        i++;
        continue;
      }
      if (char === '\n') {
        this.row.push(this.field);
        this.field = '';
        this.started = false;
        onRow(this.row);
        this.row = [];
        i++;
        continue;
      }
      this.field += char;
      this.started = true;
      i++;
    }
    this.pending = this.pending.slice(i);
    if (isFinal && this.pending.length === 0 && (this.started || this.row.length > 0 || this.field.length > 0)) {
      this.row.push(this.field);
      onRow(this.row);
      this.field = '';
      this.row = [];
      this.started = false;
    }
  }
}

// --- XLSX parsing (minimal OOXML reader) ---

type XlsxParseResult = { rowCount: number; worksheetName: string };

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}
function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

async function readZipEntries(blob: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 22 || readUint32(new DataView(bytes.buffer, bytes.length - 22, 4), 0) !== 0x06054b50) {
    throw new Error('ترويسة ZIP غير صالحة');
  }
  const endView = new DataView(bytes.buffer, bytes.length - 22, 22);
  const centralOffset = readUint32(endView, 16);
  const centralCount = readUint16(endView, 10);

  const entries = new Map<string, Uint8Array>();
  let pos = centralOffset;
  for (let i = 0; i < centralCount; i++) {
    const view = new DataView(bytes.buffer, pos, 46);
    if (readUint32(view, 0) !== 0x02014b50) break;
    const nameLen = readUint16(view, 28);
    const extraLen = readUint16(view, 30);
    const commentLen = readUint16(view, 32);
    const localOffset = readUint32(view, 42);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    const localView = new DataView(bytes.buffer, localOffset, 30);
    const localNameLen = readUint16(localView, 26);
    const localExtraLen = readUint16(localView, 28);
    const compressedSize = readUint32(localView, 18);
    const dataOffset = localOffset + 30 + localNameLen + localExtraLen;
    const compression = readUint16(localView, 8);
    if (compression === 0) {
      entries.set(name, bytes.subarray(dataOffset, dataOffset + compressedSize));
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRe = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRe.exec(xml)) !== null) {
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    let text = '';
    while ((tMatch = tRe.exec(match[1])) !== null) {
      text += decodeXmlEntities(tMatch[1]);
    }
    strings.push(text);
  }
  return strings;
}

function extractCellRef(ref: string): { col: number; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return { col: 0, row: 0 };
  let col = 0;
  for (const ch of match[1]) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { col: col - 1, row: parseInt(match[2], 10) - 1 };
}

function applyNumberFormat(value: string, formatCode: string): string {
  if (/^0+$/.test(formatCode) || /^0+\.0+$/.test(formatCode)) {
    const decimals = (formatCode.split('.')[1] || '').length;
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(decimals).padStart(formatCode.indexOf('.') === -1 ? formatCode.length : formatCode.split('.')[0].length, '0');
  }
  return value;
}

export async function parseXlsxFirstWorksheet(
  file: Blob,
  onRow: (row: string[]) => void,
): Promise<XlsxParseResult> {
  const entries = await readZipEntries(file);
  const workbookXml = new TextDecoder().decode(entries.get('xl/workbook.xml') || new Uint8Array());
  const relsXml = new TextDecoder().decode(entries.get('xl/_rels/workbook.xml.rels') || new Uint8Array());

  const sheetRe = /<sheet[^>]+name="([^"]*)"[^>]+sheetId="([^"]*)"[^>]+r:id="([^"]*)"/;
  const sheetMatch = sheetRe.exec(workbookXml);
  if (!sheetMatch) throw new Error('لا توجد أوراق في الملف');
  const sheetName = sheetMatch[1];
  const rId = sheetMatch[3];

  const relRe = new RegExp(`Id="${rId}"[^>]+Target="([^"]+)"`);
  const relMatch = relRe.exec(relsXml);
  if (!relMatch) throw new Error('تعذر العثور على مسار الورقة');
  const sheetPath = 'xl/' + relMatch[1].replace(/^\.\//, '');
  const sheetXml = new TextDecoder().decode(entries.get(sheetPath) || new Uint8Array());
  const sharedStringsXml = new TextDecoder().decode(entries.get('xl/sharedStrings.xml') || new Uint8Array());
  const sharedStrings = sharedStringsXml ? extractSharedStrings(sharedStringsXml) : [];

  const stylesXml = new TextDecoder().decode(entries.get('xl/styles.xml') || new Uint8Array());
  const numFmtMap = new Map<number, string>();
  const fmtRe = /<numFmt[^>]+numFmtId="(\d+)"[^>]+formatCode="([^"]*)"/g;
  let fmtMatch: RegExpExecArray | null;
  while ((fmtMatch = fmtRe.exec(stylesXml)) !== null) {
    numFmtMap.set(parseInt(fmtMatch[1], 10), fmtMatch[2]);
  }
  const cellXfRe = /<xf[^>]+numFmtId="(\d+)"/g;
  const xfFormats: number[] = [];
  while ((fmtMatch = cellXfRe.exec(stylesXml)) !== null) {
    xfFormats.push(parseInt(fmtMatch[1], 10));
  }

  let rowCount = 0;
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(sheetXml)) !== null) {
    const rowContent = rowMatch[1];
    const cells: Map<number, string> = new Map();
    const cellRe = /<c\s+([^>]*)>(?:<v>([\s\S]*?)<\/v>|<is><t>([\s\S]*?)<\/t><\/is>)?<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const refMatch = /r="([A-Z]+\d+)"/.exec(attrs);
      const typeMatch = /t="(\w+)"/.exec(attrs);
      const styleMatch = /s="(\d+)"/.exec(attrs);
      const ref = refMatch ? extractCellRef(refMatch[1]) : { col: 0, row: 0 };
      const type = typeMatch ? typeMatch[1] : 'n';
      const v = cellMatch[2] || '';
      const inlineStr = cellMatch[3] || '';

      let value = '';
      if (type === 's') {
        value = sharedStrings[parseInt(v, 10)] || '';
      } else if (type === 'inlineStr') {
        value = decodeXmlEntities(inlineStr);
      } else if (type === 'str') {
        value = v;
      } else {
        value = v;
        if (styleMatch) {
          const styleIdx = parseInt(styleMatch[1], 10);
          const fmtId = xfFormats[styleIdx] || 0;
          const fmtCode = numFmtMap.get(fmtId) || '';
          if (fmtCode) value = applyNumberFormat(value, fmtCode);
        }
      }
      cells.set(ref.col, value);
    }
    const maxCol = Math.max(0, ...cells.keys());
    const row: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      row.push(cells.get(c) || '');
    }
    onRow(row);
    rowCount++;
  }

  return { rowCount, worksheetName: sheetName };
}

// --- CSV row validation ---

export type ParsedImportRow = {
  row_number: number;
  data: Record<string, string>;
  status: 'valid' | 'rejected';
  errors: string[];
};

export function validateCsvRow(
  cells: string[],
  headers: string[],
  rowNumber: number,
): ParsedImportRow {
  const data: Record<string, string> = {};
  const errors: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (!header) continue;
    const value = cells[i] || '';
    if (value.length > MAX_CELL_LENGTH) {
      errors.push(`الخلطة في العمود ${header} تتجاوز الحد الأقصى (${MAX_CELL_LENGTH} حرف)`);
    }
    data[header] = value;
  }

  return {
    row_number: rowNumber,
    data,
    status: errors.length > 0 ? 'rejected' : 'valid',
    errors,
  };
}

// --- Data quality accumulator ---

export type QualityResult = {
  score: number;
  label: 'excellent' | 'good' | 'fair' | 'poor';
  totalRows: number;
  validRows: number;
  rejectedRows: number;
};

export class DataQualityAccumulator {
  private total = 0;
  private valid = 0;
  private rejected = 0;

  constructor(
    private readonly headers: string[],
    private readonly primaryKey: string,
  ) {}

  add(row: ParsedImportRow): void {
    this.total++;
    if (row.status === 'valid') this.valid++;
    else this.rejected++;
  }

  result(): QualityResult {
    const score = this.total === 0 ? 100 : Math.round((this.valid / this.total) * 100);
    let label: QualityResult['label'] = 'excellent';
    if (score < 50) label = 'poor';
    else if (score < 75) label = 'fair';
    else if (score < 90) label = 'good';
    return { score, label, totalRows: this.total, validRows: this.valid, rejectedRows: this.rejected };
  }
}

export function chooseImportStatus(score: number): 'completed' | 'manual_review' | 'rejected' {
  if (score >= 75) return 'completed';
  if (score >= 50) return 'manual_review';
  return 'rejected';
}

// --- Import profile rules ---

export type ImportTransformation = {
  field: string;
  operation: 'trim' | 'lowercase' | 'uppercase' | 'to_number' | 'date_iso';
};

export type ImportValidationRule = {
  field: string;
  rule: 'required' | 'numeric' | 'min' | 'max' | 'safe_pattern' | 'enum';
  value?: string | number;
  values?: string[];
  message?: string;
};

const SAFE_OPERATIONS = new Set(['trim', 'lowercase', 'uppercase', 'to_number', 'date_iso']);
const SAFE_RULES = new Set(['required', 'numeric', 'min', 'max', 'safe_pattern', 'enum']);
const MAX_ENUM_VALUES = 100;

export function validateImportProfileRules(
  transformations: ImportTransformation[],
  validations: ImportValidationRule[],
): void {
  for (const t of transformations) {
    if (!SAFE_OPERATIONS.has(t.operation))
      throw new Error(`قاعدة تحويل غير مدعومة: ${t.operation}`);
  }
  for (const v of validations) {
    if (!SAFE_RULES.has(v.rule))
      throw new Error(`قاعدة تحقق غير مدعومة: ${v.rule}`);
    if (v.rule === 'safe_pattern' && v.value) {
      if (v.value.length > 200 || /\(\?\!|\(\?\=|\(\?\<|\(\?\#|\(\?[aiLmsux-]+:/.test(v.value) || /(.)\1{4,}/.test(v.value))
        throw new Error('نمط التحقق غير آمن');
    }
    if (v.rule === 'enum' && v.values && v.values.length > MAX_ENUM_VALUES)
      throw new Error(`قاعدة enum تتجاوز الحد الأقصى (${MAX_ENUM_VALUES} قيمة)`);
  }
}

export function applyImportProfileRules(
  row: ParsedImportRow,
  transformations: ImportTransformation[],
  validations: ImportValidationRule[],
): ParsedImportRow {
  let data = { ...row.data };
  const errors = [...row.errors];

  for (const t of transformations) {
    if (!(t.field in data)) continue;
    let value = data[t.field];
    switch (t.operation) {
      case 'trim': value = value.trim(); break;
      case 'lowercase': value = value.toLocaleLowerCase('ar'); break;
      case 'uppercase': value = value.toLocaleUpperCase('ar'); break;
      case 'to_number':
        if (value.trim() && !isNaN(Number(value))) value = String(Number(value));
        break;
      case 'date_iso': {
        const d = value.trim();
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d);
        if (m) {
          const [, day, month, year] = m;
          value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        break;
      }
    }
    data[t.field] = value;
  }

  for (const v of validations) {
    if (!(v.field in data)) continue;
    const value = data[v.field];
    switch (v.rule) {
      case 'required':
        if (!value.trim())
          errors.push(v.message || `${v.field} مطلوب`);
        break;
      case 'numeric':
        if (value.trim() && isNaN(Number(value)))
          errors.push(v.message || `${v.field} يجب أن يكون رقمًا`);
        break;
      case 'min':
        if (value.trim() && Number(value) < (v.value as number))
          errors.push(v.message || `${v.field} يجب أن يكون ${v.value} على الأقل`);
        break;
      case 'max':
        if (value.trim() && Number(value) > (v.value as number))
          errors.push(v.message || `${v.field} يجب ألا يتجاوز ${v.value}`);
        break;
      case 'safe_pattern': {
        if (value.trim() && v.value) {
          try {
            const re = new RegExp(v.value);
            if (!re.test(value))
              errors.push(v.message || `${v.field} لا يطابق النمط المطلوب`);
          } catch {
            // Skip invalid regex
          }
        }
        break;
      }
      case 'enum':
        if (value.trim() && v.values && !v.values.includes(value))
          errors.push(v.message || `${v.field} ليس من القيم المسموح بها`);
        break;
    }
  }

  return {
    ...row,
    data,
    status: errors.length > 0 ? 'rejected' : 'valid',
    errors,
  };
}

// --- Verified chunk prefix validation ---

type VerifiedChunk = {
  chunk_number: number;
  byte_offset: number;
  byte_size: number;
  chunk_hash: string;
};

export function validateVerifiedImportChunkPrefix(
  chunks: VerifiedChunk[],
  totalBytes: number,
  chunkSize: number,
): number[] {
  const sorted = [...chunks].sort((a, b) => a.chunk_number - b.chunk_number);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].chunk_number !== i)
      throw new Error('فجوة في تسلسل الأجزاء');
    const expectedOffset = i * chunkSize;
    if (sorted[i].byte_offset !== expectedOffset)
      throw new Error('إزاحة البايت غير متطابقة');
    if (!/^[a-f0-9]{64}$/i.test(sorted[i].chunk_hash))
      throw new Error('تجزئة الجزء غير متطابقة');
  }
  return sorted.map((c) => c.chunk_number);
}

export function shouldPersistParsedImportRow(
  rowNumber: number,
  verifiedChunks: Set<number>,
  isEof = false,
): boolean {
  if (isEof) return true;
  return !verifiedChunks.has(rowNumber);
}
