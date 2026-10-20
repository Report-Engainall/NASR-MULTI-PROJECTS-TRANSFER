import { Link } from "@tanstack/react-router";
import { ArrowLeft, BadgePercent, CalendarDays, Package, RefreshCw, Tag } from "lucide-react";
import { fetchProducts, fetchStorefrontPromotions } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useFetch } from "@/lib/useFetch";

export function StorefrontOffersPage() {
  const promotionsQuery = useFetch(fetchStorefrontPromotions);
  const productsQuery = useFetch(fetchProducts);
  const promotions = (promotionsQuery.data ?? []).filter((promotion) => promotion.is_active);
  const products = productsQuery.data ?? [];
  const loading = promotionsQuery.loading || productsQuery.loading;
  const error = promotionsQuery.error || productsQuery.error;

  return <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 20, maxWidth: 1180, margin: "0 auto" }}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
      <div>
        <Link to="/store" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#087f8d", textDecoration: "none" }}><ArrowLeft size={16}/> العودة للمتجر</Link>
        <h1 style={{ margin: "12px 0 4px" }}>العروض المنشورة</h1>
        <p style={{ margin: 0, color: "#526b70" }}>تعرض هذه الصفحة إعداد الحملات المنشورة من الخادم؛ لا تصنع خصومات أو أسعارًا بديلة عند تعذر بيانات الحملة.</p>
      </div>
      <button type="button" className="btn outline" disabled={loading} onClick={() => { void promotionsQuery.refetch(); void productsQuery.refetch(); }}><RefreshCw size={15}/> تحديث العروض</button>
    </header>
    {loading ? <div className="sf-empty" role="status">جار تحميل العروض المنشورة…</div>
      : error ? <div className="sf-empty" role="alert"><strong>تعذر تحميل العروض</strong><small>{error}</small><button type="button" className="sf-btn-secondary" onClick={() => { void promotionsQuery.refetch(); void productsQuery.refetch(); }}>إعادة المحاولة</button></div>
      : promotions.length === 0 ? <div className="sf-empty" role="status"><Tag size={26}/><strong>لا توجد عروض منشورة حاليًا</strong><small>لم يُرجع الخادم حملات فعالة ضمن نافذة النشر الحالية.</small><Link to="/catalog">تصفح الكتالوج</Link></div>
      : <section aria-label="قائمة العروض المنشورة" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 14 }}>
        {promotions.map((promotion) => {
          const productIds = promotion.product_ids ?? [];
          const categoryIds = promotion.category_ids ?? [];
          const targetProducts = products.filter((product) => productIds.includes(product.id) || (product.category_id !== null && categoryIds.includes(product.category_id)));
          const discountValue = Number(promotion.discount_value);
          const validDiscount = Number.isFinite(discountValue) && discountValue > 0;
          const discountLabel = !validDiscount ? "تفاصيل الخصم غير متاحة"
            : promotion.discount_type === "percentage" ? "نسبة مسجلة: " + formatNumber(discountValue) + "%"
            : promotion.discount_type === "fixed" ? "قيمة خصم ثابتة مسجلة: " + formatCurrency(discountValue)
            : "نوع الخصم المسجل: " + promotion.discount_type;
          return <article key={promotion.id} style={{ border: "1px solid #eadfbf", background: "#fffdf7", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#805f1a" }}><BadgePercent size={22}/><strong>حملة منشورة</strong></div>
            <h2 style={{ fontSize: 19, margin: 0 }}>{promotion.title}</h2>
            <p style={{ margin: 0, color: "#526b70" }}>{promotion.description || "لا يوجد وصف إضافي محفوظ للحملة."}</p>
            <strong>{discountLabel}</strong>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "#526b70", fontSize: 13 }}><CalendarDays size={15}/><span>الفترة المسجلة: {promotion.start_date} — {promotion.end_date}</span></div>
            {targetProducts.length > 0
              ? <div><span style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800 }}><Package size={16}/> الأصناف المشمولة في سجل الحملة</span><ul>{targetProducts.slice(0, 5).map((product) => <li key={product.id}>{product.name} · {product.item_code}</li>)}</ul>{targetProducts.length > 5 && <small>عُرضت أول 5 أصناف من أصل {formatNumber(targetProducts.length)}.</small>}</div>
              : productIds.length || categoryIds.length
                ? <p role="status">نطاق الحملة موجود لكن أصنافه غير متاحة ضمن الكتالوج المنشور للحساب الحالي.</p>
                : <p>النطاق المحدد في سجل الحملة لا يحتوي على قائمة أصناف أو تصنيفات صريحة.</p>}
            <Link to="/catalog" style={{ marginTop: "auto", textDecoration: "none", color: "#087f8d", fontWeight: 800, display: "inline-flex", gap: 7, alignItems: "center" }}>استعراض الكتالوج <ArrowLeft size={15}/></Link>
          </article>;
        })}
      </section>}
    <p style={{ marginTop: 18, borderTop: "1px solid #e2eaea", paddingTop: 12, color: "#526b70", fontSize: 13 }}>
      الخصم الفعلي وسعر الفئة يُحسبان على الخادم عند اعتماد الطلب، ويخضعان لقواعد التسعير وحدود التكلفة؛ قيمة إعداد الحملة المعروضة هنا ليست ضمانًا لسعر فاتورة نهائي.
    </p>
  </main>;
}
