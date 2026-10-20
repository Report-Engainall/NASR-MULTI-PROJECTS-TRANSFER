import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardList, PackageCheck, Plus, Printer,
  RefreshCw, Send, Trash2, Warehouse,
} from 'lucide-react';
import {
  cancelPurchaseOrder, createPurchaseOrder, fetchActiveInventoryWarehouses, fetchProducts,
  fetchPurchaseOrders, fetchSuppliers, receivePurchaseOrder, submitPurchaseOrder,
} from '@/lib/api';
import type { PurchaseOrderLineCommand, PurchaseReceiptLineCommand } from '@/lib/api';
import type { PurchaseOrder } from '@/lib/purchase-orders';
import type { ProductWithInventory, Supplier } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';

type WarehouseOption = { id: string; name: string; code: string | null };
type DraftLine = { productId: string; quantity: string; unitCost: string };

const statusLabel: Record<string,string> = {
  draft: 'مسودة', submitted: 'معتمد للتوريد', partially_received: 'استلام جزئي',
  received: 'مستلم بالكامل', cancelled: 'ملغى',
};
const statusClass: Record<string,string> = {
  draft: 'muted', submitted: 'warning', partially_received: 'info', received: 'success', cancelled: 'danger',
};
const newLine = (): DraftLine => ({ productId: '', quantity: '1', unitCost: '' });
const numberText = (value: number): string => new Intl.NumberFormat('ar-YE',{maximumFractionDigits:3}).format(value);
const moneyText = (value: number | null): string => value === null ? 'غير مسجل' : formatCurrency(value);

