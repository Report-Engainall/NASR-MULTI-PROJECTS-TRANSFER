import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Minus, Plus, Search, ShoppingCart, Trash2,
  Package, Tag, Phone, MapPin, Mail, Check, ChevronLeft, Menu, ClipboardList,
  Heart, GitCompare, ArrowRight,
} from 'lucide-react';
import { fetchProducts, fetchCategories, fetchPromotions, fetchSettingsMap } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { formatCurrency, formatNumber } from '@/lib/format';
import { matchesArabicCatalogSearch, normalizeCartDraft, normalizeSavedProductIds, sanitizePublicCatalogCache, validateQuickOrderLines } from '@/lib/commerce-utils';
import type { ProductWithInventory, Category, Promotion } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { Link, useNavigate } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchCustomerAddresses, type CustomerAddress } from '@/lib/customer-addresses';

type CartItem = { product: ProductWithInventory; quantity: number };
type StoreView = 'shop' | 'product' | 'wishlist' | 'compare' | 'matrix' | 'cart' | 'checkout' | 'confirm';
export type StorefrontInitialView = 'shop' | 'product' | 'wishlist' | 'compare' | 'cart' | 'checkout';

function readSavedProductIds(key: string, maxItems: number): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeSavedProductIds(JSON.parse(window.localStorage.getItem(key) || '[]') as unknown, maxItems);
  } catch {
    return [];
  }
}

