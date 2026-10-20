import type { ProductPriceGridRow } from '@/lib/api';
import { PRICE_GRID_EXPORT_HEADERS } from '@/lib/price-grid-csv';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const encoder = new TextEncoder();

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function columnName(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) { const rem = (n - 1) % 26; result = String.fromCharCode(65 + rem) + result; n = Math.floor((n - 1) / 26); }
  return result;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
type ZipPart = { name: string; bytes: Uint8Array; crc: number; offset: number };
function zipStored(parts: Array<{name:string; text:string}>): Uint8Array {
  const entries: ZipPart[] = [];
  const localChunks: Uint8Array[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = encoder.encode(part.name);
    const bytes = encoder.encode(part.text);
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0,0x04034b50,true); view.setUint16(4,20,true); view.setUint16(6,0,true);
    view.setUint16(8,0,true); view.setUint16(10,0,true); view.setUint16(12,0,true);
    view.setUint32(14,crc,true); view.setUint32(18,bytes.length,true); view.setUint32(22,bytes.length,true);
    view.setUint16(26,name.length,true); view.setUint16(28,0,true); header.set(name,30);
    entries.push({name:part.name,bytes,crc,offset}); localChunks.push(header,bytes); offset+=header.length+bytes.length;
  }
  const directoryOffset=offset, centralChunks:Uint8Array[]=[];
  for(const entry of entries){
    const name=encoder.encode(entry.name);
    const header=new Uint8Array(46+name.length); const view=new DataView(header.buffer);
    view.setUint32(0,0x02014b50,true); view.setUint16(4,20,true); view.setUint16(6,20,true);
    view.setUint16(8,0,true); view.setUint16(10,0,true); view.setUint16(12,0,true); view.setUint16(14,0,true);
    view.setUint32(16,entry.crc,true); view.setUint32(20,entry.bytes.length,true); view.setUint32(24,entry.bytes.length,true);
    view.setUint16(28,name.length,true); view.setUint16(30,0,true); view.setUint16(32,0,true);
    view.setUint16(34,0,true); view.setUint16(36,0,true); view.setUint32(38,0,true); view.setUint32(42,entry.offset,true);
    header.set(name,46); centralChunks.push(header); offset+=header.length;
  }
  const centralSize=offset-directoryOffset;
  const end=new Uint8Array(22); const v=new DataView(end.buffer);
  v.setUint32(0,0x06054b50,true); v.setUint16(4,0,true); v.setUint16(6,0,true);
  v.setUint16(8,entries.length,true); v.setUint16(10,entries.length,true);
  v.setUint32(12,centralSize,true); v.setUint32(16,directoryOffset,true); v.setUint16(20,0,true);
  const total=localChunks.reduce((n,c)=>n+c.length,0)+centralChunks.reduce((n,c)=>n+c.length,0)+end.length;
  const result=new Uint8Array(total); let cursor=0;
  for(const chunk of [...localChunks,...centralChunks,end]){result.set(chunk,cursor);cursor+=chunk.length;}
  return result;
}
function textCell(ref:string,value:string):string {
  return '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(value)+'</t></is></c>';
}
function numberCell(ref:string,value:number,decimals=2):string {
  if(!Number.isFinite(value)||value<0||value>999999999999) throw new Error('لا يمكن تصدير قيمة سعر/مخزون خارج النطاق.');
  return '<c r="'+ref+'" t="n"><v>'+value.toFixed(decimals)+'</v></c>';
}
/** Export only persisted server rows. Untrusted identifiers and labels are inline strings, never formula cells. */
export function buildPriceGridXlsx(rows: readonly ProductPriceGridRow[]): Blob {
  if(rows.length>100000) throw new Error('عدد الأصناف أكبر من حد ملف Excel الآمن.');
  const headers=[...PRICE_GRID_EXPORT_HEADERS];
  const table:(string|number|null)[][]=[headers];
  for(const row of rows) table.push([
    row.id,row.item_code,row.name,row.unit,row.is_active?'نشط':'موقوف',
    Number(row.base_price),Number(row.price_wholesale_of_wholesale),Number(row.price_wholesale),Number(row.price_retail),
    row.quantity_on_hand_total,row.quantity_reserved_total,row.quantity_available_total,row.reorder_point_total,row.inventory_warehouse_count,
  ]);
  const sheetRows=table.map((values,rowIndex)=>{
    const cells=values.map((value,colIndex)=>{
      const ref=columnName(colIndex)+(rowIndex+1);
      if (value === null) return textCell(ref,'');
      if (typeof value !== 'number') return textCell(ref,value);
      const decimals = colIndex >= 9 && colIndex <= 11 ? 3 : colIndex >= 12 ? 0 : 2;
      return numberCell(ref,value,decimals);
    }).join('');
    return '<row r="'+(rowIndex+1)+'">'+cells+'</row>';
  }).join('');
  const worksheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+sheetRows+'</sheetData></worksheet>';
  const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="شبكة الأسعار" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
  const rootRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const workbookRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  const bytes=zipStored([
    {name:'[Content_Types].xml',text:contentTypes},
    {name:'_rels/.rels',text:rootRels},
    {name:'xl/workbook.xml',text:workbook},
    {name:'xl/_rels/workbook.xml.rels',text:workbookRels},
    {name:'xl/worksheets/sheet1.xml',text:worksheet},
  ]);
  return new Blob([bytes],{type:XLSX_MIME});
}
export function downloadPriceGridXlsx(rows: readonly ProductPriceGridRow[]): void {
  if(!rows.length||typeof document==='undefined'||typeof URL.createObjectURL!=='function') return;
  const url=URL.createObjectURL(buildPriceGridXlsx(rows));
  const anchor=document.createElement('a');
  anchor.href=url; anchor.download='aghbari-price-grid-'+new Date().toISOString().slice(0,10)+'.xlsx'; anchor.hidden=true;
  document.body.appendChild(anchor);
  try{anchor.click();}finally{anchor.remove();URL.revokeObjectURL(url);}
}
