import { Link } from '@tanstack/react-router';
import { ArrowRight, FileText, Package, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/lib/auth';
import { formatDate, formatNumber } from '@/lib/format';
import type { Order, OrderItem } from '@/lib/types';

type CustomerOrderSummary = Pick<Order, 'id' | 'order_number' | 'status' | 'total_items' | 'created_at'> & {
  quantity_review_required?: boolean;
  customer_adjustment_note?: string | null;
  customer_payment_requested_at?: string | null;
  payment_request_status?: string;
};
type CustomerOrderDocument = Pick<Order, 'id' | 'order_number' | 'customer_id' | 'status' | 'total_items' | 'notes' | 'created_at' | 'delivery_address_snapshot'> & {
  quantity_review_required?: boolean;
  customer_adjustment_note?: string | null;
  customer_payment_requested_at?: string | null;
  customer_confirmed_at?: string | null;
  payment_request_status?: string;
};
type CustomerOrderLine = Pick<OrderItem, 'id' | 'item_code' | 'product_name_snapshot' | 'unit_snapshot' | 'quantity'> & {
  requested_quantity?: number;
  approved_quantity?: number;
};
import { Login } from '@/components/Login';

export const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة', pending: 'بانتظار المراجعة', confirmed: 'مؤكد', processing: 'قيد التجهيز',
  shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي',
  needs_customer_amendment: 'بانتظار تعديل العميل', returned_for_adjustment: 'أُعيد للتعديل', awaiting_customer_payment: 'بانتظار إبلاغ السداد',
};

const wrap: React.CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: '32px 20px 60px' };
const card: React.CSSProperties = { background: 'var(--card, #fff)', border: '1px solid #e0ecee', borderRadius: 16, padding: 20 };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="storefront" dir="rtl" style={{ minHeight: '100vh' }}>
      <header className="sf-header"><div className="sf-header-inner">
        <Link to="/" className="sf-brand" style={{ textDecoration: 'none' }}><div className="sf-brand-icon"><Package size={22} /></div><div><strong>الأغبري</strong><span>حسابي التجاري</span></div></Link>
        <Link to="/" className="sf-admin-btn" style={{ textDecoration: 'none' }}><ArrowRight size={16} /> العودة للمتجر</Link>
      </div></header>
      <main style={wrap}>{children}</main>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Shell><p role="status">جارٍ التحميل...</p></Shell>;
  if (!user) return <Login />;
  return <>{children}</>;
}

export function MyOrders() {
  return <Gate><MyOrdersInner /></Gate>;
}