export function Storefront({ onExit, initialView = 'shop', initialProductId }: {
  onExit: () => void;
  initialView?: StorefrontInitialView;
  initialProductId?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: liveProducts, loading: productsLoading, error: productsError, refetch: refetchProducts } = useFetch(fetchProducts);
  const [cachedProducts, setCachedProducts] = useState<ProductWithInventory[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const value = JSON.parse(window.localStorage.getItem('aghbari:catalog:v1') || '[]') as unknown;
      const safe = sanitizePublicCatalogCache(value);
      // Rewrite legacy v1 cache immediately so staff-only fields from earlier builds are purged.
      window.localStorage.setItem('aghbari:catalog:v1', JSON.stringify(safe));
      return safe;
    } catch { return []; }
  });
  const products = liveProducts ?? cachedProducts;
  const { data: categories, error: categoriesError } = useFetch(fetchCategories);
  const { data: promotions } = useFetch(fetchPromotions);
  const { data: settings } = useFetch(fetchSettingsMap);
  const [view, setView] = useState<StoreView>(initialView);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartRestored, setCartRestored] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('');
  const [matrixQuantities, setMatrixQuantities] = useState<Record<string, string>>({});
  const [matrixFeedback, setMatrixFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [lastOrderNo, setLastOrderNo] = useState('');
  const [lastOrderId, setLastOrderId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductWithInventory | null>(null);
  const [wishlist, setWishlist] = useState<string[]>(() => readSavedProductIds('aghbari:wishlist:v1', 500));
  const [compare, setCompare] = useState<string[]>(() => readSavedProductIds('aghbari:compare:v1', 3));
  const [savedListNotice, setSavedListNotice] = useState('');
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  useEffect(() => {
    if (!liveProducts) return;
    const safeCatalog = sanitizePublicCatalogCache(liveProducts);
    setCachedProducts(safeCatalog);
    try { window.localStorage.setItem('aghbari:catalog:v1', JSON.stringify(safeCatalog)); } catch { /* storage is optional */ }
  }, [liveProducts]);

  useEffect(() => {
    try { window.localStorage.setItem('aghbari:wishlist:v1', JSON.stringify(wishlist)); } catch { /* saved preferences are optional */ }
  }, [wishlist]);

  useEffect(() => {
    try { window.localStorage.setItem('aghbari:compare:v1', JSON.stringify(compare)); } catch { /* saved preferences are optional */ }
  }, [compare]);

  useEffect(() => {
    if (initialView !== 'product' || !initialProductId || !products.length) return;
    setSelectedProduct(products.find((product) => product.id === initialProductId) ?? null);
  }, [initialView, initialProductId, products]);

  useEffect(() => {
    if (cartRestored || typeof window === 'undefined') return;
    if (!products.length && (productsLoading || productsError)) return;
    try {
      const normal = (value: string | null) => normalizeCartDraft(value ? JSON.parse(value) as unknown : []);
      const base = normal(window.localStorage.getItem('aghbari:cart:v1'));
      const restore = normal(window.localStorage.getItem('aghbari:cart-restore:v1'));
      const merged = new Map<string, number>();
      for (const line of [...base, ...restore]) merged.set(line.product_id, Math.min(10000, (merged.get(line.product_id) ?? 0) + line.quantity));
      setCart([...merged.entries()].map(([product_id, quantity]) => ({ product: products.find(p => p.id === product_id), quantity })).filter((line): line is CartItem => Boolean(line.product)));
      window.localStorage.removeItem('aghbari:cart-restore:v1');
    } catch { /* ignore malformed local drafts; never block online checkout */ }
    setCartRestored(true);
  }, [products, cartRestored, productsLoading, productsError]);

  useEffect(() => {
    if (!cartRestored) return;
    try { window.localStorage.setItem('aghbari:cart:v1', JSON.stringify(cart.map(item => ({ product_id: item.product.id, quantity: item.quantity })))); } catch { /* the online shop still works without storage */ }
  }, [cart, cartRestored]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  function addToCart(product: ProductWithInventory) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
  }
  function updateQty(productId: string, delta: number) {
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter((i) => i.quantity > 0));
  }
  function removeFromCart(productId: string) { setCart((prev) => prev.filter((i) => i.product.id !== productId)); }
  function addMatrixSelection() {
    const selected = filtered.flatMap((product) => {
      const raw = matrixQuantities[product.id] ?? '';
      if (!raw.trim()) return [];
      return [{ product, quantity: Number(raw) }];
    });
    const validation = validateQuickOrderLines(selected.map(({ product, quantity }) => ({
      product_id: product.id,
      product_name: product.name,
      quantity,
      available: Math.max(0, Math.floor(Number(product.inventory?.quantity_available ?? 0))),
      already_in_cart: cart.find((item) => item.product.id === product.id)?.quantity ?? 0,
    })));
    if (!validation.valid) {
      const message = validation.reason === 'empty'
        ? 'أدخل كمية صحيحة لصنف واحد على الأقل.'
        : validation.reason === 'invalid_quantity'
          ? `الكمية المطلوبة للصنف «${validation.product_name ?? ''}» غير صحيحة. أدخل عددًا صحيحًا أكبر من صفر.`
          : `الكمية المطلوبة للصنف «${validation.product_name ?? ''}» تتجاوز المخزون الظاهر بما في ذلك الكمية الموجودة في السلة.`;
      setMatrixFeedback({ kind: 'error', message });
      return;
    }
    setCart((previous) => {
      const next = new Map(previous.map((item) => [item.product.id, { ...item }]));
      for (const line of selected) {
        const existing = next.get(line.product.id);
        next.set(line.product.id, { product: line.product, quantity: (existing?.quantity ?? 0) + line.quantity });
      }
      return [...next.values()];
    });
    setMatrixQuantities((previous) => ({ ...previous, ...Object.fromEntries(selected.map(({ product }) => [product.id, ''])) }));
    setMatrixFeedback({ kind: 'success', message: `تمت إضافة ${selected.length} أصناف إلى السلة. سيُعاد احتساب الأسعار والمخزون من الخادم قبل اعتماد الطلب.` });
  }
  function toggleWishlist(productId: string) {
    setWishlist((prev) => normalizeSavedProductIds(prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId], 500));
    setSavedListNotice('');
  }
  function toggleCompare(productId: string) {
    if (compare.includes(productId)) {
      setCompare((prev) => prev.filter((id) => id !== productId));
      setSavedListNotice('');
      return;
    }
    if (compare.length >= 3) {
      setSavedListNotice('يمكن مقارنة ثلاثة أصناف فقط. أزل صنفًا من المقارنة قبل إضافة صنف آخر.');
      return;
    }
    setCompare((prev) => normalizeSavedProductIds([...prev, productId], 3));
    setSavedListNotice('');
  }
  function openProduct(product: ProductWithInventory) {
    void navigate({ to: '/product/$id', params: { id: product.id } });
  }

  const filtered = useMemo(() => {
    let list = products ?? [];
    if (activeCat) list = list.filter((p) => p.category_id === activeCat);
    if (query.trim()) list = list.filter((p) => matchesArabicCatalogSearch(p, query));
    return list;
  }, [products, activeCat, query]);

  const tickerMessages = (settings?.ticker_messages as string[]) ?? [];
  const tickerEnabled = settings?.ticker_enabled as boolean ?? true;

  return (
    <div className="storefront" dir="rtl">
      <header className="sf-header">
        <div className="sf-header-inner">
          <div className="sf-brand"><div className="sf-brand-icon"><Activity size={22} /></div><div><strong>{(settings?.store_name as string) ?? 'الأغبري'}</strong><span>{(settings?.store_tagline as string) ?? 'مواد غذائية بالجملة'}</span></div></div>
          <button className="sf-admin-btn" onClick={onExit}><Activity size={16} /> لوحة التحكم</button>
          <div className="sf-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن منتج..." /></div>
          <div className="sf-header-links"><button onClick={() => void navigate({ to: '/wishlist' })}><Heart size={16} /> المفضلة <b>{wishlist.length}</b></button><button onClick={() => void navigate({ to: '/compare' })}><GitCompare size={16} /> مقارنة</button><button onClick={() => { setMatrixFeedback(null); setView('matrix'); }}><ClipboardList size={16} /> طلب سريع</button><Link to="/orders" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 11, fontWeight: 700 }}><FileText size={16} /> طلباتي</Link>{!user && <Link to="/login" style={{ color: '#0b97a5', fontWeight: 800, fontSize: 11 }}>دخول</Link>}</div>
          <button className="sf-cart-btn" onClick={() => void navigate({ to: '/cart' })}><ShoppingCart size={20} /> {cartCount > 0 && <b>{cartCount}</b>}</button>
          <button className="sf-mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={22} /></button>
        </div>
      </header>

      {tickerEnabled && tickerMessages.length > 0 && (
        <div className="sf-ticker"><div className="sf-ticker-track">{tickerMessages.map((msg, i) => <span key={i}>{msg}</span>)}</div></div>
      )}

      <nav className={`sf-cats ${mobileMenu ? 'open' : ''}`}>
        <button className={activeCat === '' ? 'active' : ''} onClick={() => { setActiveCat(''); setMobileMenu(false); }}>كل المنتجات</button>
        {categories?.map((c: Category) => <button key={c.id} className={activeCat === c.id ? 'active' : ''} onClick={() => { setActiveCat(c.id); setMobileMenu(false); }}>{c.name}</button>)}
      </nav>

      <div aria-label="أدوات الحساب التجاري" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', padding: '10px 16px', borderBottom: '1px solid #e4eeee', background: '#fff' }}>
        {[['/invoices', 'الفواتير'], ['/statement', 'كشف الحساب'], ['/quotes', 'عروض الأسعار'], ['/reorder', 'إعادة الطلب'], ['/barcode', 'ماسح الباركود'], ['/assistant', 'المساعد الذكي'], ['/offline', 'دون اتصال']].map(([to, label]) => <Link key={to} to={to as never} style={{ textDecoration: 'none', color: '#0b7b89', border: '1px solid #d8e9e9', borderRadius: 18, padding: '6px 12px', fontSize: 11, fontWeight: 800 }}>{label}</Link>)}
      </div>

      {!isOnline && <div role="status" style={{ padding: '10px 16px', background: '#fff4df', color: '#7c4a05', borderBottom: '1px solid #efd7a5', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
        أنت غير متصل حاليًا. يعرض المتجر آخر نسخة محلية متاحة؛ قد تتغير الأسعار والأرصدة، ولن يُعتمد أي طلب حتى يعود الاتصال ويتحقق الخادم من البيانات الحالية.
      </div>}
      {productsError && products.length > 0 && <div role="status" style={{ padding: '10px 16px', background: '#fff9e9', color: '#7c4a05', borderBottom: '1px solid #ead7a8', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
        تعذر تحديث الكتالوج؛ تظهر نسخة محفوظة قديمة وقد تختلف الأسعار والأرصدة. <button type="button" onClick={() => void refetchProducts()} disabled={productsLoading} style={{ textDecoration: 'underline', marginInlineStart: 8 }}>إعادة المحاولة</button>
      </div>}
      {categoriesError && <div role="status" style={{ padding: '8px 16px', color: '#7c4a05', textAlign: 'center', fontSize: 12 }}>تعذر تحميل التصنيفات؛ يمكنك البحث بالاسم أو رمز الصنف مؤقتًا.</div>}

      <main className="sf-main">
        {view === 'shop' && (
          <>
            <section className="sf-hero" style={{ background: `linear-gradient(120deg, ${(settings?.theme_primary as string) ?? '#087f8d'}, ${(settings?.theme_accent as string) ?? '#0eaa97'})` }}>
              <div><span className="sf-hero-kicker">عرض خاص</span><h1>{(settings?.hero_title as string) ?? 'الأغبري — موردك الموثوق'}</h1><p>{(settings?.hero_subtitle as string) ?? 'مواد غذائية بالجملة بأسعار تنافسية وتوصيل سريع'}</p></div>
              <div className="sf-hero-badge"><Package size={28} /><div><strong>{productsLoading && !products.length ? '…' : formatNumber(products.length)}</strong><span>{productsLoading && !products.length ? 'جار تحميل الكتالوج' : 'منتج في الكتالوج'}</span></div></div>
            </section>

            {promotions && promotions.filter((p: Promotion) => p.is_active).length > 0 && (
              <section className="sf-promos">{promotions.filter((p) => p.is_active).map((p: Promotion) => <div className="sf-promo" key={p.id}><Tag size={16} /> <strong>{p.title}</strong> <span>{p.discount_value}% خصم</span></div>)}</section>
            )}

            <section className="sf-products">
              <div className="sf-products-head"><div><h2>المنتجات</h2><span>{productsLoading && !products.length ? 'جار تحميل الكتالوج...' : `${formatNumber(filtered.length)} صنف حسب بحثك وتصنيفك`}</span></div><div className="sf-discovery-links"><button onClick={() => void navigate({ to: '/wishlist' })}><Heart size={15} /> المفضلة</button><button onClick={() => void navigate({ to: '/compare' })}><GitCompare size={15} /> المقارنة ({compare.length}/3)</button><button onClick={() => { setMatrixFeedback(null); setView('matrix'); }}><ClipboardList size={15} /> طلب سريع</button></div></div>
              {productsLoading && !products.length
                ? <div className="sf-empty" role="status"><Package size={30} /><span>جار تحميل كتالوج المنتجات...</span></div>
                : productsError && !products.length
                  ? <div className="sf-empty" role="alert"><Package size={30} /><strong>تعذر تحميل الكتالوج</strong><small>{productsError}</small><button type="button" className="sf-btn-secondary" onClick={() => void refetchProducts()}>إعادة المحاولة</button></div>
                  : <ProductGrid
                    products={filtered}
                    wishlist={wishlist}
                    compare={compare}
                    emptyTitle={products.length === 0 ? 'لا توجد أصناف منشورة حالياً' : 'لا توجد منتجات مطابقة'}
                    emptyDescription={products.length === 0
                      ? 'لا توجد أصناف نشطة متاحة للعرض في المتجر حالياً. يُرجى التواصل مع إدارة المتجر إذا كنت تتوقع ظهور المنتجات.'
                      : 'جرّب تغيير البحث أو التصنيف'}
                    onOpen={openProduct}
                    onAdd={addToCart}
                    onWishlist={toggleWishlist}
                    onCompare={toggleCompare}
                  />}
            </section>
          </>
        )}

        {savedListNotice && <div role="status" className="sf-form-error" style={{ marginBottom: 12 }}>{savedListNotice}</div>}
        {view === 'product' && (selectedProduct
          ? <ProductDetail product={selectedProduct} inWishlist={wishlist.includes(selectedProduct.id)} inCompare={compare.includes(selectedProduct.id)} onBack={() => void navigate({ to: '/' })} onAdd={() => addToCart(selectedProduct)} onWishlist={() => toggleWishlist(selectedProduct.id)} onCompare={() => toggleCompare(selectedProduct.id)} />
          : productsLoading ? <div className="sf-empty" role="status">جار تحميل تفاصيل المنتج...</div>
            : productsError ? <div className="sf-empty" role="alert"><strong>تعذر تحميل تفاصيل المنتج</strong><small>{productsError}</small><button type="button" onClick={() => void refetchProducts()}>إعادة المحاولة</button></div>
              : <div className="sf-empty" role="alert"><strong>المنتج غير متاح</strong><small>تعذر العثور على المنتج ضمن الكتالوج الحالي.</small><button type="button" onClick={() => void navigate({ to: '/' })}>العودة للمتجر</button></div>)}
        {view === 'wishlist' && <CollectionView title="المفضلة" icon={Heart} products={products.filter((p) => wishlist.includes(p.id))} wishlist={wishlist} compare={compare} loading={productsLoading} error={productsError} onRetry={() => void refetchProducts()} onOpen={openProduct} onAdd={addToCart} onWishlist={toggleWishlist} onCompare={toggleCompare} onBack={() => void navigate({ to: '/' })} empty="لا توجد منتجات محفوظة في المفضلة ضمن الكتالوج الحالي" />}
        {view === 'compare' && <CollectionView title="مقارنة المنتجات" icon={GitCompare} products={products.filter((p) => compare.includes(p.id))} wishlist={wishlist} compare={compare} loading={productsLoading} error={productsError} onRetry={() => void refetchProducts()} onOpen={openProduct} onAdd={addToCart} onWishlist={toggleWishlist} onCompare={toggleCompare} onBack={() => void navigate({ to: '/' })} empty="اختر حتى ثلاثة منتجات من الكتالوج للمقارنة" />}
        {view === 'matrix' && <QuickOrderMatrix products={filtered} quantities={matrixQuantities} feedback={matrixFeedback} onQuantityChange={(id, value) => { setMatrixQuantities((previous) => ({ ...previous, [id]: value })); setMatrixFeedback(null); }} onAddSelected={addMatrixSelection} onBack={() => setView('shop')} onCart={() => void navigate({ to: '/cart' })} />}

        {view === 'cart' && (!cartRestored ? (
          <section className="sf-cart-page">
            <h2>سلة المشتريات</h2>
            <div className="sf-empty" role={productsError ? 'alert' : 'status'}>
              <span>{productsLoading ? 'جار استعادة السلة المحلية...' : productsError ? 'تعذر استعادة تفاصيل السلة من الكتالوج الحالي.' : 'جار استعادة السلة...'}</span>
              {productsError && <><small>{productsError}</small><button type="button" className="sf-btn-secondary" onClick={() => void refetchProducts()}>إعادة المحاولة</button></>}
            </div>
          </section>
        ) : (
          <section className="sf-cart-page">
            <h2>سلة المشتريات</h2>
            {!cart.length ? <div className="sf-empty"><ShoppingCart size={30} /><span>سلتك فارغة</span><button className="sf-link" onClick={() => void navigate({ to: '/' })}>تصفح المنتجات</button></div> :
            <>
              <div className="sf-cart-list">
                {cart.map((item) => (
                  <div className="sf-cart-row" key={item.product.id}>
                    <div className="sf-cart-info"><div className="sf-cart-img"><Package size={20} /></div><div><strong>{item.product.name}</strong><span>الوحدة: {item.product.unit}</span></div></div>
                    <div className="sf-cart-qty"><button aria-label={`تقليل كمية ${item.product.name}`} onClick={() => updateQty(item.product.id, -1)}><Minus size={14} /></button><span>{item.quantity}</span><button aria-label={`زيادة كمية ${item.product.name}`} onClick={() => updateQty(item.product.id, 1)}><Plus size={14} /></button></div>
                    <button className="sf-cart-remove" aria-label={`حذف ${item.product.name} من السلة`} onClick={() => removeFromCart(item.product.id)}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <div role="note" style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f2f7f8', color: '#536b70' }}>سيُراجع الطلب ويُعتمد من جهة الإدارة. الأسعار والإجماليات لا تظهر في شاشة الطلب للعميل.</div>
              <div className="sf-cart-actions"><button className="sf-btn-secondary" onClick={() => void navigate({ to: '/' })}>متابعة التسوق</button><button className="sf-btn-primary" onClick={() => void navigate({ to: '/checkout' })}>إتمام الطلب <ChevronLeft size={16} /></button></div>
            </>
            }
          </section>
        ))}

        {view === 'checkout' && (!cartRestored ? (
          <section className="sf-checkout"><div className="sf-empty" role={productsError ? 'alert' : 'status'}><span>{productsLoading ? 'جار استعادة سلة الطلب...' : productsError ? 'تعذر استعادة السلة.' : 'جار استعادة سلة الطلب...'}</span>{productsError && <><small>{productsError}</small><button type="button" onClick={() => void refetchProducts()}>إعادة المحاولة</button></>}</div></section>
        ) : !cart.length ? (
          <section className="sf-checkout"><h2>لا توجد أصناف لإتمام الطلب</h2><p>أضف الأصناف إلى السلة أولاً. لن يتم إنشاء طلب فارغ.</p><button className="sf-btn-primary" onClick={() => void navigate({ to: '/' })}>العودة إلى المتجر</button></section>
        ) : <Checkout cart={cart} onBack={() => void navigate({ to: '/cart' })} onComplete={(order) => { setLastOrderNo(order.order_number); setLastOrderId(order.id); setView('confirm'); setCart([]); }} />)}
        {view === 'confirm' && <OrderConfirm orderNo={lastOrderNo} orderId={lastOrderId} onContinue={() => void navigate({ to: '/' })} />}
      </main>

      <footer className="sf-footer">
        <div className="sf-footer-inner">
          <div className="sf-footer-brand"><Activity size={20} /> <strong>{(settings?.store_name as string) ?? 'الأغبري'}</strong></div>
          <div className="sf-footer-info"><Phone size={15} /> {(settings?.store_phone as string) || 'رقم الهاتف غير مهيأ'}</div>
          <div className="sf-footer-info"><Mail size={15} /> {(settings?.store_email as string) || 'البريد الإلكتروني غير مهيأ'}</div>
          <div className="sf-footer-info"><MapPin size={15} /> {(settings?.store_address as string) || 'عنوان المتجر غير مهيأ'}</div>
        </div>
      </footer>
    </div>
  );
}

function ProductGrid({ products, wishlist, compare, emptyTitle, emptyDescription, onOpen, onAdd, onWishlist, onCompare }: { products: ProductWithInventory[]; wishlist: string[]; compare: string[]; emptyTitle: string; emptyDescription: string; onOpen: (product: ProductWithInventory) => void; onAdd: (product: ProductWithInventory) => void; onWishlist: (id: string) => void; onCompare: (id: string) => void }) {
  if (!products.length) return <div className="sf-empty" role="status"><Package size={30} /><strong>{emptyTitle}</strong><small>{emptyDescription}</small></div>;
  return <div className="sf-product-grid">{products.map((product) => { const qty = product.inventory?.quantity_available ?? 0; const out = qty <= 0; const liked = wishlist.includes(product.id); const compared = compare.includes(product.id); return <article className="sf-product-card" key={product.id}><div className="sf-product-img" onClick={() => onOpen(product)}>{product.image_url ? <img src={product.image_url} alt={product.name} /> : <Package size={36} />}<div className="sf-card-actions"><button aria-label="إضافة للمفضلة" className={liked ? 'active' : ''} onClick={(event) => { event.stopPropagation(); onWishlist(product.id); }}><Heart size={16} fill={liked ? 'currentColor' : 'none'} /></button><button aria-label="إضافة للمقارنة" className={compared ? 'active' : ''} onClick={(event) => { event.stopPropagation(); onCompare(product.id); }}><GitCompare size={16} /></button></div></div><button className="sf-product-body sf-product-open" onClick={() => onOpen(product)}><h3>{product.name}</h3><p>{product.category?.name ?? 'غير مصنف'} · {product.item_code}</p><div className="sf-product-price"><strong>{typeof product.display_price === 'number' ? formatCurrency(product.display_price) : 'اتصل بالإنترنت لعرض سعر فئتك'}</strong><span>{product.unit}</span></div><div className="sf-product-stock">{out ? <span className="sf-out">نفد المخزون</span> : <span className="sf-in">{formatNumber(qty)} متوفر</span>}</div></button><button className="sf-add-btn" disabled={out} onClick={() => onAdd(product)}>{out ? 'غير متوفر' : <><Plus size={16} /> أضف للسلة</>}</button></article>; })}</div>;
}

function ProductDetail({ product, inWishlist, inCompare, onBack, onAdd, onWishlist, onCompare }: { product: ProductWithInventory; inWishlist: boolean; inCompare: boolean; onBack: () => void; onAdd: () => void; onWishlist: () => void; onCompare: () => void }) {
  const quantity = product.inventory?.quantity_available ?? 0;
  return <section className="sf-product-detail"><button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للكتالوج</button><div className="sf-detail-layout"><div className="sf-detail-image">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <Package size={72} />}<span className="sf-detail-code">SKU: {product.item_code}</span></div><div className="sf-detail-content"><span className="sf-detail-category">{product.category?.name ?? 'غير مصنف'}</span><h2>{product.name}</h2><p className="sf-detail-description">{product.description || 'منتج متوفر للطلب بالجملة من متجر الأغبري.'}</p><div className="sf-detail-price"><strong>{typeof product.display_price === 'number' ? formatCurrency(product.display_price) : 'اتصل بالإنترنت لعرض سعر فئتك'}</strong><span>لكل {product.unit}</span></div><div className={`sf-detail-stock ${quantity > 0 ? 'available' : 'unavailable'}`}>{quantity > 0 ? `متوفر حالياً: ${formatNumber(quantity)} ${product.unit}` : 'هذا المنتج غير متوفر حالياً'}</div><div className="sf-detail-actions"><button className="sf-btn-primary" disabled={quantity <= 0} onClick={onAdd}><ShoppingCart size={17} /> إضافة إلى السلة</button><button className={`sf-icon-action ${inWishlist ? 'active' : ''}`} onClick={onWishlist}><Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} /> {inWishlist ? 'في المفضلة' : 'أضف للمفضلة'}</button><button className={`sf-icon-action ${inCompare ? 'active' : ''}`} onClick={onCompare}><GitCompare size={18} /> مقارنة</button></div><div className="sf-detail-facts"><div><strong>الوحدة</strong><span>{product.unit}</span></div><div><strong>الحد الأدنى</strong><span>حسب اتفاق العميل</span></div><div><strong>السعر</strong><span>السعر الظاهر قبل تأكيد الطلب</span></div></div></div></div></section>;
}

function CollectionView({ title, icon: Icon, products, wishlist, compare, loading, error, onRetry, onOpen, onAdd, onWishlist, onCompare, onBack, empty }: {
  title: string; icon: typeof Heart; products: ProductWithInventory[]; wishlist: string[]; compare: string[];
  loading: boolean; error: string | null; onRetry: () => void;
  onOpen: (product: ProductWithInventory) => void; onAdd: (product: ProductWithInventory) => void;
  onWishlist: (id: string) => void; onCompare: (id: string) => void; onBack: () => void; empty: string;
}) {
  return <section className="sf-collection"><button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للمتجر</button><div className="sf-products-head"><div><h2><Icon size={21} /> {title}</h2><span>{products.length} منتجات</span></div></div>
    {products.length ? <ProductGrid products={products} wishlist={wishlist} compare={compare} emptyTitle={empty} emptyDescription="" onOpen={onOpen} onAdd={onAdd} onWishlist={onWishlist} onCompare={onCompare} /> :
      loading ? <div className="sf-empty" role="status">جار تحميل قائمة المنتجات...</div> :
      error ? <div className="sf-empty" role="alert"><strong>تعذر تحميل قائمة المنتجات</strong><small>{error}</small><button type="button" className="sf-btn-secondary" onClick={onRetry}>إعادة المحاولة</button></div> :
      <div className="sf-empty"><Icon size={32} /><span>{empty}</span><button className="sf-link" onClick={onBack}>تصفح الكتالوج</button></div>}
  </section>;
}

type CheckoutPreviewLine = {
  product_id: string;
  name: string;
  item_code: string;
  unit: string;
  quantity: number | string;
};
type CheckoutValidation = {
  valid: true;
  items: CheckoutPreviewLine[];
  item_count: number;
  currency: string;
  pricing_verified: true;
};

function Checkout({ cart, onBack, onComplete }: { cart: CartItem[]; onBack: () => void; onComplete: (order: { id: string; order_number: string }) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'cash_on_delivery' | 'credit'>('cash_on_delivery');
  const [deliveryAddresses, setDeliveryAddresses] = useState<CustomerAddress[]>([]);
  const [deliveryAddressId, setDeliveryAddressId] = useState('');
  const [deliveryAddressesLoading, setDeliveryAddressesLoading] = useState(false);
  const [deliveryAddressesError, setDeliveryAddressesError] = useState('');
  const [deliveryAddressRetry, setDeliveryAddressRetry] = useState(0);
  const selectedDeliveryAddress = useMemo(
    () => deliveryAddresses.find((address) => address.id === deliveryAddressId) ?? null,
    [deliveryAddresses, deliveryAddressId],
  );
  const [cartValidation, setCartValidation] = useState<CheckoutValidation | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const checkoutItems = useMemo(
    () => cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
    [cart],
  );
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!user?.profileId) {
      setDeliveryAddresses([]);
      setDeliveryAddressId('');
      setDeliveryAddressesLoading(false);
      setDeliveryAddressesError('');
      return () => { active = false; };
    }

    setDeliveryAddressesLoading(true);
    setDeliveryAddressesError('');
    void fetchCustomerAddresses().then((addresses) => {
      if (!active) return;
      setDeliveryAddresses(addresses);
      setDeliveryAddressId((current) =>
        addresses.some((address) => address.id === current)
          ? current
          : addresses.find((address) => address.is_default)?.id ?? addresses[0]?.id ?? '',
      );
    }).catch((cause) => {
      if (!active) return;
      setDeliveryAddresses([]);
      setDeliveryAddressId('');
      setDeliveryAddressesError(cause instanceof Error ? cause.message : 'تعذر تحميل عناوين التوصيل.');
    }).finally(() => {
      if (active) setDeliveryAddressesLoading(false);
    });

    return () => { active = false; };
  }, [user?.profileId, deliveryAddressRetry]);

  useEffect(() => {
    let active = true;
    setPreviewLoading(true);
    setPreviewError('');
    setCartValidation(null);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('validate_checkout_cart', { p_items: checkoutItems });
        if (rpcError) throw new Error(rpcError.message || 'تعذر التحقق من أصناف السلة وسياسة التسعير');
        const payload = data as { valid?: unknown; items?: unknown; item_count?: unknown; currency?: unknown; pricing_verified?: unknown } | null;
        if (!payload || payload.valid !== true || payload.pricing_verified !== true || !Array.isArray(payload.items) ||
          payload.items.length === 0 || Number(payload.item_count) !== payload.items.length) {
          throw new Error('لم يصل تأكيد تحقق صالح من الخادم');
        }
        const rows = payload.items as CheckoutPreviewLine[];
        if (rows.some((line) =>
          typeof line.product_id !== 'string' || typeof line.name !== 'string' ||
          typeof line.item_code !== 'string' || typeof line.unit !== 'string' ||
          !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 ||
          'unit_price' in line || 'line_total' in line || 'total_amount' in line
        )) throw new Error('استجابة تحقق السلة غير مكتملة أو تحتوي حقولًا مالية غير مسموحة');
        if (active) setCartValidation({
          valid: true,
          items: rows,
          item_count: Number(payload.item_count),
          currency: typeof payload.currency === 'string' ? payload.currency : 'YER',
          pricing_verified: true,
        });
      } catch (e) {
        if (active) setPreviewError(e instanceof Error ? e.message : 'تعذر التحقق من الأسعار الحالية');
      } finally {
        if (active) setPreviewLoading(false);
      }
    })();
    return () => { active = false; };
  }, [checkoutItems, user?.profileId, previewRetry]);

  function getIdempotencyKey() {
    const items = cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id));
    const signature = JSON.stringify({ profile_id: user?.profileId, payment_terms: paymentTerms, items, contact_name: name.trim(), business_name: business.trim(), phone: phone.trim(), notes: notes.trim(), delivery_address_id: deliveryAddressId || null });
    if (idempotencyRef.current?.signature === signature) return idempotencyRef.current.key;
    const storageKey = 'aghbari:checkout-attempt:v1';
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') as { signature?: unknown; key?: unknown } | null;
      if (saved?.signature === signature && typeof saved.key === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(saved.key)) {
        idempotencyRef.current = { signature, key: saved.key };
        return saved.key;
      }
    } catch { /* session storage is best-effort; the component ref still protects in-page retries */ }
    const key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'checkout_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    idempotencyRef.current = { signature, key };
    try { window.sessionStorage.setItem(storageKey, JSON.stringify({ signature, key })); } catch { /* optional persistence */ }
    return key;
  }

  async function submit() {
    if (!user) { setError('سجّل الدخول أو أنشئ حساباً لإتمام الطلب'); return; }
    if (name.trim().length < 2 || phone.trim().length < 6) { setError('الاسم ورقم الهاتف مطلوبان'); return; }
    if (previewLoading || !cartValidation) { setError('لا يمكن تسجيل الطلب حتى ينجح التحقق من أصناف السلة وسياسة التسعير. أعد المحاولة.'); return; }
    setSubmitting(true); setError('');
    const requestKey = getIdempotencyKey();
    try {
      const { data, error: rpcError } = await supabase.rpc('submit_customer_order', {
        _items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        _notes: notes.trim(), _business_name: business.trim(), _contact_name: name.trim(), _phone: phone.trim(),
        _payment_terms: paymentTerms, _idempotency_key: requestKey,
        _delivery_address_id: deliveryAddressId || null,
      });
      if (rpcError) throw new Error(rpcError.message || 'تعذر إرسال الطلب');
      const result = data as { id?: unknown; order_number?: unknown; status?: unknown } | null;
      if (!result || typeof result.id !== 'string' || !result.id || typeof result.order_number !== 'string' || !result.order_number ||
        'total_amount' in result || 'unit_price' in result || 'line_total' in result) {
        throw new Error('استجابة الخادم غير مكتملة أو تحتوي بيانات مالية غير مسموحة؛ راجع طلباتي قبل إعادة الإرسال.');
      }
      try {
        const storageKey = 'aghbari:checkout-attempt:v1';
        const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') as { key?: unknown } | null;
        if (saved?.key === requestKey) window.sessionStorage.removeItem(storageKey);
      } catch { /* request is already confirmed; cleanup is best-effort */ }
      idempotencyRef.current = null;
      onComplete({ id: result.id, order_number: result.order_number });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إرسال الطلب');
    } finally { setSubmitting(false); }
  }

  return (
    <section className="sf-checkout">
      <h2>إتمام الطلب</h2>
      <div className="sf-checkout-layout">
        <div className="sf-checkout-form">
          <label className="sf-form-field"><span>الاسم الكامل *</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك الكامل" /></label>
          <label className="sf-form-field"><span>رقم الهاتف *</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7XX XXX XXX" /></label>
          <label className="sf-form-field"><span>اسم المنشأة</span><input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="اسم المتجر أو الشركة" /></label>

          <div className="sf-form-field">
            <label htmlFor="checkout-delivery-address"><span>عنوان التوصيل</span></label>
            <select
              id="checkout-delivery-address"
              value={deliveryAddressId}
              onChange={(event) => setDeliveryAddressId(event.target.value)}
              disabled={deliveryAddressesLoading || submitting}
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #d8e8e8', borderRadius: 10, background: '#fff', color: '#18383c' }}
            >
              <option value="">بدون عنوان محفوظ — سأؤكد تفاصيل التوصيل لاحقًا</option>
              {deliveryAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label} — {address.city} — {address.address_line1}
                </option>
              ))}
            </select>
            {deliveryAddressesLoading && <small role="status" style={{ display: 'block', marginTop: 6 }}>جارٍ تحميل عناوينك المحفوظة...</small>}
            {deliveryAddressesError && <div className="sf-form-error" role="alert" style={{ marginTop: 8 }}>
              {deliveryAddressesError}
              <button className="sf-link" type="button" onClick={() => setDeliveryAddressRetry((n) => n + 1)}>إعادة المحاولة</button>
            </div>}
            {!deliveryAddressesLoading && deliveryAddresses.length === 0 && (
              <p style={{ color: '#71868a', lineHeight: 1.7, margin: '7px 0 0' }}>
                لا يوجد عنوان محفوظ. يمكنك إتمام الطلب دون ربط عنوان، أو <Link to="/addresses" className="sf-link">إضافة عنوان توصيل</Link>.
              </p>
            )}
            {selectedDeliveryAddress && (
              <div role="note" style={{ marginTop: 8, padding: 10, borderRadius: 9, background: '#f2f7f8', color: '#536b70', lineHeight: 1.7 }}>
                سيحفظ الطلب نسخة ثابتة من العنوان المحدد. تعديل دفتر العناوين لاحقًا لن يغير وجهة هذا الطلب.
              </div>
            )}
          </div>
          <fieldset className="sf-form-field" style={{ border: '1px solid #d8e8e8', borderRadius: 12, padding: 12, margin: 0 }}><legend style={{ padding: '0 6px', fontWeight: 800 }}>شروط الدفع</legend>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><input type="radio" name="paymentTerms" value="cash_on_delivery" checked={paymentTerms === 'cash_on_delivery'} onChange={() => setPaymentTerms('cash_on_delivery')} /> الدفع عند الاستلام</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="radio" name="paymentTerms" value="credit" checked={paymentTerms === 'credit'} onChange={() => setPaymentTerms('credit')} /> الدفع الآجل وفق حد الائتمان المعتمد</label>
            <small style={{ color: '#71868a' }}>يتحقق الخادم من اعتماد حسابك وحد الائتمان عند اختيار الدفع الآجل.</small>
          </fieldset>
          <label className="sf-form-field"><span>ملاحظات</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات على الطلب..." /></label>
          {previewError && <div className="sf-form-error" role="alert">{previewError} <button className="sf-link" type="button" onClick={() => setPreviewRetry((n) => n + 1)}>إعادة التحقق</button></div>}
          {error && <div className="sf-form-error">{error}</div>}
          <div className="sf-checkout-actions"><button className="sf-btn-secondary" onClick={onBack}>رجوع</button><button className="sf-btn-primary" onClick={submit} disabled={submitting || previewLoading || deliveryAddressesLoading || !cartValidation}>{submitting ? 'جار الإرسال...' : previewLoading ? 'جارٍ التحقق من السلة...' : deliveryAddressesLoading ? 'جارٍ تحميل عناوين التوصيل...' : 'تأكيد الطلب'}</button></div>
        </div>
        <aside className="sf-checkout-summary">
          <h3>ملخص الطلب</h3>
          {previewLoading && <p role="status">جارٍ التحقق من الأصناف وسياسة التسعير من الخادم...</p>}
          {cartValidation ? cartValidation.items.map((line) => <div className="sf-summary-row" key={line.product_id}><span>{line.name}</span><small>الكمية: {formatNumber(Number(line.quantity))} {line.unit}</small></div>)
            : !previewLoading && cart.map((i) => <div className="sf-summary-row" key={i.product.id}><span>{i.product.name}</span><small>الكمية: {formatNumber(i.quantity)} {i.product.unit}</small></div>)}
          <div role="note" style={{ padding: 12, borderRadius: 10, background: '#f2f7f8', color: '#536b70', lineHeight: 1.8 }}>
            الأسعار والإجماليات مخفية في مستندات الطلب للعميل. بعد مراجعة الإدارة سيظهر إشعار حالة الطلب وتعليمات السداد عند الحاجة.
          </div>
          {cartValidation && <small style={{ color: '#71868a', lineHeight: 1.7 }}>تحقق الخادم من الأصناف وصلاحية سياسة التسعير دون إرسال أي أسعار أو إجماليات للمتصفح. يعيد الخادم حساب المبلغ داخل معاملة إنشاء الطلب.</small>}
          {!cartValidation && !previewLoading && <small style={{ color: '#9b2626', lineHeight: 1.7 }}>لن يُرسل الطلب حتى ينجح التحقق من السلة وسياسة التسعير في الخادم.</small>}
        </aside>
      </div>
    </section>
  );
}