export function PurchaseOrdersPage() {
  const { user } = useAuth();
  const canManage = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const [orders,setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers,setSuppliers] = useState<Supplier[]>([]);
  const [products,setProducts] = useState<ProductWithInventory[]>([]);
  const [warehouses,setWarehouses] = useState<WarehouseOption[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [statusFilter,setStatusFilter] = useState<'all' | PurchaseOrder['status']>('all');
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [showCreate,setShowCreate] = useState(false);
  const [supplierId,setSupplierId] = useState('');
  const [warehouseId,setWarehouseId] = useState('');
  const [notes,setNotes] = useState('');
  const [draftLines,setDraftLines] = useState<DraftLine[]>([newLine()]);
  const [cancelReason,setCancelReason] = useState('');
  const [receiptNotes,setReceiptNotes] = useState('');
  const [receiveDrafts,setReceiveDrafts] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [nextOrders,nextSuppliers,nextProducts,nextWarehouses] = await Promise.all([
        fetchPurchaseOrders(),fetchSuppliers(),fetchProducts(),fetchActiveInventoryWarehouses(),
      ]);
      setOrders(nextOrders);
      setSuppliers(nextSuppliers);
      setProducts(nextProducts.filter((product) => product.status === 'active'));
      setWarehouses(nextWarehouses);
      setSupplierId((current) => current && nextSuppliers.some((supplier) => supplier.id === current && (supplier.status ?? 'active') === 'active')
        ? current : nextSuppliers.find((supplier) => (supplier.status ?? 'active') === 'active')?.id ?? '');
      setWarehouseId((current) => current && nextWarehouses.some((warehouse) => warehouse.id === current)
        ? current : nextWarehouses[0]?.id ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل أوامر الشراء والمراجع.');
    } finally {
      setLoading(false);
    }
  },[canManage]);

  useEffect(() => { void load(); },[load]);

  const visibleOrders = useMemo(
    () => orders.filter((order) => statusFilter === 'all' || order.status === statusFilter),
    [orders,statusFilter],
  );
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders,selectedId],
  );
  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => (supplier.status ?? 'active') === 'active'),
    [suppliers],
  );
  const totalOpen = orders.filter((order) => ['submitted','partially_received'].includes(order.status)).length;
  const totalDraft = orders.filter((order) => order.status === 'draft').length;
  const totalReceived = orders.filter((order) => order.status === 'received').length;

  async function createDraft() {
    if (!supplierId || !warehouseId) { setError('اختر موردًا نشطًا ومخزنًا نشطًا.'); return; }
    const parsed: PurchaseOrderLineCommand[] = [];
    const seen = new Set<string>();
    for (let i=0;i<draftLines.length;i++) {
      const line=draftLines[i];
      if (!line.productId) { setError('اختر صنفًا لكل سطر أو احذف السطر الفارغ.'); return; }
      if (seen.has(line.productId)) { setError('الصنف مكرر. اجمع الكمية في سطر واحد.'); return; }
      seen.add(line.productId);
      if (!line.quantity.trim()) { setError('الكمية مطلوبة لكل صنف.'); return; }
      const quantity=Number(line.quantity);
      if (!Number.isFinite(quantity)||quantity<=0||quantity>999999999999.999||
          !Number.isSafeInteger(Math.round(quantity*1000))||Math.round(quantity*1000)!==quantity*1000) {
        setError('الكمية يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.'); return;
      }
      let unitCost: number | null = null;
      if (line.unitCost.trim() !== '') {
        unitCost=Number(line.unitCost);
        if (!Number.isFinite(unitCost)||unitCost<0||unitCost>9999999999999.99||
            !Number.isSafeInteger(Math.round(unitCost*100))||Math.round(unitCost*100)!==unitCost*100) {
          setError('تكلفة الوحدة يجب أن تكون غير سالبة وبحد أقصى منزلتين عشريتين، أو اتركها فارغة لحين التأكيد من المورد.'); return;
        }
      }
      parsed.push({product_id:line.productId,quantity,unit_cost:unitCost});
    }
    setBusy(true);setError('');setNotice('');
    try {
      const result=await createPurchaseOrder({
        supplierId,warehouseId,lines:parsed,notes,
        idempotencyKey:'po-'+crypto.randomUUID().replace(/-/g,''),
      });
      setSelectedId(result.purchase_order.id);
      setShowCreate(false);setNotes('');setDraftLines([newLine()]);
      await load();
      setNotice(result.idempotent_replay
        ? 'استُعيد أمر الشراء نفسه بمفتاح منع التكرار؛ لم يُنشأ أمر مكرر.'
        : 'حُفظت مسودة أمر الشراء من البيانات الحالية. لم يتغير المخزون قبل الاستلام الفعلي.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ مسودة أمر الشراء.');
    } finally { setBusy(false); }
  }

  async function submitSelected() {
    if (!selectedOrder || busy || selectedOrder.status !== 'draft') return;
    setBusy(true);setError('');setNotice('');
    try {
      await submitPurchaseOrder(selectedOrder.id);
      await load();
      setNotice('تم اعتماد أمر الشراء داخل النظام؛ لم يُرسل بريد أو رسالة للمورد تلقائيًا. أُنشئت مهمة استلام واحدة في مركز المهام من الحدث المحفوظ.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إرسال أمر الشراء.');
    } finally { setBusy(false); }
  }

  async function cancelSelected() {
    if (!selectedOrder || busy || !['draft','submitted'].includes(selectedOrder.status)) return;
    if (cancelReason.trim().length<3) { setError('سبب إلغاء أمر الشراء مطلوب.'); return; }
    if (!window.confirm('تأكيد إلغاء أمر الشراء دون إضافة أي كمية إلى المخزون؟')) return;
    setBusy(true);setError('');setNotice('');
    try {
      await cancelPurchaseOrder(selectedOrder.id,cancelReason);
      setCancelReason('');
      await load();
      setNotice('أُلغي أمر الشراء وسُجل السبب في التدقيق. لم يُعدّل المخزون.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إلغاء أمر الشراء.');
    } finally { setBusy(false); }
  }

  async function postReceipt() {
    if (!selectedOrder || busy || !['submitted','partially_received'].includes(selectedOrder.status)) return;
    const lines: PurchaseReceiptLineCommand[]=[];
    for (const item of selectedOrder.items) {
      const raw=receiveDrafts[item.id];
      if (raw===undefined||raw.trim()==='') continue;
      const quantity=Number(raw);
      if (!Number.isFinite(quantity)||quantity<=0||quantity>item.remaining_quantity||
          !Number.isSafeInteger(Math.round(quantity*1000))||Math.round(quantity*1000)!==quantity*1000) {
        setError('كمية استلام '+item.product_name+' يجب أن تكون موجبة ولا تتجاوز المتبقي ('+numberText(item.remaining_quantity)+').');
        return;
      }
      lines.push({item_id:item.id,quantity});
    }
    if (!lines.length) { setError('أدخل كمية الاستلام لبند واحد على الأقل.'); return; }
    if (!window.confirm('سيُرحّل الاستلام إلى المخزون الفعلي ويُسجل في دفتر الحركات. راجع الكميات قبل المتابعة.')) return;
    setBusy(true);setError('');setNotice('');
    try {
      const result=await receivePurchaseOrder({
        purchaseOrderId:selectedOrder.id,lines,notes:receiptNotes,
        idempotencyKey:'pr-'+crypto.randomUUID().replace(/-/g,''),
      });
      setReceiveDrafts({});setReceiptNotes('');
      await load();
      setNotice('حُفظ إيصال '+result.receipt.receipt_number+'؛ حالة أمر الشراء: '+(statusLabel[result.purchase_order.status]??result.purchase_order.status)+
        (result.idempotent_replay?' (استعادة لنفس الإيصال دون تكرار المخزون).':'')+
        '، وجرى تسجيل حركات المخزون ومهمة الاستلام.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر ترحيل إيصال الاستلام.');
    } finally { setBusy(false); }
  }

  if (!canManage) return <section className="panel" dir="rtl"><h1>صلاحية إدارة المشتريات مطلوبة</h1><p>تقتصر أوامر الشراء وتكاليف الموردين على مدير النظام أو المدير. يفرض الخادم الصلاحية نفسها.</p></section>;

  return <section className="purchase-orders" dir="rtl">
    <style>{`
      .purchase-orders{display:grid;gap:16px;min-width:0}
      .purchase-orders .po-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .purchase-orders .po-layout{display:grid;grid-template-columns:minmax(280px,0.9fr) minmax(0,1.4fr);gap:16px;align-items:start}
      .purchase-orders .po-card{border:1px solid var(--border,#d9e1e5);border-radius:12px;padding:14px;display:grid;gap:8px;background:var(--card,#fff)}
      .purchase-orders .po-card[aria-current=true]{border-color:var(--primary,#0b7c88);box-shadow:0 0 0 1px var(--primary,#0b7c88)}
      .purchase-orders .po-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .purchase-orders .po-lines{display:grid;gap:10px}
      .purchase-orders .po-line{display:grid;grid-template-columns:minmax(150px,2fr) minmax(90px,0.7fr) minmax(110px,0.8fr) auto;gap:8px;align-items:end}
      .purchase-orders .po-table-wrap{overflow:auto;max-width:100%}
      .purchase-orders .po-table-wrap table{width:100%;border-collapse:collapse}
      .purchase-orders .po-table-wrap th,.purchase-orders .po-table-wrap td{padding:9px;border-bottom:1px solid var(--border,#e2e8f0);text-align:right;white-space:nowrap}
      .purchase-orders .po-muted{color:var(--muted-foreground,#64748b);font-size:12px;line-height:1.7}
      .purchase-orders .po-status{display:inline-flex;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:800}
      .purchase-orders .po-status.success{background:#e8f6ed;color:#166534}.purchase-orders .po-status.warning{background:#fff3d9;color:#854d0e}
      .purchase-orders .po-status.info{background:#e0f2fe;color:#075985}.purchase-orders .po-status.danger{background:#fee2e2;color:#991b1b}.purchase-orders .po-status.muted{background:#eef2f6;color:#475569}
      .purchase-orders .po-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .purchase-orders .po-summary article{border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:12px;display:grid;gap:5px}
      .purchase-orders .po-summary strong{font-size:21px}
      .purchase-orders .po-notice{border-radius:10px;padding:11px 13px;background:#f0fdf4;color:#166534}
      .purchase-orders .po-error{border-radius:10px;padding:11px 13px;background:#fef2f2;color:#991b1b}
      .purchase-orders .po-create-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .purchase-orders .po-field{display:grid;gap:5px;min-width:0}
      .purchase-orders .po-field input,.purchase-orders .po-field select,.purchase-orders .po-field textarea{width:100%;box-sizing:border-box;min-width:0}
      .purchase-orders .po-field textarea{min-height:72px}
      @media(max-width:850px){.purchase-orders .po-layout{grid-template-columns:1fr}.purchase-orders .po-line{grid-template-columns:1fr 1fr}.purchase-orders .po-line .wide{grid-column:1/-1}}
      @media(max-width:480px){.purchase-orders .po-summary,.purchase-orders .po-create-grid{grid-template-columns:1fr}.purchase-orders .po-line{grid-template-columns:1fr}}
      @media print{
        body *{visibility:hidden!important}.purchase-orders,.purchase-orders *{visibility:visible!important}
        .purchase-orders{position:absolute;inset:0;width:100%;color:#000!important;background:#fff!important}
        .purchase-orders .no-print{display:none!important}.purchase-orders .po-layout{display:block}
        .purchase-orders .po-card,.purchase-orders .panel{break-inside:avoid}
        .purchase-orders .po-table-wrap th,.purchase-orders .po-table-wrap td{color:#000!important;border-color:#999!important}
      }
    `}</style>
    <header className="heading">
      <div className="heading-icon"><PackageCheck size={24}/></div>
      <div><span>التوريد والمخزون</span><h1>أوامر الشراء والاستلام</h1>
        <p>مسودة شراء، اعتماد داخلي، استلام جزئي أو كامل، وحركات مخزون قابلة للتدقيق. لا يُزاد الرصيد إلا بعد ترحيل إيصال فعلي؛ لا يُرسل بريد أو رسالة للمورد تلقائيًا.</p>
      </div>
    </header>
    <section className="panel no-print">
      <div className="panel-head"><div><h2>متابعة التوريد</h2><p>الموردون والمخازن والأصناف من سجلات المؤسسة الحالية. لا توجد بيانات تجريبية.</p></div>
        <div className="po-actions">
          <button className="btn secondary" type="button" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={16}/> تحديث</button>
          <button className="btn outline" type="button" onClick={()=>window.print()} disabled={!visibleOrders.length}><Printer size={16}/> طباعة النتائج</button>
          <button className="btn primary" type="button" onClick={()=>{setShowCreate((v)=>!v);setError('');}} disabled={busy}><Plus size={16}/>{showCreate?'إغلاق نموذج الشراء':'إنشاء مسودة أمر شراء'}</button>
        </div>
      </div>
      <div className="po-summary" style={{marginTop:14}}>
        <article><span>أوامر تنتظر الاستلام</span><strong>{formatNumber(totalOpen)}</strong></article>
        <article><span>مسودات</span><strong>{formatNumber(totalDraft)}</strong></article>
        <article><span>مكتملة الاستلام</span><strong>{formatNumber(totalReceived)}</strong></article>
      </div>
    </section>

    {error&&<div className="po-error" role="alert"><AlertTriangle size={16} style={{verticalAlign:'middle',marginInlineEnd:6}}/>{error}</div>}
    {notice&&<div className="po-notice" role="status"><CheckCircle2 size={16} style={{verticalAlign:'middle',marginInlineEnd:6}}/>{notice}</div>}

    {showCreate&&<section className="panel no-print">
      <div className="panel-head"><div><h2>مسودة أمر شراء جديدة</h2><p>يمكن ترك تكلفة الوحدة فارغة إلى أن يؤكدها المورد؛ سيبقى الإجمالي غير مسجل.</p></div></div>
      {(!activeSuppliers.length||!warehouses.length||!products.length)&&<p className="po-muted">يلزم توفر مورد نشط وصنف نشط ومخزن نشط قبل إنشاء أمر الشراء. لا تُنشأ سجلات بديلة تلقائيًا.</p>}
      <div className="po-create-grid">
        <label className="po-field">المورد<select value={supplierId} onChange={(e)=>setSupplierId(e.target.value)} disabled={busy||!activeSuppliers.length}><option value="">اختر موردًا نشطًا</option>{activeSuppliers.map((supplier)=><option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.supplier_code?' · '+supplier.supplier_code:''}</option>)}</select></label>
        <label className="po-field">المخزن المستلم<select value={warehouseId} onChange={(e)=>setWarehouseId(e.target.value)} disabled={busy||!warehouses.length}><option value="">اختر مخزنًا نشطًا</option>{warehouses.map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code?' · '+warehouse.code:''}</option>)}</select></label>
      </div>
      <div className="po-lines" style={{marginTop:14}}>
        {draftLines.map((line,index)=><div className="po-line" key={index}>
          <label className="po-field wide">الصنف<select value={line.productId} onChange={(e)=>setDraftLines((old)=>old.map((row,i)=>i===index?{...row,productId:e.target.value}:row))} disabled={busy}><option value="">اختر صنفًا</option>{products.map((product)=><option key={product.id} value={product.id}>{product.name} · {product.item_code}</option>)}</select></label>
          <label className="po-field">الكمية المطلوبة<input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e)=>setDraftLines((old)=>old.map((row,i)=>i===index?{...row,quantity:e.target.value}:row))} disabled={busy}/></label>
          <label className="po-field">تكلفة الوحدة (اختياري)<input type="number" min="0" step="0.01" value={line.unitCost} placeholder="غير مسجل" onChange={(e)=>setDraftLines((old)=>old.map((row,i)=>i===index?{...row,unitCost:e.target.value}:row))} disabled={busy}/></label>
          <button className="btn outline" type="button" aria-label={'حذف سطر الصنف '+(index+1)} onClick={()=>setDraftLines((old)=>old.length<=1?old.filter((_,i)=>i!==index):old.filter((_,i)=>i!==index))} disabled={busy||draftLines.length===1}><Trash2 size={15}/> حذف</button>
        </div>)}
      </div>
      <label className="po-field" style={{marginTop:12}}>ملاحظات داخلية للشراء/المخزن<textarea value={notes} onChange={(e)=>setNotes(e.target.value)} maxLength={2000} disabled={busy}/></label>
      <div className="po-actions" style={{marginTop:12}}>
        <button className="btn outline" type="button" onClick={()=>setDraftLines((old)=>old.length>=100?old:[...old,newLine()])} disabled={busy||draftLines.length>=100}><Plus size={15}/> إضافة صنف</button>
        <button className="btn primary" type="button" onClick={()=>void createDraft()} disabled={busy||!activeSuppliers.length||!warehouses.length||!products.length}>{busy?'جار الحفظ…':'حفظ مسودة أمر الشراء'}</button>
      </div>
    </section>}

    <div className="panel no-print">
      <div className="po-actions" style={{justifyContent:'space-between'}}>
        <h2>سجل أوامر الشراء</h2>
        <label className="po-field">الحالة<select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as typeof statusFilter)}><option value="all">كل الحالات</option><option value="draft">مسودة</option><option value="submitted">مرسل للمورد</option><option value="partially_received">استلام جزئي</option><option value="received">مستلم بالكامل</option><option value="cancelled">ملغى</option></select></label>
      </div>
      {loading?<p role="status">جار تحميل سجلات التوريد…</p>:visibleOrders.length===0?<p className="po-muted">لا توجد أوامر شراء تطابق الفلتر الحالي.</p>:
        <div className="po-layout" style={{marginTop:12}}>
          <div style={{display:'grid',gap:10}}>
            {visibleOrders.map((order)=><button key={order.id} type="button" className="po-card" aria-current={selectedId===order.id?'true':'false'} onClick={()=>{setSelectedId(order.id);setCancelReason('');setReceiveDrafts({});setError('');}} style={{textAlign:'right',cursor:'pointer'}}>
              <div className="po-card-top"><strong>{order.purchase_order_number}</strong><span className={'po-status '+statusClass[order.status]}>{statusLabel[order.status]}</span></div>
              <strong>{order.supplier_name}</strong><span className="po-muted"><Warehouse size={13} style={{verticalAlign:'middle'}}/> {order.warehouse_name}</span>
              <span className="po-muted">{formatDateShort(order.created_at)} · {formatNumber(order.items.length)} أصناف</span>
              <div className="po-card-top"><span>التكلفة المسجلة</span><strong>{moneyText(order.total_cost)}</strong></div>
            </button>)}
          </div>
          <div>
            {!selectedOrder?<div className="po-card"><ClipboardList size={28}/><strong>اختر أمر شراء لعرض بنوده وإجراءاته.</strong><span className="po-muted">الإرسال والاستلام يؤثران في المهام وحركات المخزون الحقيقية عبر RPC خادمية.</span></div>:
              <section className="panel" style={{padding:14}}>
                <div className="po-card-top"><div><span className="po-muted">أمر الشراء</span><h2>{selectedOrder.purchase_order_number}</h2></div><span className={'po-status '+statusClass[selectedOrder.status]}>{statusLabel[selectedOrder.status]}</span></div>
                <p><strong>المورد:</strong> {selectedOrder.supplier_name} · {selectedOrder.supplier_code}</p>
                <p><strong>المخزن:</strong> {selectedOrder.warehouse_name}</p>
                <p><strong>الإجمالي:</strong> {moneyText(selectedOrder.total_cost)} <span className="po-muted">| لا يُحول الإجمالي المجهول إلى صفر.</span></p>
                {selectedOrder.notes&&<p><strong>ملاحظات:</strong> {selectedOrder.notes}</p>}
                {['draft','submitted'].includes(selectedOrder.status)&&<label className="po-field no-print" style={{marginBlock:10}}>سبب الإلغاء (مطلوب عند الإلغاء)<input value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} maxLength={1000} placeholder="اكتب السبب الداخلي للإلغاء" disabled={busy}/></label>}
                <div className="po-table-wrap"><table><thead><tr><th>رمز الصنف</th><th>الصنف</th><th>المطلوب</th><th>المستلم</th><th>المتبقي</th><th>تكلفة الوحدة</th><th>قيمة البند</th></tr></thead><tbody>
                  {selectedOrder.items.map((item)=><tr key={item.id}><td>{item.item_code}</td><td>{item.product_name}</td><td>{numberText(item.quantity_ordered)}</td><td>{numberText(item.quantity_received)}</td><td>{numberText(item.remaining_quantity)}</td><td>{moneyText(item.unit_cost)}</td><td>{moneyText(item.line_total)}</td></tr>)}
                </tbody></table></div>
                <div className="po-actions no-print" style={{marginTop:14}}>
                  {selectedOrder.status==='draft'&&<button className="btn primary" type="button" onClick={()=>void submitSelected()} disabled={busy}><Send size={15}/> اعتماد أمر الشراء للتوريد</button>}
                  {['submitted','partially_received'].includes(selectedOrder.status)&&<button className="btn primary" type="button" onClick={()=>void postReceipt()} disabled={busy}><PackageCheck size={15}/> ترحيل إيصال الاستلام</button>}
                  {['draft','submitted'].includes(selectedOrder.status)&&<button className="btn outline" type="button" onClick={()=>void cancelSelected()} disabled={busy}><Trash2 size={15}/> إلغاء أمر الشراء</button>}
                  <button className="btn outline" type="button" onClick={()=>window.print()} disabled={busy}><Printer size={15}/> طباعة الأمر</button>
                </div>
                {['submitted','partially_received'].includes(selectedOrder.status)&&<div style={{marginTop:16}}>
                  <h3>استلام فعلي (يمكن الاستلام على دفعات)</h3>
                  <p className="po-muted">أدخل الكمية المستلمة الآن لكل بند؛ الحقل الفارغ لا يُستلم. الخادم يعيد التحقق من الكميات المتبقية ويقفل رصيد المخزون داخل معاملة واحدة.</p>
                  <div className="po-table-wrap"><table><thead><tr><th>الصنف</th><th>المتبقي</th><th>كمية هذه الدفعة</th></tr></thead><tbody>
                    {selectedOrder.items.filter((item)=>item.remaining_quantity>0).map((item)=><tr key={item.id}><td>{item.product_name} <small>{item.item_code}</small></td><td>{numberText(item.remaining_quantity)}</td><td><input aria-label={'كمية الاستلام '+item.product_name} type="number" min="0.001" max={item.remaining_quantity} step="0.001" value={receiveDrafts[item.id]??''} onChange={(e)=>setReceiveDrafts((old)=>({...old,[item.id]:e.target.value}))} disabled={busy}/></td></tr>)}
                  </tbody></table></div>
                  <label className="po-field" style={{marginTop:10}}>ملاحظات إيصال الاستلام<textarea value={receiptNotes} onChange={(e)=>setReceiptNotes(e.target.value)} maxLength={2000} disabled={busy}/></label>
                </div>}
                {selectedOrder.status==='cancelled'&&<p className="po-error">أُلغي هذا الأمر. السبب المسجل: {selectedOrder.cancellation_reason||'غير مسجل'}</p>}
                {selectedOrder.status==='received'&&<p className="po-notice"><CheckCircle2 size={15} style={{verticalAlign:'middle',marginInlineEnd:5}}/>تم استلام الكميات المطلوبة كاملة؛ مهمة أمين المخزن مرتبطة بالحدث ومغلقة خادميًا.</p>}
                {selectedOrder.status==='draft'&&<p className="po-muted">المسودة لا تؤثر على المخزون. الإرسال ينشئ مهمة استلام واحدة؛ لا يتغير الرصيد إلا بعد إيصال فعلي.</p>}
              </section>
            }
          </div>
        </div>}
    </div>
  </section>;
}
