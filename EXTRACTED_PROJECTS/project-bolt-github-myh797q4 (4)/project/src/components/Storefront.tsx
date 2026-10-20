import { useMemo, useState } from 'react';
import {
  Activity, Minus, Plus, Search, ShoppingCart, Trash2,
  Package, Tag, Phone, MapPin, Mail, Check, ChevronLeft, Menu,
  Heart, GitCompare, ArrowRight,
} from 'lucide-react';
import { fetchProducts, fetchCategories, fetchPromotions, fetchSettingsMap, createOrder } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { ProductWithInventory, Category, Promotion } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { supabase, ORG_ID } from '@/lib/supabase';

type CartItem = { product: ProductWithInventory; quantity: number };
type StoreView = 'shop' | 'product' | 'wishlist' | 'compare' | 'cart' | 'checkout' | 'confirm';

export function Storefront({ onExit }: { onExit: () => void }) {
  const { data: products } = useFetch(fetchProducts);
  const { data: categories } = useFetch(fetchCategories);
  const { data: promotions } = useFetch(fetchPromotions);
  const { data: settings } = useFetch(fetchSettingsMap);
  const [view, setView] = useState<StoreView>('shop');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [lastOrderNo, setLastOrderNo] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductWithInventory | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.product.base_price * i.quantity, 0);

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
  function toggleWishlist(productId: string) { setWishlist((prev) => prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]); }
  function toggleCompare(productId: string) { setCompare((prev) => prev.includes(productId) ? prev.filter((id) => id !== productId) : prev.length >= 3 ? prev : [...prev, productId]); }
  function openProduct(product: ProductWithInventory) { setSelectedProduct(product); setView('product'); }

  const filtered = useMemo(() => {
    let list = products ?? [];
    if (activeCat) list = list.filter((p) => p.category_id === activeCat);
    if (query.trim()) list = list.filter((p) => `${p.name} ${p.item_code} ${p.barcode ?? ''}`.toLowerCase().includes(query.toLowerCase()));
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
          <div className="sf-header-links"><button onClick={() => setView('wishlist')}><Heart size={16} /> المفضلة <b>{wishlist.length}</b></button><button onClick={() => setView('compare')}><GitCompare size={16} /> مقارنة</button></div>
          <button className="sf-cart-btn" onClick={() => setView('cart')}><ShoppingCart size={20} /> {cartCount > 0 && <b>{cartCount}</b>}</button>
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

      <main className="sf-main">
        {view === 'shop' && (
          <>
            <section className="sf-hero" style={{ background: `linear-gradient(120deg, ${(settings?.theme_primary as string) ?? '#087f8d'}, ${(settings?.theme_accent as string) ?? '#0eaa97'})` }}>
              <div><span className="sf-hero-kicker">عرض خاص</span><h1>{(settings?.hero_title as string) ?? 'الأغبري — موردك الموثوق'}</h1><p>{(settings?.hero_subtitle as string) ?? 'مواد غذائية بالجملة بأسعار تنافسية وتوصيل سريع'}</p></div>
              <div className="sf-hero-badge"><Package size={28} /><div><strong>{formatNumber(products?.length ?? 0)}</strong><span>منتج متوفر</span></div></div>
            </section>

            {promotions && promotions.filter((p: Promotion) => p.is_active).length > 0 && (
              <section className="sf-promos">{promotions.filter((p) => p.is_active).map((p: Promotion) => <div className="sf-promo" key={p.id}><Tag size={16} /> <strong>{p.title}</strong> <span>{p.discount_value}% خصم</span></div>)}</section>
            )}

            <section className="sf-products">
              <div className="sf-products-head"><div><h2>المنتجات</h2><span>{formatNumber(filtered.length)} صنف متاح حسب بحثك وتصنيفك</span></div><div className="sf-discovery-links"><button onClick={() => setView('wishlist')}><Heart size={15} /> المفضلة</button><button onClick={() => setView('compare')}><GitCompare size={15} /> المقارنة ({compare.length}/3)</button></div></div>
              <ProductGrid products={filtered} wishlist={wishlist} compare={compare} onOpen={openProduct} onAdd={addToCart} onWishlist={toggleWishlist} onCompare={toggleCompare} />
            </section>
          </>
        )}

        {view === 'product' && selectedProduct && <ProductDetail product={selectedProduct} inWishlist={wishlist.includes(selectedProduct.id)} inCompare={compare.includes(selectedProduct.id)} onBack={() => setView('shop')} onAdd={() => addToCart(selectedProduct)} onWishlist={() => toggleWishlist(selectedProduct.id)} onCompare={() => toggleCompare(selectedProduct.id)} />}
        {view === 'wishlist' && <CollectionView title="المفضلة" icon={Heart} products={(products ?? []).filter((p) => wishlist.includes(p.id))} wishlist={wishlist} compare={compare} onOpen={openProduct} onAdd={addToCart} onWishlist={toggleWishlist} onCompare={toggleCompare} onBack={() => setView('shop')} empty="لم تضف أي منتج إلى المفضلة بعد" />}
        {view === 'compare' && <CollectionView title="مقارنة المنتجات" icon={GitCompare} products={(products ?? []).filter((p) => compare.includes(p.id))} wishlist={wishlist} compare={compare} onOpen={openProduct} onAdd={addToCart} onWishlist={toggleWishlist} onCompare={toggleCompare} onBack={() => setView('shop')} empty="اختر حتى ثلاثة منتجات من الكتالوج للمقارنة" />}

        {view === 'cart' && (
          <section className="sf-cart-page">
            <h2>سلة المشتريات</h2>
            {!cart.length ? <div className="sf-empty"><ShoppingCart size={30} /><span>سلتك فارغة</span><button className="sf-link" onClick={() => setView('shop')}>تصفح المنتجات</button></div> :
            <>
              <div className="sf-cart-list">
                {cart.map((item) => (
                  <div className="sf-cart-row" key={item.product.id}>
                    <div className="sf-cart-info"><div className="sf-cart-img"><Package size={20} /></div><div><strong>{item.product.name}</strong><span>{formatCurrency(item.product.base_price)} / {item.product.unit}</span></div></div>
                    <div className="sf-cart-qty"><button onClick={() => updateQty(item.product.id, -1)}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => updateQty(item.product.id, 1)}><Plus size={14} /></button></div>
                    <strong className="sf-cart-line">{formatCurrency(item.product.base_price * item.quantity)}</strong>
                    <button className="sf-cart-remove" onClick={() => removeFromCart(item.product.id)}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <div className="sf-cart-total"><span>الإجمالي</span><strong>{formatCurrency(cartTotal)}</strong></div>
              <div className="sf-cart-actions"><button className="sf-btn-secondary" onClick={() => setView('shop')}>متابعة التسوق</button><button className="sf-btn-primary" onClick={() => setView('checkout')}>إتمام الطلب <ChevronLeft size={16} /></button></div>
            </>
            }
          </section>
        )}

        {view === 'checkout' && <Checkout cart={cart} total={cartTotal} onBack={() => setView('cart')} onComplete={(orderNo) => { setLastOrderNo(orderNo); setView('confirm'); setCart([]); }} />}
        {view === 'confirm' && <OrderConfirm orderNo={lastOrderNo} onContinue={() => setView('shop')} />}
      </main>

      <footer className="sf-footer">
        <div className="sf-footer-inner">
          <div className="sf-footer-brand"><Activity size={20} /> <strong>{(settings?.store_name as string) ?? 'الأغبري'}</strong></div>
          <div className="sf-footer-info"><Phone size={15} /> {(settings?.store_phone as string) ?? '+967-1-234-567'}</div>
          <div className="sf-footer-info"><Mail size={15} /> {(settings?.store_email as string) ?? 'info@aghbari.ye'}</div>
          <div className="sf-footer-info"><MapPin size={15} /> {(settings?.store_address as string) ?? 'صنعاء، اليمن'}</div>
        </div>
      </footer>
    </div>
  );
}

function ProductGrid({ products, wishlist, compare, onOpen, onAdd, onWishlist, onCompare }: { products: ProductWithInventory[]; wishlist: string[]; compare: string[]; onOpen: (product: ProductWithInventory) => void; onAdd: (product: ProductWithInventory) => void; onWishlist: (id: string) => void; onCompare: (id: string) => void }) {
  if (!products.length) return <div className="sf-empty"><Package size={30} /><span>لا توجد منتجات مطابقة</span><small>جرّب تغيير البحث أو التصنيف</small></div>;
  return <div className="sf-product-grid">{products.map((product) => { const qty = product.inventory?.quantity_available ?? 0; const out = qty <= 0; const liked = wishlist.includes(product.id); const compared = compare.includes(product.id); return <article className="sf-product-card" key={product.id}><div className="sf-product-img" onClick={() => onOpen(product)}>{product.image_url ? <img src={product.image_url} alt={product.name} /> : <Package size={36} />}<div className="sf-card-actions"><button aria-label="إضافة للمفضلة" className={liked ? 'active' : ''} onClick={(event) => { event.stopPropagation(); onWishlist(product.id); }}><Heart size={16} fill={liked ? 'currentColor' : 'none'} /></button><button aria-label="إضافة للمقارنة" className={compared ? 'active' : ''} onClick={(event) => { event.stopPropagation(); onCompare(product.id); }}><GitCompare size={16} /></button></div></div><button className="sf-product-body sf-product-open" onClick={() => onOpen(product)}><h3>{product.name}</h3><p>{product.category?.name ?? 'غير مصنف'} · {product.item_code}</p><div className="sf-product-price"><strong>{formatCurrency(product.base_price)}</strong><span>{product.unit}</span></div><div className="sf-product-stock">{out ? <span className="sf-out">نفد المخزون</span> : <span className="sf-in">{formatNumber(qty)} متوفر</span>}</div></button><button className="sf-add-btn" disabled={out} onClick={() => onAdd(product)}>{out ? 'غير متوفر' : <><Plus size={16} /> أضف للسلة</>}</button></article>; })}</div>;
}

function ProductDetail({ product, inWishlist, inCompare, onBack, onAdd, onWishlist, onCompare }: { product: ProductWithInventory; inWishlist: boolean; inCompare: boolean; onBack: () => void; onAdd: () => void; onWishlist: () => void; onCompare: () => void }) {
  const quantity = product.inventory?.quantity_available ?? 0;
  return <section className="sf-product-detail"><button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للكتالوج</button><div className="sf-detail-layout"><div className="sf-detail-image">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <Package size={72} />}<span className="sf-detail-code">SKU: {product.item_code}</span></div><div className="sf-detail-content"><span className="sf-detail-category">{product.category?.name ?? 'غير مصنف'}</span><h2>{product.name}</h2><p className="sf-detail-description">{product.description || 'منتج متوفر للطلب بالجملة من متجر الأغبري.'}</p><div className="sf-detail-price"><strong>{formatCurrency(product.base_price)}</strong><span>لكل {product.unit}</span></div><div className={`sf-detail-stock ${quantity > 0 ? 'available' : 'unavailable'}`}>{quantity > 0 ? `متوفر حالياً: ${formatNumber(quantity)} ${product.unit}` : 'هذا المنتج غير متوفر حالياً'}</div><div className="sf-detail-actions"><button className="sf-btn-primary" disabled={quantity <= 0} onClick={onAdd}><ShoppingCart size={17} /> إضافة إلى السلة</button><button className={`sf-icon-action ${inWishlist ? 'active' : ''}`} onClick={onWishlist}><Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} /> {inWishlist ? 'في المفضلة' : 'أضف للمفضلة'}</button><button className={`sf-icon-action ${inCompare ? 'active' : ''}`} onClick={onCompare}><GitCompare size={18} /> مقارنة</button></div><div className="sf-detail-facts"><div><strong>الوحدة</strong><span>{product.unit}</span></div><div><strong>الحد الأدنى</strong><span>حسب اتفاق العميل</span></div><div><strong>السعر</strong><span>السعر الظاهر قبل تأكيد الطلب</span></div></div></div></div></section>;
}

