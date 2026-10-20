import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, SlidersHorizontal } from "lucide-react";
import { fetchCategories } from "@/lib/api";
import { MAX_CATALOG_SEARCH_LENGTH, normalizeCatalogSearchQuery } from "@/lib/commerce-utils";
import { useFetch } from "@/lib/useFetch";

export function AdvancedStorefrontSearchPage() {
  const navigate = useNavigate();
  const categoryQuery = useFetch(fetchCategories);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [formError, setFormError] = useState("");
  const categories = (categoryQuery.data ?? []).filter((category) => category.is_active !== false && !category.parent_id);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = normalizeCatalogSearchQuery(query).trim();
    if (!q && !categoryId && !availableOnly) {
      setFormError("أدخل اسمًا أو رمز صنف أو اختر تصنيفًا أو فعّل فلتر المتوفر فقط.");
      return;
    }
    setFormError("");
    void navigate({ to: "/catalog", search: {
      ...(q ? { q } : {}),
      ...(categoryId ? { category: categoryId } : {}),
      ...(availableOnly ? { available: "1" as const } : {}),
    } });
  }
  return <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 20, maxWidth: 920, margin: "0 auto" }}>
    <header style={{ marginBottom: 20 }}>
      <Link to="/store" style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "#087f8d", textDecoration: "none" }}><ArrowLeft size={16}/> العودة للمتجر</Link>
      <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 5px" }}><SlidersHorizontal size={25}/> البحث المتقدم</h1>
      <p style={{ color: "#526b70", margin: 0 }}>تُطبّق الشروط على نتائج الكتالوج نفسه؛ المخزون المجهول لا يُحسب متاحًا في فلتر المتوفر فقط.</p>
    </header>
    <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #dce9e8", borderRadius: 15, padding: 18, display: "grid", gap: 15 }}>
      <label style={{ display: "grid", gap: 6 }}>اسم الصنف أو رمزه أو الباركود
        <input value={query} onChange={(e) => setQuery(normalizeCatalogSearchQuery(e.target.value))} maxLength={MAX_CATALOG_SEARCH_LENGTH} autoComplete="off" placeholder="مثال: سكر أو SKU-002" style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #cbdad9", borderRadius: 9 }} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>التصنيف
        <select id="advanced-storefront-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={categoryQuery.loading || Boolean(categoryQuery.error)} style={{ width: "100%", padding: 12, border: "1px solid #cbdad9", borderRadius: 9 }}>
          <option value="">كل التصنيفات</option>
          {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      {categoryQuery.error && <p role="alert">تعذر تحميل التصنيفات: {categoryQuery.error}. يمكنك البحث بالاسم أو الرمز.</p>}
      <label style={{ display: "flex", alignItems: "center", gap: 9 }}><input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} /> عرض الأصناف ذات الرصيد المتاح المعروف فقط</label>
      {formError && <p role="alert">{formError}</p>}
      <button type="submit" className="sf-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}><Search size={17}/> عرض النتائج</button>
    </form>
  </main>;
}
