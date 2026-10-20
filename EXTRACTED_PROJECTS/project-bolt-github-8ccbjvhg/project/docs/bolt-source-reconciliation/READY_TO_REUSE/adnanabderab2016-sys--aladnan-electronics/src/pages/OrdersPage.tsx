import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { EmptyState, LoadingState, Badge } from '@/components/ui';
import { formatCurrency, formatDateTime, generateIdempotencyKey } from '@/lib/utils';
import {
  ShoppingCart,
  Plus,
  X,
  Loader2,
  Search,
  ArrowLeft,
  Check,
  Package,
  Truck,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { useRouter } from '@/context/RouterContext';
import type { Order, OrderItem, Customer, Product } from '@/types';

interface OrderWithCustomer extends Order {
  customers: { name: string; code: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مُرسلة',
  received: 'مستلمة',
  confirmed: 'مؤكدة',
  processing: 'قيد المعالجة',
  packed: 'مُعبأة',
  ready: 'جاهزة',
  delivered: 'مُسلمة',
  completed: 'مكتملة',
  returned: 'مُرجعة',
  cancelled: 'ملغاة',
  rejected: 'مرفوضة',
  payment_pending: 'بانتظار الدفع',
  awaiting_modification: 'بانتظار التعديل',
  partially_fulfilled: 'تلبية جزئية',
};

const STATUS_FLOW: { key: string; label: string; icon: typeof Clock }[] = [
  { key: 'draft', label: 'مسودة', icon: Clock },
  { key: 'submitted', label: 'مُرسلة', icon: ArrowLeft },
  { key: 'received', label: 'مستلمة', icon: Package },
  { key: 'confirmed', label: 'مؤكدة', icon: Check },
  { key: 'processing', label: 'قيد المعالجة', icon: Package },
  { key: 'packed', label: 'مُعبأة', icon: Package },
  { key: 'ready', label: 'جاهزة', icon: Package },
  { key: 'delivered', label: 'مُسلمة', icon: Truck },
  { key: 'completed', label: 'مكتملة', icon: Check },
];

function statusVariant(status: string) {
  if (['completed', 'delivered', 'ready'].includes(status)) return 'success' as const;
  if (['cancelled', 'rejected', 'returned'].includes(status)) return 'error' as const;
  if (['draft', 'payment_pending', 'awaiting_modification'].includes(status)) return 'warning' as const;
  return 'info' as const;
}

export default function OrdersPage() {
  const { params, navigate } = useRouter();
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(params.id ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*, customers(name, code)')
      .order('created_at', { ascending: false });
    setOrders((data ?? []) as OrderWithCustomer[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (params.id) setDetailId(params.id);
  }, [params.id]);

  const filtered = orders.filter((o) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      o.order_number.toLowerCase().includes(q) ||
      (o.customers?.name ?? '').toLowerCase().includes(q)
    );
  });

  if (detailId) {
    return (
      <OrderDetail
        orderId={detailId}
        onBack={() => {
          setDetailId(null);
          navigate('orders');
        }}
        onChanged={load}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب أو العميل..."
            className="input pr-10"
          />
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0">
          <Plus className="w-4 h-4" />
          طلب جديد
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><LoadingState rows={6} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="w-8 h-8" />}
            title="لا توجد طلبات"
            description="ابدأ بإنشاء طلب جديد لعملائك"
            action={
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                <Plus className="w-4 h-4" />
                إنشاء طلب
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app bg-app/50">
                  <th className="text-right font-medium text-muted px-4 py-3">رقم الطلب</th>
                  <th className="text-right font-medium text-muted px-4 py-3 hidden sm:table-cell">العميل</th>
                  <th className="text-right font-medium text-muted px-4 py-3">الحالة</th>
                  <th className="text-right font-medium text-muted px-4 py-3">الإجمالي</th>
                  <th className="text-right font-medium text-muted px-4 py-3 hidden md:table-cell">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setDetailId(o.id)}
                    className="border-b border-app last:border-0 hover:bg-app/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-app">{o.order_number}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted">{o.customers?.name ?? '—'}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(o.status)}>{STATUS_LABELS[o.status] ?? o.status}</Badge></td>
                    <td className="px-4 py-3 font-semibold text-app">{formatCurrency(o.total)}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted text-xs">{formatDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setDetailId(id);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<{ product_id: string; quantity: number; unit_price: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ]).then(([c, p]) => {
      setCustomers(c.data ?? []);
      setProducts(p.data ?? []);
    });
  }, []);

  const addItem = () => {
    setItems([...items, { product_id: '', quantity: 1, unit_price: 0 }]);
  };

  const updateItem = (index: number, field: 'product_id' | 'quantity' | 'unit_price', value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  const handleCreate = async () => {
    if (!customerId) {
      setError('اختر العميل');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.product_id)) {
      setError('أضف منتجاً واحداً على الأقل');
      return;
    }
    setSaving(true);
    setError(null);

    const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
    const idempotencyKey = generateIdempotencyKey();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        status: 'draft',
        total,
        idempotency_key: idempotencyKey,
      })
      .select()
      .single();

    if (orderErr || !order) {
      setError(orderErr?.message ?? 'فشل إنشاء الطلب');
      setSaving(false);
      return;
    }

    const orderItems = items.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.quantity * i.unit_price,
      price_snapshot: { unit_price: i.unit_price, quantity: i.quantity },
      is_dirty: false,
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(orderItems);

    // Log status history
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      from_status: null,
      to_status: 'draft',
      actor: 'system',
    });

    setSaving(false);
    if (itemsErr) {
      setError(itemsErr.message);
      return;
    }
    onCreated(order.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-app sticky top-0 bg-surface z-10">
          <h3 className="font-semibold text-app">طلب جديد</h3>
          <button onClick={onClose} className="btn-ghost p-2" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label" htmlFor="customer">العميل *</label>
            <select
              id="customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="input"
            >
              <option value="">— اختر العميل —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">المنتجات</label>
              <button onClick={addItem} className="btn-ghost text-primary-600 text-sm">
                <Plus className="w-4 h-4" /> إضافة صنف
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select
                    value={item.product_id}
                    onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                    className="input flex-1"
                  >
                    <option value="">— اختر —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="input w-20"
                    placeholder="الكمية"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="input w-28"
                    placeholder="السعر"
                  />
                  <button onClick={() => removeItem(idx)} className="btn-ghost p-2.5 text-error-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-muted text-sm text-center py-4">لا توجد أصناف — اضغط "إضافة صنف"</p>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex justify-between items-center pt-3 border-t border-app">
              <span className="text-muted">الإجمالي</span>
              <span className="text-xl font-bold text-app">{formatCurrency(total)}</span>
            </div>
          )}

          {error && (
            <div className="bg-error-50 dark:bg-error-900/20 text-error-700 dark:text-error-300 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={handleCreate} disabled={saving} className="btn-primary flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء الطلب'}
            </button>
            <button onClick={onClose} className="btn-secondary">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderDetail({ orderId, onBack, onChanged }: { orderId: string; onBack: () => void; onChanged: () => void }) {
  const [order, setOrder] = useState<OrderWithCustomer | null>(null);
  const [items, setItems] = useState<(OrderItem & { products: { name: string; sku: string } | null })[]>([]);
  const [history, setHistory] = useState<{ id: string; from_status: string | null; to_status: string; actor: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const [orderRes, itemsRes, histRes] = await Promise.all([
      supabase.from('orders').select('*, customers(name, code)').eq('id', orderId).maybeSingle(),
      supabase.from('order_items').select('*, products(name, sku)').eq('order_id', orderId),
      supabase.from('order_status_history').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
    ]);
    setOrder(orderRes.data as OrderWithCustomer);
    setItems((itemsRes.data ?? []) as (OrderItem & { products: { name: string; sku: string } | null })[]);
    setHistory(histRes.data ?? []);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const advanceStatus = async () => {
    if (!order) return;
    const currentIdx = STATUS_FLOW.findIndex((s) => s.key === order.status);
    if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) return;
    const nextStatus = STATUS_FLOW[currentIdx + 1].key;

    setAdvancing(true);
    const { error: err } = await supabase.rpc('advance_order_status', {
      p_order_id: orderId,
      p_to_status: nextStatus,
      p_reason: null,
    });

    if (err) {
      setError(err.message);
    }
    setAdvancing(false);
    load();
    onChanged();
  };

  const adjustItemQty = async (itemId: string, newQty: number) => {
    setAdvancing(true);
    const { error: err } = await supabase.rpc('adjust_order_item_qty', {
      p_item_id: itemId,
      p_new_qty: newQty,
    });
    if (err) {
      setError(err.message);
    }
    setAdvancing(false);
    load();
    onChanged();
  };

  const returnForEdit = async () => {
    if (!order) return;
    setAdvancing(true);
    const { error: err } = await supabase.rpc('return_order_for_edit', {
      p_order_id: orderId,
      p_reason: 'مراجعة الكميات',
    });
    if (err) {
      setError(err.message);
    }
    setAdvancing(false);
    load();
    onChanged();
  };

  if (loading || !order) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.findIndex((s) => s.key === order.status);
  const canAdvance = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1;
  const nextStatus = canAdvance ? STATUS_FLOW[currentIdx + 1] : null;

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={onBack} className="btn-ghost text-muted">
        <ArrowLeft className="w-4 h-4" />
        العودة للطلبات
      </button>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-app">{order.order_number}</h2>
              <Badge variant={statusVariant(order.status)}>{STATUS_LABELS[order.status] ?? order.status}</Badge>
            </div>
            <p className="text-muted text-sm">
              {order.customers?.name} ({order.customers?.code}) — {formatDateTime(order.created_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted text-sm">الإجمالي</p>
            <p className="text-2xl font-bold text-app">{formatCurrency(order.total)}</p>
          </div>
        </div>

        {/* Status flow */}
        {order.status !== 'cancelled' && order.status !== 'rejected' && (
          <div className="mt-5">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-2">
              {STATUS_FLOW.map((step, idx) => {
                const Icon = step.icon;
                const done = idx <= currentIdx;
                return (
                  <div key={step.key} className="flex items-center gap-1 shrink-0">
                    <div className={`flex flex-col items-center gap-1 ${done ? 'text-primary-600' : 'text-muted'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${done ? 'bg-primary-100 dark:bg-primary-900/40' : 'bg-app'}`}>
                        {idx < currentIdx ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <span className="text-[10px] font-medium whitespace-nowrap">{step.label}</span>
                    </div>
                    {idx < STATUS_FLOW.length - 1 && (
                      <div className={`w-6 h-0.5 ${idx < currentIdx ? 'bg-primary-300' : 'bg-border'}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {canAdvance && (
                <button onClick={advanceStatus} disabled={advancing} className="btn-primary">
                  {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeft className="w-4 h-4" />}
                  {nextStatus ? `تقديم إلى: ${nextStatus.label}` : 'تقديم الحالة'}
                </button>
              )}
              {order.status !== 'awaiting_modification' && order.status !== 'completed' && (
                <button onClick={returnForEdit} disabled={advancing} className="btn-secondary">
                  <RotateCcw className="w-4 h-4" />
                  إرجاع للعميل للتعديل
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-app">
          <h3 className="font-semibold text-app">أصناف الطلب</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app bg-app/50">
                <th className="text-right font-medium text-muted px-4 py-3">المنتج</th>
                <th className="text-right font-medium text-muted px-4 py-3">الكمية</th>
                <th className="text-right font-medium text-muted px-4 py-3 hidden sm:table-cell">سعر الوحدة</th>
                <th className="text-right font-medium text-muted px-4 py-3">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-app last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-app">{item.products?.name ?? '—'}</p>
                    <code className="text-xs text-muted">{item.products?.sku ?? ''}</code>
                    {item.is_dirty && <span className="badge-warning text-[10px] py-0.5 px-1.5 mr-1">عدّلت</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-app">{item.quantity}</span>
                      <input
                        type="number"
                        min={1}
                        value={editQty[item.id] ?? item.quantity}
                        onChange={(e) => setEditQty((prev) => ({ ...prev, [item.id]: parseInt(e.target.value) || 1 }))}
                        className="input w-16 text-sm py-1"
                      />
                      <button
                        onClick={() => adjustItemQty(item.id, editQty[item.id] ?? item.quantity)}
                        disabled={advancing}
                        className="btn-secondary px-2 py-1 text-xs"
                      >
                        تعديل
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-3 font-semibold text-app">{formatCurrency(item.total_price)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">لا توجد أصناف</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="bg-error-50 dark:bg-error-900/20 text-error-700 dark:text-error-300 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-app mb-4">سجل الحالات</h3>
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
                <span className="text-muted text-xs">{formatDateTime(h.created_at)}</span>
                <span className="text-app">
                  {h.from_status ? STATUS_LABELS[h.from_status] ?? h.from_status : '—'} ← {STATUS_LABELS[h.to_status] ?? h.to_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