function CollectionView({ title, icon: Icon, products, wishlist, compare, onOpen, onAdd, onWishlist, onCompare, onBack, empty }: { title: string; icon: typeof Heart; products: ProductWithInventory[]; wishlist: string[]; compare: string[]; onOpen: (product: ProductWithInventory) => void; onAdd: (product: ProductWithInventory) => void; onWishlist: (id: string) => void; onCompare: (id: string) => void; onBack: () => void; empty: string }) {
  return <section className="sf-collection"><button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للمتجر</button><div className="sf-products-head"><div><h2><Icon size={21} /> {title}</h2><span>{products.length} منتجات</span></div></div>{products.length ? <ProductGrid products={products} wishlist={wishlist} compare={compare} onOpen={onOpen} onAdd={onAdd} onWishlist={onWishlist} onCompare={onCompare} /> : <div className="sf-empty"><Icon size={32} /><span>{empty}</span><button className="sf-link" onClick={onBack}>تصفح الكتالوج</button></div>}</section>;
}

function Checkout({ cart, total, onBack, onComplete }: { cart: CartItem[]; total: number; onBack: () => void; onComplete: (orderNo: string) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim() || !phone.trim()) { setError('الاسم ورقم الهاتف مطلوبان'); return; }
    setSubmitting(true); setError('');
    try {
      const { data: existing } = await supabase.from('customers').select('id').eq('business_name', business || name).limit(1).maybeSingle();
      let customerId = existing?.id;
      if (!customerId) {
        const { data: newCust } = await supabase.from('customers').insert({
          organization_id: ORG_ID,
          customer_code: `CUST-${Date.now().toString().slice(-6)}`,
          business_name: business || name,
          contact_name: name,
          phone,
          tier: 'retail',
          status: 'pending',
        }).select().single();
        customerId = newCust?.id;
      }
      if (!customerId) throw new Error('تعذر إنشاء العميل');
      const order = await createOrder({
        customer_id: customerId,
        items: cart.map((i) => ({ product_id: i.product.id, item_code: i.product.item_code, product_name: i.product.name, unit: i.product.unit, quantity: i.quantity, unit_price: i.product.base_price })),
        notes,
      });
      onComplete(order.order_number);
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
          <label className="sf-form-field"><span>ملاحظات</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات على الطلب..." /></label>
          {error && <div className="sf-form-error">{error}</div>}
          <div className="sf-checkout-actions"><button className="sf-btn-secondary" onClick={onBack}>رجوع</button><button className="sf-btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'جار الإرسال...' : 'تأكيد الطلب'}</button></div>
        </div>
        <aside className="sf-checkout-summary">
          <h3>ملخص الطلب</h3>
          {cart.map((i) => <div className="sf-summary-row" key={i.product.id}><span>{i.product.name}</span><small>{i.quantity} × {formatCurrency(i.product.base_price)}</small></div>)}
          <div className="sf-summary-total"><span>الإجمالي</span><strong>{formatCurrency(total)}</strong></div>
        </aside>
      </div>
    </section>
  );
}

function OrderConfirm({ orderNo, onContinue }: { orderNo: string; onContinue: () => void }) {
  return (
    <section className="sf-confirm">
      <div className="sf-confirm-icon"><Check size={40} /></div>
      <h2>تم استلام طلبك بنجاح!</h2>
      <p>رقم الطلب: <strong>{orderNo}</strong></p>
      <p>سنتواصل معك قريباً لتأكيد الطلب وتفاصيل التوصيل.</p>
      <button className="sf-btn-primary" onClick={onContinue}>متابعة التسوق</button>
    </section>
  );
}
