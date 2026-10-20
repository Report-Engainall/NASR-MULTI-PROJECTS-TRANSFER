import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, RefreshCw, Tag, X } from 'lucide-react';
import { fetchCategories, fetchProducts, fetchPromotions, savePromotion, togglePromotion } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import type { Category, ProductWithInventory, Promotion, PromotionDiscountType, PromotionInput } from '@/lib/types';

function emptyCampaign(): PromotionInput {
  return {
    id: null, title: '', description: '', discount_type: 'percentage', discount_value: 0,
    product_ids: [], category_ids: [], start_date: '', end_date: '', is_active: true,
  };
}
function dateLabel(value: string): string {
  return formatDateShort(value);
}
function discountLabel(promotion: Promotion): string {
  return promotion.discount_type === 'fixed'
    ? formatCurrency(promotion.discount_value) + ' (قيمة مسجلة)'
    : formatNumber(promotion.discount_value) + '% (قيمة مسجلة)';
}

export function PromotionManager({ onNotice }: { onNotice: (message: string) => void }) {
  const { data: promotions, loading, error, refetch } = useFetch(fetchPromotions);
  const { data: products, loading: productsLoading } = useFetch(fetchProducts);
  const { data: categories, loading: categoriesLoading } = useFetch(fetchCategories);
  const [form, setForm] = useState<PromotionInput>(emptyCampaign);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  function beginCreate() {
    setForm(emptyCampaign());
    setFormError('');
    setFormOpen(true);
  }
  function beginEdit(promotion: Promotion) {
    setForm({
      id: promotion.id, title: promotion.title, description: promotion.description ?? '',
      discount_type: promotion.discount_type === 'fixed' ? 'fixed' : 'percentage',
      discount_value: Number(promotion.discount_value),
      product_ids: [...(promotion.product_ids ?? [])], category_ids: [...(promotion.category_ids ?? [])],
      start_date: promotion.start_date.slice(0, 10), end_date: promotion.end_date.slice(0, 10),
      is_active: promotion.is_active,
    });
    setFormError('');
    setFormOpen(true);
  }
  function closeForm() {
    if (saving) return;
    setForm(emptyCampaign());
    setFormError('');
    setFormOpen(false);
  }
  function update<Key extends keyof PromotionInput>(key: Key, value: PromotionInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function updateSelectedIds(key: 'product_ids' | 'category_ids', selected: HTMLCollectionOf<HTMLOptionElement>) {
    update(key, Array.from(selected).filter((option) => option.selected).map((option) => option.value));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError('');
    try {
      await savePromotion({ ...form, title: form.title.trim(), description: form.description?.trim() || null, discount_value: Number(form.discount_value) });
      await refetch();
      setForm(emptyCampaign());
      setFormOpen(false);
      onNotice(form.id ? 'حُفظت تعديلات الحملة وسُجلت في التدقيق.' : 'أُنشئت الحملة وسُجلت في التدقيق.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر حفظ الحملة.';
      setFormError(message);
      onNotice(message);
    } finally {
      setSaving(false);
    }
  }

  async function changeActive(promotion: Promotion, isActive: boolean) {
    if (togglingId) return;
    setTogglingId(promotion.id);
    setFormError('');
    try {
      await togglePromotion(promotion.id, isActive);
      await refetch();
      onNotice(isActive ? 'فُعّلت الحملة.' : 'أُوقفت الحملة.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر تغيير حالة الحملة.';
      setFormError(message);
      onNotice(message);
    } finally {
      setTogglingId(null);
    }
  }

  const discountType = form.discount_type as PromotionDiscountType;
  return <section className="promotion-manager" dir="rtl">
    <header className="heading">
      <div className="heading-icon"><Tag size={24} /></div>
      <div>
        <span>التجارة والتسويق</span>
        <h1>إدارة الحملات والعروض</h1>
        <p>حفظ الحملات في قاعدة البيانات مع تحقق خادمي من المؤسسة والصلاحيات والتواريخ وتدقيق التغييرات.</p>
      </div>
    </header>
    <section className="panel">
      <div className="panel-head">
        <div><h2>الحملات المحفوظة</h2><p className="text-muted">المنشور للمتجر هو النشط فقط ضمن نطاق تواريخه، ولا يمكن للحسابات العامة قراءة سجل الإدارة.</p></div>
        <div className="toolbar-actions">
          <button type="button" className="btn outline" onClick={() => void refetch()} disabled={loading || saving || Boolean(togglingId)}><RefreshCw size={16} /> تحديث</button>
          <button type="button" className="btn primary" onClick={beginCreate} disabled={saving || Boolean(togglingId)}><Plus size={16} /> إضافة حملة</button>
        </div>
      </div>
      <p className="report-note">تنبيه دقة: تُحفظ قيمة الخصم كبيانات حملة، لكنها لا تُخصم تلقائيًا من إجمالي الطلب حتى يربط محرك تسعير الخادم بهذه الحملات. لن نعرض نسبة خصم للعميل على أنها مطبقة قبل ذلك.</p>
    </section>
    {formOpen && <form className="panel promotion-form" onSubmit={(event) => void submit(event)}>
      <div className="panel-head"><div><h2>{form.id ? 'تعديل حملة' : 'إنشاء حملة'}</h2><p className="text-muted">القيم تُراجع أيضًا في الخادم؛ لن تنجح الكتابة إذا كانت منتجات أو تصنيفات من مؤسسة أخرى.</p></div>
        <button className="btn outline" type="button" onClick={closeForm} disabled={saving} aria-label="إغلاق نموذج الحملة"><X size={16} /></button>
      </div>
      <div className="form-grid">
        <label>اسم الحملة<input aria-label="اسم الحملة" required maxLength={120} value={form.title} onChange={(event) => update('title', event.target.value)} /></label>
        <label>نوع قيمة الحملة<select aria-label="نوع قيمة الحملة" value={form.discount_type} onChange={(event) => update('discount_type', event.target.value as PromotionDiscountType)}><option value="percentage">نسبة مئوية</option><option value="fixed">قيمة ثابتة</option></select></label>
        <label>قيمة الحملة<input aria-label="قيمة الحملة" required type="number" min="0.01" max={discountType === 'percentage' ? 100 : 99999999.99} step="0.01" value={form.discount_value || ''} onChange={(event) => update('discount_value', event.target.value === '' ? 0 : Number(event.target.value))} /></label>
        <label>بداية النشر<input aria-label="بداية النشر" required type="date" value={form.start_date} onChange={(event) => update('start_date', event.target.value)} /></label>
        <label>نهاية النشر<input aria-label="نهاية النشر" required type="date" min={form.start_date || undefined} value={form.end_date} onChange={(event) => update('end_date', event.target.value)} /></label>
        <label>وصف الحملة<textarea aria-label="وصف الحملة" rows={3} maxLength={600} value={form.description ?? ''} onChange={(event) => update('description', event.target.value)} /></label>
        <label>الأصناف المشمولة<select aria-label="الأصناف المشمولة" multiple size={5} value={form.product_ids} disabled={productsLoading} onChange={(event) => updateSelectedIds('product_ids', event.currentTarget.options)}>{(products ?? []).filter((product: ProductWithInventory) => product.is_active).map((product) => <option key={product.id} value={product.id}>{product.name} — {product.item_code}</option>)}</select><small>اتركه فارغًا إذا كانت الحملة غير مقصورة على أصناف محددة.</small></label>
        <label>التصنيفات المشمولة<select aria-label="التصنيفات المشمولة" multiple size={5} value={form.category_ids} disabled={categoriesLoading} onChange={(event) => updateSelectedIds('category_ids', event.currentTarget.options)}>{(categories ?? []).filter((category: Category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><small>اتركه فارغًا إذا كانت الحملة غير مقصورة على تصنيفات محددة.</small></label>
        <label className="promotion-active-toggle"><input type="checkbox" checked={form.is_active} onChange={(event) => update('is_active', event.target.checked)} /> نشطة (تظهر للمتجر إذا دخلت فترة النشر)</label>
      </div>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <div className="modal-actions">
        <button className="btn primary" type="submit" disabled={saving || !form.title.trim() || !form.start_date || !form.end_date}>{saving ? 'جارٍ الحفظ…' : form.id ? 'حفظ التعديلات' : 'حفظ الحملة'}</button>
        <button className="btn outline" type="button" onClick={closeForm} disabled={saving}>إلغاء</button>
      </div>
    </form>}
    {formError && !formOpen && <div className="form-error" role="alert">{formError}</div>}
    {loading ? <section className="panel" role="status">جار تحميل الحملات...</section>
      : error ? <div className="form-error" role="alert">{error instanceof Error ? error.message : 'تعذر قراءة الحملات.'}</div>
      : !promotions?.length ? <section className="panel"><h2>لا توجد حملات محفوظة</h2><p className="text-muted">أنشئ حملة حقيقية عند الحاجة؛ لن تُولَّد عروض تجريبية تلقائيًا.</p></section>
      : <div className="offer-grid">{promotions.map((promotion: Promotion) => <article className="offer-card" key={promotion.id}>
          <div className="offer-top"><span className="discount">{discountLabel(promotion)}</span>
            <label className="switch"><input aria-label={promotion.is_active ? 'إيقاف الحملة: ' + promotion.title : 'تفعيل الحملة: ' + promotion.title} type="checkbox" checked={promotion.is_active} disabled={togglingId === promotion.id || saving} onChange={(event) => void changeActive(promotion, event.target.checked)} /><span /></label>
          </div>
          <h2>{promotion.title}</h2><p>{promotion.description || 'لا يوجد وصف محفوظ.'}</p>
          <div className="offer-date"><span>من {dateLabel(promotion.start_date)}</span><span>إلى {dateLabel(promotion.end_date)}</span></div>
          <p className="text-muted">النطاق: {(promotion.product_ids?.length ?? 0) ? (promotion.product_ids?.length + ' صنف') : 'جميع الأصناف'}؛ {(promotion.category_ids?.length ?? 0) ? (promotion.category_ids?.length + ' تصنيف') : 'جميع التصنيفات'}</p>
          <button className="btn outline" type="button" onClick={() => beginEdit(promotion)} disabled={saving || Boolean(togglingId)}><Pencil size={15} /> تعديل الحملة</button>
        </article>)}</div>}
  </section>;
}