function OrderConfirm({ orderNo, orderId, onContinue }: { orderNo: string; orderId: string; onContinue: () => void }) {
  return (
    <section className="sf-confirm">
      <div className="sf-confirm-icon"><Check size={40} /></div>
      <h2>تم استلام طلبك بنجاح!</h2>
      <p>رقم الطلب: <strong>{orderNo}</strong></p>
      <p>الطلب الآن بانتظار مراجعة الإدارة. لن تظهر الأسعار أو الإجماليات في مستندات الطلب الخاصة بالعميل.</p>
      <p>بعد اعتماد الإدارة، ستجد حالة الطلب وتعليمات السداد عند الحاجة في صفحة التفاصيل.</p>
      <p>سنتواصل معك لتأكيد تفاصيل التوصيل. لا يمثل هذا إشعار دفع أو شحن.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}><Link to="/orders/$id" params={{ id: orderId }} className="sf-btn-secondary" style={{ textDecoration: 'none', padding: '10px 14px' }}>تفاصيل الطلب</Link><button className="sf-btn-primary" onClick={onContinue}>متابعة التسوق</button></div>
    </section>
  );
}

type MatrixFeedback = { kind: 'success' | 'error'; message: string };

function QuickOrderMatrix({ products, quantities, feedback, onQuantityChange, onAddSelected, onBack, onCart }: {
  products: ProductWithInventory[];
  quantities: Record<string, string>;
  feedback: MatrixFeedback | null;
  onQuantityChange: (productId: string, value: string) => void;
  onAddSelected: () => void;
  onBack: () => void;
  onCart: () => void;
}) {
  const selectedCount = products.filter((product) => Number(quantities[product.id] ?? 0) > 0).length;
  return (
    <section className="sf-collection">
      <button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للكتالوج</button>
      <div className="sf-products-head">
        <div><h2><ClipboardList size={21} /> الطلب السريع</h2><span>حدد كميات عدة أصناف في شاشة واحدة ثم أضفها إلى السلة. لا تعرض شاشة الطلب السريع أي أسعار أو إجماليات.</span></div>
        <div className="sf-discovery-links"><button onClick={onCart}><ShoppingCart size={15} /> عرض السلة</button></div>
      </div>
      <p style={{ margin: '0 0 14px', color: '#667b80', fontSize: 12 }} role="note">
        لا تُعرض الأسعار أو إجماليات الطلب هنا؛ يتحقق الخادم من الأصناف والكميات والمخزون ويعيد احتساب السعر داخليًا عند إرسال الطلب.
      </p>
      {feedback && <div role={feedback.kind === 'error' ? 'alert' : 'status'} style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, border: `1px solid ${feedback.kind === 'error' ? '#efc5c5' : '#b8e5d4'}`, background: feedback.kind === 'error' ? '#fff6f6' : '#f0fbf6', color: feedback.kind === 'error' ? '#9b2626' : '#17684d', fontSize: 13 }}>{feedback.message}</div>}
      {!products.length ? <div className="sf-empty"><Package size={30} /><span>لا توجد منتجات مطابقة للبحث الحالي</span><small>غيّر البحث أو التصنيف ثم حاول مجددًا.</small></div> :
        <div style={{ overflowX: 'auto', border: '1px solid #dfeaec', borderRadius: 14, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560, fontSize: 13 }}>
            <thead><tr style={{ background: '#f2f7f8', textAlign: 'right' }}>
              <th scope="col" style={{ padding: 12 }}>الصنف</th>
              <th scope="col" style={{ padding: 12 }}>الرمز</th>
              <th scope="col" style={{ padding: 12 }}>المتوفر</th>
              <th scope="col" style={{ padding: 12 }}>الكمية</th>
            </tr></thead>
            <tbody>{products.map((product) => {
              const available = Math.max(0, Math.floor(Number(product.inventory?.quantity_available ?? 0)));
              return <tr key={product.id} style={{ borderTop: '1px solid #edf2f3' }}>
                <td style={{ padding: 12, fontWeight: 800 }}><div>{product.name}</div><small style={{ display: 'block', color: '#74888c', fontWeight: 500 }}>{product.category?.name ?? 'غير مصنف'}</small></td>
                <td style={{ padding: 12, direction: 'ltr', textAlign: 'right' }}>{product.item_code}</td>
                <td style={{ padding: 12, whiteSpace: 'nowrap' }}>{formatNumber(available)} {product.unit}</td>
                <td style={{ padding: 12, minWidth: 110 }}><input type="number" inputMode="numeric" min={0} max={available} step={1} value={quantities[product.id] ?? ''} disabled={available <= 0} aria-label={`كمية ${product.name}`} onChange={(event) => { const value = event.target.value; if (value === '' || /^\d+$/.test(value)) onQuantityChange(product.id, value); }} style={{ width: 96, padding: '9px 10px', border: '1px solid #cfdddd', borderRadius: 9, background: available <= 0 ? '#f2f5f5' : '#fff', color: '#18383c' }} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        <span style={{ color: '#687e82', fontSize: 12 }}>{selectedCount} أصناف محددة ضمن النتائج الحالية</span>
        <button className="sf-btn-primary" onClick={onAddSelected} disabled={selectedCount === 0}><ClipboardList size={16} /> إضافة المحدد إلى السلة</button>
      </div>
    </section>
  );
}
