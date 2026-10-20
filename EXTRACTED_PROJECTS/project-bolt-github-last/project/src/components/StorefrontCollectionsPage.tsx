import { Link } from "@tanstack/react-router";
import { ArrowLeft, Layers3, RefreshCw, Tags } from "lucide-react";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { storefrontCategorySlug } from "@/lib/storefront-slugs";
import { useFetch } from "@/lib/useFetch";

export function StorefrontCollectionsPage() {
  const categoriesQuery = useFetch(fetchCategories);
  const productsQuery = useFetch(fetchProducts);
  const categories = (categoriesQuery.data ?? []).filter((category) => category.is_active !== false);
  const products = productsQuery.data ?? [];
  const loading = categoriesQuery.loading || productsQuery.loading;
  const error = categoriesQuery.error || productsQuery.error;

  return <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 20, maxWidth: 1180, margin: "0 auto" }}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
      <div>
        <Link to="/store" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#087f8d", textDecoration: "none" }}><ArrowLeft size={16}/> العودة للمتجر</Link>
        <h1 style={{ margin: "12px 0 4px" }}>تصنيفات المنتجات</h1>
        <p style={{ margin: 0, color: "#526b70" }}>التصنيفات وعدد الأصناف مأخوذة من كتالوج المؤسسة المنشور؛ لا تُنشأ تصنيفات أو أعداد افتراضية.</p>
      </div>
      <button type="button" className="btn outline" disabled={loading} onClick={() => { void categoriesQuery.refetch(); void productsQuery.refetch(); }}><RefreshCw size={15}/> تحديث البيانات</button>
    </header>
    {loading ? <div className="sf-empty" role="status">جار تحميل التصنيفات والكتالوج…</div>
      : error ? <div className="sf-empty" role="alert"><strong>تعذر تحميل التصنيفات</strong><small>{error}</small><button type="button" className="sf-btn-secondary" onClick={() => { void categoriesQuery.refetch(); void productsQuery.refetch(); }}>إعادة المحاولة</button></div>
      : categories.length === 0 ? <div className="sf-empty" role="status"><Tags size={26}/><strong>لا توجد تصنيفات منشورة</strong><small>لا يوجد تصنيف نشط متاح للحساب الحالي.</small><Link to="/catalog">فتح الكتالوج الكامل</Link></div>
      : <section aria-label="التصنيفات المنشورة" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
        {categories.map((category) => {
          const count = products.filter((product) => product.category_id === category.id && product.status !== "inactive").length;
          return <article key={category.id} style={{ border: "1px solid #dce9e8", background: "#fff", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Layers3 size={22} color="#087f8d"/><h2 style={{ fontSize: 18, margin: 0 }}>{category.name}</h2></div>
            <p style={{ margin: 0, color: "#526b70" }}>{category.description || "تصنيف منظم لأصناف الكتالوج المنشور."}</p>
            <strong>{count.toLocaleString("ar-YE")} صنف</strong>
            {count > 0
              ? <Link to={"/category/" + storefrontCategorySlug(category)} style={{ marginTop: "auto", textDecoration: "none", color: "#087f8d", fontWeight: 800, display: "inline-flex", gap: 7, alignItems: "center" }}>تصفح التصنيف <ArrowLeft size={15}/></Link>
              : <span style={{ marginTop: "auto", color: "#71868a", fontSize: 13 }}>لا توجد أصناف منشورة ضمن هذا التصنيف.</span>}
          </article>;
        })}
      </section>}
  </main>;
}
