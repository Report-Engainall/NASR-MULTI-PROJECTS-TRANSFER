import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CreditCard, Printer, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { Button, Empty, ErrorBox, Loading, Modal, TableWrap } from '@/components/AdminPages';
import { fetchOrders, fetchStaffCustomer360Summary } from '@/lib/api';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import type { Customer } from '@/lib/types';
import { getCurrentTenantScope, supabase } from '@/lib/supabase';
import { projectCustomer360, type Customer360Projection } from '@/lib/customer-360';
import type { StaffCustomer360Summary } from '@/lib/customer-360-summary';

function customer360Money(value: number | null, currency = 'YER'): string {
  if (value === null || !Number.isFinite(value)) return 'غير متاح';
  return new Intl.NumberFormat('ar-YE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + currency;
}

const invoiceStatusLabel: Record<string, string> = {
  issued: 'صادرة',
  partially_paid: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
  void: 'ملغاة',
};

export function AdminCustomer360({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [projection, setProjection] = useState<Customer360Projection | null>(null);
  const [summary, setSummary] = useState<StaffCustomer360Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCustomer360 = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const scope = await getCurrentTenantScope();
      const { data: scopedCustomer, error: scopedCustomerError } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', scope.organizationId)
        .eq('id', customer.id)
        .maybeSingle();
      if (scopedCustomerError) throw scopedCustomerError;
      if (!scopedCustomer || scopedCustomer.id !== customer.id) {
        throw new Error('العميل غير موجود في المؤسسة الحالية؛ تم إيقاف عرض ملفه.');
      }
      const [orders, financeResult, customerSummary] = await Promise.all([
        fetchOrders(),
        supabase.rpc('fetch_staff_finance_data'),
        fetchStaffCustomer360Summary(customer.id),
      ]);
      if (financeResult.error) throw financeResult.error;
      setProjection(projectCustomer360(orders, financeResult.data, customer.id));
      setSummary(customerSummary);
    } catch (cause) {
      setProjection(null);
      setSummary(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل ملف العميل.');
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => { void loadCustomer360(); }, [loadCustomer360]);

  async function reload() {
    await loadCustomer360();
  }

  const m = projection?.metrics;
  return <Modal title={'ملف العميل 360 — ' + customer.business_name} onClose={onClose}>
    <div style={{ display: 'grid', gap: 14, maxHeight: '75vh', overflowY: 'auto', padding: 2 }}>
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div><h2 style={{ margin: 0 }}>{customer.business_name}</h2><p>{customer.customer_code} · {customer.contact_name || 'جهة الاتصال غير محددة'}</p><p>{customer.phone || 'لا يوجد هاتف'} · {customer.email || 'لا يوجد بريد'}</p></div>
          <div className="no-print" style={{ display: 'flex', gap: 6 }}><Button variant="secondary" onClick={() => void reload()} disabled={loading}><RefreshCw size={15} /> تحديث</Button><Button variant="outline" onClick={() => window.print()}><Printer size={15} /> طباعة</Button></div>
        </div>
        <p className="report-note">الرصيد والحد الائتماني أدناه هما القيم المسجلة في بطاقة العميل. إجماليات الطلبات والفوترة والتحصيل أدناه مجاميع خادمية كاملة؛ الجداول التفصيلية تعرض أحدث الحركات فقط، ولا تُنشأ فواتير أو دفعات تاريخية افتراضية.</p>
      </section>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : projection && <>
        <section className="report-grid">
          <article className="report-metric"><ShoppingBag size={20} /><span>الطلبات المحمّلة</span><strong>{formatNumber(m?.order_count ?? 0)}</strong></article>
          <article className="report-metric"><CalendarClock size={20} /><span>طلبات قيد المعالجة</span><strong>{formatNumber(m?.pending_order_count ?? 0)}</strong></article>
          <article className="report-metric"><Wallet size={20} /><span>الرصيد المسجل بالبطاقة</span><strong>{formatCurrency(Number(customer.current_balance ?? 0))}</strong></article>
          <article className="report-metric"><CreditCard size={20} /><span>الحد الائتماني المسجل</span><strong>{formatCurrency(Number(customer.credit_limit ?? 0))}</strong></article>
        </section>
        {(projection.potentially_partial.invoices || projection.potentially_partial.payments) && <div className="form-error" role="status"><AlertTriangle size={16} /> قوائم تفاصيل الفواتير والدفعات على مستوى المؤسسة محدودة (حتى 500 فاتورة و1000 دفعة)، لذلك لا تشمل الجداول كل الحركات القديمة. إجماليات المبالغ والمتأخرات حسب العملة في الملخص التالي محسوبة خادميًا من دفتر العميل الكامل.</div>}
        <section className="panel">
          <h3>ملخص الحركات المعروضة</h3>
          <p>قيمة الطلبات غير الملغاة ضمن النتائج: <strong>{m?.non_cancelled_order_value === null ? 'غير متاحة بسبب مبلغ غير صالح أو تجاوز دقة الحساب' : formatCurrency(m?.non_cancelled_order_value ?? 0)}</strong></p>
          <p>طلبات منفذة: {formatNumber(m?.fulfilled_order_count ?? 0)} · ملغاة: {formatNumber(m?.cancelled_order_count ?? 0)} · فواتير متأخرة ضمن القائمة المحمّلة: {formatNumber(m?.overdue_invoice_count_loaded ?? 0)}</p>
          {(m?.invalid_order_amount_count ?? 0) > 0 && <p className="form-error">بعض مبالغ الطلبات غير صالحة؛ تم تعطيل جمع إجمالي قيمة الطلبات بدل اعتبار القيم غير المعروفة أصفارًا.</p>}
        </section>
        {summary && <section className="panel">
        <h3>التحليل الكامل لملف العميل</h3>
        <p className="report-note">المؤشرات أدناه محسوبة في قاعدة البيانات من سجل المؤسسة كاملًا. تفاصيل الجداول الأخرى محدودة بآخر 20 حركة؛ القيم غير الصالحة تبقى «غير متاحة».</p>
        <div className="report-grid">
          <article className="report-metric"><ShoppingBag size={20} /><span>إجمالي الطلبات</span><strong>{formatNumber(summary.order_summary.order_count)}</strong><small>من سجل العميل الكامل</small></article>
          <article className="report-metric"><Wallet size={20} /><span>قيمة الطلبات غير الملغاة</span><strong>{summary.order_summary.non_cancelled_order_value === null ? 'غير متاح' : formatCurrency(summary.order_summary.non_cancelled_order_value)}</strong><small>المبالغ غير الصالحة: {formatNumber(summary.order_summary.invalid_order_amount_count)}</small></article>
          <article className="report-metric"><CalendarClock size={20} /><span>متوسط قيمة الطلب</span><strong>{summary.order_summary.average_order_value === null ? 'غير متاح' : formatCurrency(summary.order_summary.average_order_value)}</strong><small>بحسب الطلبات غير الملغاة</small></article>
          <article className="report-metric"><ShoppingBag size={20} /><span>آخر طلب</span><strong>{summary.order_summary.last_order_at ? formatDateShort(summary.order_summary.last_order_at) : 'لا يوجد'}</strong><small>{summary.order_summary.days_since_last_order === null ? 'الفترة غير متاحة' : 'منذ ' + formatNumber(summary.order_summary.days_since_last_order) + ' يومًا'}</small></article>
          <article className="report-metric"><CalendarClock size={20} /><span>متوسط المدة بين الطلبات</span><strong>{summary.order_summary.average_days_between_orders === null ? 'غير متاح' : formatNumber(summary.order_summary.average_days_between_orders) + ' يوم'}</strong><small>يحسب من تواريخ الطلبات المسجلة</small></article>
          <article className="report-metric"><CreditCard size={20} /><span>طلبات معلقة / منفذة</span><strong>{formatNumber(summary.order_summary.pending_order_count)} / {formatNumber(summary.order_summary.fulfilled_order_count)}</strong><small>الملغاة أو المرفوضة: {formatNumber(summary.order_summary.cancelled_order_count)}</small></article>
        </div>

        <h3 style={{ marginTop: 18 }}>ملخص الفواتير والتحصيل الكامل حسب العملة</h3>
        {!summary.finance_by_currency.length ? <Empty text="لا توجد فواتير مسجلة لهذا العميل." /> : <TableWrap><table><thead><tr><th>العملة</th><th>الفواتير</th><th>إجمالي الفواتير</th><th>المسدّد</th><th>المتبقي</th><th>فواتير متأخرة</th><th>متأخرات</th></tr></thead><tbody>{summary.finance_by_currency.map((row) => <tr key={row.currency}>
          <td>{row.currency}</td><td>{formatNumber(row.invoice_count)}</td>
          <td>{customer360Money(row.invoiced_total, row.currency)}</td><td>{customer360Money(row.paid_total, row.currency)}</td>
          <td>{customer360Money(row.outstanding_total, row.currency)}</td><td>{formatNumber(row.overdue_invoice_count)}</td>
          <td>{customer360Money(row.overdue_outstanding, row.currency)}</td>
        </tr>)}</tbody></table></TableWrap>}

        <h3 style={{ marginTop: 18 }}>المنتجات الأكثر شراءً من العميل</h3>
        {!summary.top_products.length ? <Empty text="لا توجد بنود طلبات قابلة للترتيب لهذا العميل." /> : <TableWrap><table><thead><tr><th>الصنف</th><th>الكمية</th><th>قيمة البنود</th><th>آخر شراء</th></tr></thead><tbody>{summary.top_products.map((product) => <tr key={product.item_code + ':' + product.product_name}>
          <td><strong>{product.product_name}</strong><small style={{ display: 'block' }}>{product.item_code || 'دون رمز صنف'}</small></td>
          <td>{formatNumber(product.quantity)}</td><td>{customer360Money(product.sales, 'YER')}</td>
          <td>{product.last_purchased_at ? formatDateShort(product.last_purchased_at) : 'غير متاح'}</td>
        </tr>)}</tbody></table></TableWrap>}

        <h3 style={{ marginTop: 18 }}>إشارات المتابعة المبنية على السجل</h3>
        {!summary.recommendations.length ? <p className="report-note">لا توجد توصية ضمن قواعد التنبيه الحالية (متأخرات مسجلة، طلبات معلقة، أو انقطاع طلبات 30 يومًا). لا يعني ذلك غياب جميع المخاطر.</p> : <div style={{ display: 'grid', gap: 8 }}>
          {summary.recommendations.map((recommendation, index) => <article key={recommendation.type + ':' + index} style={{ border: '1px solid var(--border, #d7e1e0)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong>{recommendation.title}</strong><span className="badge">{recommendation.priority === 'high' ? 'أولوية عالية' : recommendation.priority === 'medium' ? 'أولوية متوسطة' : 'أولوية منخفضة'}</span>
            </div>
            <p>{recommendation.description}</p>
            {recommendation.currency && recommendation.overdue_outstanding !== undefined && <p><strong>المبلغ المتأخر: {customer360Money(recommendation.overdue_outstanding, recommendation.currency)}</strong> · فواتير: {formatNumber(recommendation.overdue_invoice_count ?? 0)}</p>}
            {recommendation.pending_order_count !== undefined && <p>الطلبات المعلقة: {formatNumber(recommendation.pending_order_count)}</p>}
            {recommendation.days_since_last_order !== undefined && <p>الأيام منذ آخر طلب: {formatNumber(recommendation.days_since_last_order)}</p>}
            <small>{recommendation.action}</small>
          </article>)}
        </div>}
        <p className="report-note" style={{ marginTop: 12 }}>آخر احتساب: {formatDateShort(summary.generated_at)}. هذه إشارات تشغيلية حتمية وليست توصيات مولدة بالذكاء الاصطناعي.</p>
      </section>}
      <section className="panel">
          <h3>آخر الطلبات ({formatNumber(m?.order_count ?? 0)} ضمن النتائج المحمّلة)</h3>
          {!projection.orders.length ? <Empty text="لا توجد طلبات لهذا العميل." /> : <TableWrap><table><thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>الحالة</th><th>الأصناف</th><th>الإجمالي</th></tr></thead><tbody>{projection.orders.map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{formatDateShort(order.created_at)}</td><td>{order.status}</td><td>{order.total_items === null ? '—' : formatNumber(order.total_items)}</td><td>{order.total_amount === null ? 'غير متاح' : formatCurrency(order.total_amount)}</td></tr>)}</tbody></table></TableWrap>}
        </section>
        <section className="panel">
          <h3>آخر الفواتير ({formatNumber(m?.invoice_count_loaded ?? 0)} فاتورة محمّلة)</h3>
          {!projection.invoices.length ? <Empty text="لا توجد فواتير مسجلة لهذا العميل في نتيجة RPC الحالية." /> : <TableWrap><table><thead><tr><th>الفاتورة</th><th>الإصدار</th><th>الاستحقاق</th><th>الحالة</th><th>الإجمالي</th><th>المسدّد من الدفعات المحمّلة</th><th>المتبقي المحسوب</th></tr></thead><tbody>{projection.invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoice_number}</td><td>{formatDateShort(invoice.issued_at)}</td><td>{invoice.due_at ? formatDateShort(invoice.due_at) : 'غير محدد'}</td><td>{invoiceStatusLabel[invoice.status] ?? invoice.status}</td><td>{customer360Money(invoice.total_amount, invoice.currency)}</td><td>{customer360Money(invoice.paid_amount, invoice.currency)}</td><td>{customer360Money(invoice.outstanding_amount, invoice.currency)}</td></tr>)}</tbody></table></TableWrap>}
        </section>
        <section className="panel">
          <h3>آخر الدفعات ({formatNumber(m?.payment_count_loaded ?? 0)} دفعة محمّلة)</h3>
          {!projection.payments.length ? <Empty text="لا توجد دفعات مسجلة لهذا العميل في نتيجة RPC الحالية." /> : <TableWrap><table><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>طريقة الدفع</th><th>المبلغ</th></tr></thead><tbody>{projection.payments.map((payment) => <tr key={payment.id}><td>{formatDateShort(payment.paid_at)}</td><td>{projection.invoices.find((invoice) => invoice.id === payment.invoice_id)?.invoice_number ?? payment.invoice_id.slice(0, 8)}</td><td>{payment.payment_method}</td><td>{customer360Money(payment.amount, projection.invoices.find((invoice) => invoice.id === payment.invoice_id)?.currency ?? 'YER')}</td></tr>)}</tbody></table></TableWrap>}
        </section>
      </>}
    </div>
  </Modal>;
}
