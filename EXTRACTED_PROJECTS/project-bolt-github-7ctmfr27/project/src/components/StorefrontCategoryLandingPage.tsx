import { Link } from "@tanstack/react-router";
import { ArrowLeft, Layers3, RefreshCw } from "lucide-react";
import { Storefront } from "@/components/Storefront";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { resolveStorefrontCategorySlug, storefrontCategorySlug } from "@/lib/storefront-slugs";
import { useFetch } from "@/lib/useFetch";

export function StorefrontCategoryLandingPage({ categorySlug, subcategorySlug }: { categorySlug: string; subcategorySlug?: string }) {
  const categoriesQuery = useFetch(fetchCategories);
  const productsQuery = useFetch(fetchProducts);
  const categories = (categoriesQuery.data ?? []).filter((category) => category.is_active !== false);
  const products = productsQuery.data ?? [];
  const loading = categoriesQuery.loading || productsQuery.loading;
  const error = categoriesQuery.error || productsQuery.error;
  const parent = resolveStorefrontCategorySlug(categories, categorySlug);
  const child = subcategorySlug ? resolveStorefrontCategorySlug(categories, subcategorySlug) : undefined;
  const validChild = !subcategorySlug || Boolean(parent && child && child.parent_id === parent.id);
  const active = subcategorySlug ? child : parent;
  const count = active ? products.filter((product) => product.category_id === active.id).length : 0;
  const children = parent ? categories.filter((category) => category.parent_id === parent.id) : [];

  if (loading) return <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 24 }}><div className="sf-empty" role="status">جار التحقق من التصنيف وتحميل الأصناف المنشورة…</div></main>;
  if (error) return <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 24 }}><div className="sf-empty" role="alert"><strong>تعذر تحميل التصنيف</strong><small>{error}</small><button type="button" className="sf-btn-secondary" onClick={() => { void categoriesQuery.refetch(); void productsQuery.refetch(); }}>إعادة المحاولة</button></div></main>;
  if (!parent || !active || !validChild) return <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 24 }}><div className="sf-empty" role="status"><strong>التصنيف غير موجود</strong><small>لم يُعثر على تصنيف منشور يطابق الرابط؛ قد يكون قد تغير أو أُوقف.</small><Link to="/categories">العودة إلى التصنيفات</Link></div></main>;

  return <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 20, maxWidth: 1240, margin: "0 auto" }}>
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
      <div>
        <Link to="/categories" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#087f8d", textDecoration: "none" }}><ArrowLeft size={16}/> جميع التصنيفات</Link>
        <p style={{ margin: "12px 0 3px", color: "#64777b", fontSize: 13 }}>{subcategorySlug ? parent.name + " / تصنيف فرعي" : "تصنيف المنتجات"}</p>
        <h1 style={{ fontSize: 27, margin: "0 0 6px" }}>{active.name}</h1>
        <p style={{ margin: 0, color: "#526b70" }}>{count.toLocaleString("ar-YE")} صنف منشور يطابق هذا التصنيف حسب بيانات الخادم.</p>
      </div>
      <button type="button" className="btn outline" disabled={loading} onClick={() => { void categoriesQuery.refetch(); void productsQuery.refetch(); }}><RefreshCw size={15}/> تحديث البيانات</button>
    </header>
    {!subcategorySlug && children.length > 0 && <section aria-label="التصنيفات الفرعية" style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 18, marginBottom: 10 }}>التصنيفات الفرعية</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
        {children.map((category) => <Link key={category.id} to={("/category/" + storefrontCategorySlug(parent) + "/subcategory/" + storefrontCategorySlug(category)) as never} style={{ border: "1px solid #dce9e8", borderRadius: 12, padding: 13, color: "#087f8d", textDecoration: "none", display: "flex", alignItems: "center", gap: 9, fontWeight: 800 }}><Layers3 size={18}/>{category.name}</Link>)}
      </div>
    </section>}
    {count === 0 ? <div className="sf-empty" role="status"><strong>لا توجد أصناف منشورة في هذا التصنيف</strong><small>البيانات الحالية لا تربط أصنافًا منشورة بهذا المعرف. لم تُنشأ عناصر افتراضية.</small><Link to="/catalog">تصفح الكتالوج كاملًا</Link></div>
      : <Storefront initialCategoryId={active.id} onExit={() => undefined} />}
  </main>;
}