function MyOrdersInner() {
  const { data, loading, error, refetch } = useFetch(async () => {
    const { data, error } = await supabase.from('orders').select('id,order_number,status,total_items,created_at,quantity_review_required,customer_adjustment_note,customer_payment_requested_at,payment_request_status').order('created_at', { ascending: false });
    if (error) throw new Error('تعذر تحميل الطلبات');
    return data as CustomerOrderSummary[];
  });
  return (
    <Shell>
      <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>طلباتي</h1>
      <p style={{ color: '#7a9398', margin: '0 0 20px' }}>كل الطلبات المرسلة من حسابك وحالتها الحالية</p>
      {loading && <p role="status">جارٍ تحميل الطلبات...</p>}
      {error && <div style={card} role="alert">{error} <button className="sf-link" onClick={refetch}>إعادة المحاولة</button></div>}
      {data && data.length === 0 && <div style={{ ...card, textAlign: 'center' }}><FileText size={32} /><p>لا توجد طلبات بعد.</p><Link to="/" className="sf-btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', padding: '10px 18px' }}>ابدأ التسوق</Link></div>}
      {data && data.length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f4f8f9', textAlign: 'right' }}><th style={{ padding: 12 }}>رقم الطلب</th><th>التاريخ</th><th>الأصناف</th><th>الحالة</th><th /></tr></thead>
            <tbody>{data.map((o) => (
              <tr key={o.id} style={{ borderTop: '1px solid #edf2f3' }}>
                <td style={{ padding: 12, fontWeight: 700 }}>{o.order_number}</td>
                <td>{formatDate(o.created_at)}</td>
                <td>{formatNumber(o.total_items)}</td>
                <td><span className="sf-detail-category">{STATUS_LABELS[o.status] ?? o.status}</span>{o.quantity_review_required && <strong style={{ display: 'block', color: '#9a5b13', marginTop: 5 }}>تنبيه: الطلب بانتظار اعتماد التعديلات.</strong>}{o.customer_payment_requested_at && o.payment_request_status === 'requested' && <small style={{ display: 'block', color: '#17684d', marginTop: 5 }}>يرجى متابعة تعليمات السداد في تفاصيل الطلب.</small>}</td>
                <td><Link to="/orders/$id" params={{ id: o.id }} className="sf-link">التفاصيل</Link></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

export function OrderInvoice({ id }: { id: string }) {
  return <Gate><OrderInvoiceInner id={id} /></Gate>;
}

function OrderInvoiceInner({ id }: { id: string }) {
  const { user } = useAuth();
  const { data, loading, error } = useFetch(async () => {
    const [o, i, h] = await Promise.all([
      supabase.from('orders').select('id,order_number,customer_id,status,total_items,notes,created_at,quantity_review_required,customer_adjustment_note,customer_payment_requested_at,customer_confirmed_at,payment_request_status,delivery_address_snapshot').eq('id', id).maybeSingle(),
      supabase.from('order_items').select('id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity').eq('order_id', id),
      supabase.from('order_status_history').select('id,to_status,created_at,notes').eq('order_id', id).order('created_at'),
    ]);
    if (o.error || i.error || h.error) throw new Error('تعذر تحميل الطلب');
    if (!o.data) return { order: null, items: [] as CustomerOrderLine[], history: [] as { id: string; to_status: string; created_at: string; notes: string | null }[], customer: null as { customer_code: string; business_name: string; contact_name: string | null } | null };
    const customer = await supabase.from('customers').select('customer_code,business_name,contact_name').eq('id', o.data.customer_id).maybeSingle();
    if (customer.error) throw new Error('تعذر تحميل بيانات العميل');
    return {
      order: o.data as CustomerOrderDocument,
      items: (i.data ?? []) as CustomerOrderLine[],
      history: (h.data ?? []) as { id: string; to_status: string; created_at: string; notes: string | null }[],
      customer: customer.data as { customer_code: string; business_name: string; contact_name: string | null } | null,
    };
  }, [id]);

  if (loading) return <Shell><p role="status">جارٍ تحميل الطلب...</p></Shell>;
  if (error) return <Shell><div style={card} role="alert">{error}</div></Shell>;
  if (!data?.order) return <Shell><div style={card}>الطلب غير موجود أو لا تملك صلاحية عرضه. <Link to="/orders" className="sf-link">طلباتي</Link></div></Shell>;
  const { order, items, history, customer } = data;

  return (
    <Shell>
      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link to="/orders" className="sf-btn-secondary" style={{ textDecoration: 'none', padding: '10px 16px' }}>كل الطلبات</Link>
        <button className="sf-btn-primary" onClick={() => window.print()}><Printer size={16} /> طباعة / حفظ PDF</button>
      </div>
      <article style={card} className="print-area">
        <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderBottom: '2px solid #0b97a5', paddingBottom: 14 }}>
          <div><h1 style={{ margin: 0, color: '#0b7b89', fontSize: 24 }}>الأغبري</h1><small>شركة الأغبري للمواد الغذائية — صنعاء، اليمن</small></div>
          <div style={{ textAlign: 'left' }}><strong>تأكيد طلب</strong><div>{order.order_number}</div><small>{formatDate(order.created_at)}</small></div>
        </header>
        <p style={{ margin: '14px 0' }}>رقم العميل: <strong>{customer?.customer_code ?? '—'}</strong> — العميل: <strong>{customer?.business_name ?? customer?.contact_name ?? user?.name ?? '—'}</strong> — الحالة: <strong>{STATUS_LABELS[order.status] ?? order.status}</strong></p>

        {order.delivery_address_snapshot && <section style={{ marginTop: 16, padding: 14, border: '1px solid #dce9e9', borderRadius: 12 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>عنوان التوصيل المسجل مع الطلب</h2>
          <strong>{order.delivery_address_snapshot.label}</strong>
          <p style={{ margin: '7px 0 3px', fontWeight: 750 }}>{order.delivery_address_snapshot.recipient_name}</p>
          <p dir="auto" style={{ margin: '0 0 5px' }}>{order.delivery_address_snapshot.phone}</p>
          <p style={{ margin: '0 0 5px' }}>{order.delivery_address_snapshot.address_line1}{order.delivery_address_snapshot.address_line2 ? '، ' + order.delivery_address_snapshot.address_line2 : ''}</p>
          <p style={{ margin: '0 0 5px', color: '#536b70' }}>{[order.delivery_address_snapshot.city, order.delivery_address_snapshot.region, order.delivery_address_snapshot.postal_code].filter(Boolean).join('، ')} — {order.delivery_address_snapshot.country}</p>
          {order.delivery_address_snapshot.delivery_instructions && <p style={{ margin: '7px 0 0', color: '#536b70' }}>تعليمات التوصيل: {order.delivery_address_snapshot.delivery_instructions}</p>}
        </section>}

        <div style={{ margin: '16px 0', padding: 12, borderRadius: 10, background: '#f4f8f9', color: '#536b70' }}>
          تفاصيل الكميات المطلوبة للمتابعة. لا تُعرض الأسعار أو الإجماليات في مستند العميل.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f4f8f9', textAlign: 'right' }}><th style={{ padding: 8 }}>الصنف</th><th>الرمز</th><th>الوحدة</th><th>الكمية</th><th>حالة الكمية</th></tr></thead>
          <tbody>{items.map((it) => {
            const requested = Number(it.requested_quantity ?? it.quantity);
            const approved = Number(it.approved_quantity ?? it.quantity);
            const adjusted = it.approved_quantity != null && requested !== approved;
            return <tr key={it.id} style={{ borderTop: '1px solid #edf2f3' }}>
              <td style={{ padding: 8 }}>{it.product_name_snapshot}</td><td>{it.item_code}</td><td>{it.unit_snapshot}</td><td>{formatNumber(approved)}</td>
              <td>{adjusted ? <strong style={{ color: '#9a5b13' }}>عُدّلت من {formatNumber(requested)}</strong> : 'كما طُلب'}</td>
            </tr>;
          })}</tbody>
        </table>
        {order.quantity_review_required && <p role="alert" style={{ marginTop: 14, fontWeight: 800, color: '#9a5b13' }}>تنبيه: تم تعديل الأصناف/الكميات بحسب الكميات المتوفرة.</p>}
        {order.customer_adjustment_note && <p role="status" style={{ marginTop: 8, fontWeight: 700 }}>{order.customer_adjustment_note}</p>}
        {order.customer_payment_requested_at && order.payment_request_status === 'requested' && <p role="status" style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#edf9f2', color: '#17684d', fontWeight: 800 }}>تم تأكيد الطلب من جهة الإدارة. يرجى إرسال المبلغ وفق تعليمات الشركة؛ هذا ليس إشعارًا باستلام الدفع.</p>}
        {order.notes && <p style={{ marginTop: 14 }}>ملاحظات: {order.notes}</p>}
        <section style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 15 }}>متابعة الطلب</h3>
          <div aria-label="مسار حالة الطلب" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 6, margin: '14px 0' }}>
            {[
              ['pending','تم استلام الطلب'],
              ['confirmed','تمت المراجعة'],
              ['processing','قيد التجهيز'],
              ['shipped','تم الشحن'],
              ['delivered','تم التسليم'],
            ].map(([status,label], index, all) => {
              const current = all.findIndex((item) => item[0] === order.status);
              const complete = current >= index || order.status === 'delivered';
              return <div key={status} style={{ textAlign: 'center', color: complete ? '#087f8d' : '#9aabad', fontSize: 11 }}>
                <div aria-label={complete ? 'مكتمل' : 'لم يكتمل'} style={{ width: 25, height: 25, borderRadius: 999, margin: '0 auto 6px', display: 'grid', placeItems: 'center', background: complete ? '#dff5ed' : '#edf1f2', color: complete ? '#087f8d' : '#84979b', fontWeight: 900 }}>{complete ? '✓' : index + 1}</div>
                <span>{label}</span>
              </div>;
            })}
          </div>
          {history.length > 0 && <ol>{history.map((h) => <li key={h.id}>{STATUS_LABELS[h.to_status] ?? h.to_status} — {formatDate(h.created_at)}</li>)}</ol>}
        </section>
      </article>
    </Shell>
  );
}
