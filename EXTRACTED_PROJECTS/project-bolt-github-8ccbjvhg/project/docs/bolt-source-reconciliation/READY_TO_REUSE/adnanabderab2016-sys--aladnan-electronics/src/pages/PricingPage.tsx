import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { EmptyState, LoadingState, Badge } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import {
  Tag,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import type { PriceRule, Product, PricingFormula, PriceLevel, Customer } from '@/types';

const LEVEL_LABELS: Record<PriceLevel, string> = {
  base: 'السعر الأساسي',
  wholesale_wholesale: 'جملة الجملة',
  wholesale: 'جملة',
  retail: 'تجزئة',
  customer_specific: 'عميل محدد',
  campaign: 'حملة',
  quantity_tier: 'كمية',
  branch: 'فرع',
  variant: 'متغير',
  bundle: 'حزمة',
};

const FORMULA_LABELS: Record<PricingFormula, string> = {
  markup: 'نسبة إضافة',
  margin: 'هامش',
  fixed: 'سعر ثابت',
  amount: 'مبلغ إضافة/خصم',
};

function levelVariant(level: PriceLevel) {
  if (level === 'base') return 'info' as const;
  if (level === 'retail') return 'neutral' as const;
  if (level === 'wholesale' || level === 'wholesale_wholesale') return 'success' as const;
  if (level === 'campaign') return 'warning' as const;
  return 'info' as const;
}

/** Calculate selling price from a rule */
export function calculatePrice(basePrice: number, formula: PricingFormula, value: number): number {
  switch (formula) {
    case 'markup':
      return basePrice * (1 + value / 100);
    case 'margin':
      return basePrice / (1 - value / 100);
    case 'fixed':
      return value;
    case 'amount':
      return basePrice + value;
    default:
      return basePrice;
  }
}

export default function PricingPage() {
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PriceRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    product_id: '',
    level: 'base' as PriceLevel,
    formula: 'markup' as PricingFormula,
    value: '0',
    min_price: '',
    max_price: '',
    customer_id: '',
    min_qty: '',
    is_active: true,
    priority: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, prodRes, custRes] = await Promise.all([
      supabase.from('price_rules').select('*').order('priority', { ascending: false }),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('customers').select('*').order('name'),
    ]);
    setRules(rulesRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setCustomers(custRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rules.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const product = products.find((p) => p.id === r.product_id);
    return (product?.name ?? '').toLowerCase().includes(q) || LEVEL_LABELS[r.level].includes(q);
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ product_id: '', level: 'base', formula: 'markup', value: '0', min_price: '', max_price: '', customer_id: '', min_qty: '', is_active: true, priority: 0 });
    setError(null);
    setShowModal(true);
  };

  const openEdit = (r: PriceRule) => {
    setEditing(r);
    setForm({
      product_id: r.product_id ?? '',
      level: r.level,
      formula: r.formula,
      value: String(r.value),
      min_price: r.min_price ? String(r.min_price) : '',
      max_price: r.max_price ? String(r.max_price) : '',
      customer_id: r.customer_id ?? '',
      min_qty: r.min_qty ? String(r.min_qty) : '',
      is_active: r.is_active,
      priority: r.priority,
    });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      product_id: form.product_id || null,
      level: form.level,
      formula: form.formula,
      value: parseFloat(form.value) || 0,
      min_price: form.min_price ? parseFloat(form.min_price) : null,
      max_price: form.max_price ? parseFloat(form.max_price) : null,
      customer_id: form.customer_id || null,
      min_qty: form.min_qty ? parseFloat(form.min_qty) : null,
      is_active: form.is_active,
      priority: form.priority,
    };

    // Validate price guards
    if (payload.min_price !== null && payload.max_price !== null && payload.min_price > payload.max_price) {
      setError('الحد الأدنى للسعر لا يمكن أن يكون أعلى من الحد الأقصى');
      setSaving(false);
      return;
    }

    const result = editing
      ? await supabase.from('price_rules').update(payload).eq('id', editing.id)
      : await supabase.from('price_rules').insert(payload);

    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setShowModal(false);
    load();
  };

  const handleDelete = async (r: PriceRule) => {
    if (!confirm('حذف قاعدة التسعير؟ سيعود السعر المتأثر إلى السعر الأساسي.')) return;
    await supabase.from('price_rules').delete().eq('id', r.id);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بقاعدة التسعير..." className="input pr-10" />
        </div>
        <button onClick={openCreate} className="btn-primary shrink-0">
          <Plus className="w-4 h-4" />
          قاعدة تسعير جديدة
        </button>
      </div>

      {/* Info banner */}
      <div className="card p-4 bg-primary-50/50 dark:bg-primary-900/10 border-primary-200 dark:border-primary-800">
        <div className="flex items-start gap-3">
          <Tag className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-app">محرك تسعير واحد موحد</p>
            <p className="text-xs text-muted mt-0.5">جميع الأسعار تُحسب من قاعدة واحدة. عند حذف أو تعطيل قاعدة، يعود السعر المتأثر إلى السعر الأساسي تلقائياً.</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><LoadingState rows={6} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Tag className="w-8 h-8" />}
            title="لا توجد قواعد تسعير"
            description="ابدأ بإنشاء قواعد التسعير لمنتجاتك (أساس، جملة، تجزئة، حملات...)"
            action={<button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />إنشاء قاعدة</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app bg-app/50">
                  <th className="text-right font-medium text-muted px-4 py-3">المستوى</th>
                  <th className="text-right font-medium text-muted px-4 py-3 hidden md:table-cell">المنتج</th>
                  <th className="text-right font-medium text-muted px-4 py-3">الصيغة</th>
                  <th className="text-right font-medium text-muted px-4 py-3">القيمة</th>
                  <th className="text-right font-medium text-muted px-4 py-3 hidden sm:table-cell">الأولوية</th>
                  <th className="text-right font-medium text-muted px-4 py-3">الحالة</th>
                  <th className="text-center font-medium text-muted px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const product = products.find((p) => p.id === r.product_id);
                  return (
                    <tr key={r.id} className="border-b border-app last:border-0 hover:bg-app/30 transition-colors">
                      <td className="px-4 py-3"><Badge variant={levelVariant(r.level)}>{LEVEL_LABELS[r.level]}</Badge></td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted">{product?.name ?? '— عام —'}</td>
                      <td className="px-4 py-3 text-app">{FORMULA_LABELS[r.formula]}</td>
                      <td className="px-4 py-3 font-medium text-app">
                        {r.formula === 'fixed' ? formatCurrency(r.value) : r.formula === 'amount' ? formatCurrency(r.value) : `${r.value}%`}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted">{r.priority}</td>
                      <td className="px-4 py-3">{r.is_active ? <Badge variant="success">نشطة</Badge> : <Badge variant="neutral">معطلة</Badge>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(r)} className="btn-ghost p-2" aria-label="تعديل"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(r)} className="btn-ghost p-2 hover:text-error-600" aria-label="حذف"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-app sticky top-0 bg-surface z-10">
              <h3 className="font-semibold text-app">{editing ? 'تعديل القاعدة' : 'قاعدة تسعير جديدة'}</h3>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-2" aria-label="إغلاق"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="label" htmlFor="product">المنتج (اتركه فارغاً لتطبيق القاعدة على الجميع)</label>
                <select id="product" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className="input">
                  <option value="">— عام (جميع المنتجات) —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="level">مستوى السعر</label>
                  <select id="level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as PriceLevel })} className="input">
                    {Object.entries(LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="formula">الصيغة</label>
                  <select id="formula" value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value as PricingFormula })} className="input">
                    {Object.entries(FORMULA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="value">القيمة {form.formula === 'markup' || form.formula === 'margin' ? '(%)' : '(ريال)'}</label>
                <input id="value" type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="input" />
              </div>
              {form.level === 'customer_specific' && (
                <div>
                  <label className="label" htmlFor="customer">العميل</label>
                  <select id="customer" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className="input">
                    <option value="">— اختر —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="min">الحد الأدنى للسعر</label>
                  <input id="min" type="number" step="0.01" value={form.min_price} onChange={(e) => setForm({ ...form, min_price: e.target.value })} className="input" placeholder="0.00" />
                </div>
                <div>
                  <label className="label" htmlFor="max">الحد الأقصى للسعر</label>
                  <input id="max" type="number" step="0.01" value={form.max_price} onChange={(e) => setForm({ ...form, max_price: e.target.value })} className="input" placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="qty">الحد الأدنى للكمية</label>
                  <input id="qty" type="number" step="0.01" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: e.target.value })} className="input" placeholder="1" />
                </div>
                <div>
                  <label className="label" htmlFor="priority">الأولوية</label>
                  <input id="priority" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} className="input" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 rounded accent-primary-600" />
                <span className="text-sm text-app">قاعدة نشطة</span>
              </label>
              {error && <div className="bg-error-50 dark:bg-error-900/20 text-error-700 dark:text-error-300 text-sm rounded-xl px-4 py-3">{error}</div>}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'حفظ التعديلات' : 'إضافة القاعدة'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
