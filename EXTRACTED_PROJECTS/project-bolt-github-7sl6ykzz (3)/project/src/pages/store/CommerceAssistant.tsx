import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchProducts } from '../../lib/api'
import { useAuthStore } from '../../lib/authStore'
import { formatPrice } from '../../lib/pricing'
import { Sparkles, Send, ShoppingBag, TrendingUp, Package, AlertTriangle, User } from 'lucide-react'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  data?: Record<string, unknown>
}

type QuickPrompt = {
  label: string
  icon: typeof ShoppingBag
  prompt: string
}

const QUICK_PROMPTS: QuickPrompt[] = [
  { label: 'كم عدد الطلبات اليوم؟', icon: ShoppingBag, prompt: 'كم عدد الطلبات اليوم؟' },
  { label: 'ما هي المنتجات الأكثر مبيعاً؟', icon: TrendingUp, prompt: 'ما هي المنتجات الأكثر مبيعاً؟' },
  { label: 'ما هي المنتجات منخفضة المخزون؟', icon: AlertTriangle, prompt: 'ما هي المنتجات منخفضة المخزون؟' },
  { label: 'كم عدد العملاء النشطين؟', icon: User, prompt: 'كم عدد العملاء النشطين؟' },
  { label: 'كم إجمالي المبيعات هذا الشهر؟', icon: TrendingUp, prompt: 'كم إجمالي المبيعات هذا الشهر؟' },
  { label: 'ما هي المنتجات المتاحة؟', icon: Package, prompt: 'ما هي المنتجات المتاحة؟' },
]

export default function CommerceAssistant() {
  const { session } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'مرحباً! أنا مساعد الأغبري الذكي. يمكنني مساعدتك في معرفة حالة الطلبات، المبيعات، المخزون، العملاء، والمنتجات. كيف يمكنني مساعدتك اليوم؟' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setLoading(true)

    try {
      const response = await generateResponse(trimmed)
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.' }])
    } finally {
      setLoading(false)
    }
  }, [loading])

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
          <Sparkles size={32} color="#fff" />
        </div>
        <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>مساعد الأغبري الذكي</h1>
        <p className="text-muted" style={{ fontSize: '14px' }}>اسألني عن الطلبات، المبيعات، المخزون، العملاء، والمنتجات</p>
      </div>

      {/* Chat container */}
      <div className="card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '480px' }}>
        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end',
            }}>
              <div style={{
                maxWidth: '75%',
                padding: '12px 16px',
                borderRadius: 'var(--radius-lg)',
                fontSize: '14px',
                lineHeight: '1.6',
                background: msg.role === 'user' ? 'var(--color-bg-alt)' : 'var(--color-primary)',
                color: msg.role === 'user' ? 'var(--color-text)' : '#fff',
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--color-primary)', color: '#fff', fontSize: '14px' }}>
                <span style={{ display: 'inline-flex', gap: '4px' }}>
                  <span className="dot-pulse" />
                  <span className="dot-pulse" />
                  <span className="dot-pulse" />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px', display: 'flex', gap: '8px' }}>
          <input
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(input) }}
            placeholder="اكتب سؤالك هنا..."
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={() => handleSend(input)} disabled={loading || !input.trim()}>
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Quick prompts */}
      <div style={{ marginTop: '20px' }}>
        <h3 style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>أسئلة سريعة</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {QUICK_PROMPTS.map(qp => (
            <button
              key={qp.label}
              className="btn btn-secondary btn-sm"
              onClick={() => handleSend(qp.prompt)}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <qp.icon size={14} /> {qp.label}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .dot-pulse {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255,255,255,0.6);
          animation: dotPulse 1.4s infinite ease-in-out;
        }
        .dot-pulse:nth-child(2) { animation-delay: 0.2s; }
        .dot-pulse:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; }
          40% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

async function generateResponse(question: string): Promise<string> {
  const q = question.toLowerCase()

  // Check if user is authenticated
  if (!supabase) return 'يرجى تسجيل الدخول للاستفادة من المساعد.'

  // Executive analytics
  if (q.includes('تقرير') || q.includes('تحليل') || q.includes('إجمالي') || q.includes('المبيعات') || q.includes('الشهر') || q.includes('اليوم')) {
    try {
      const { data } = await supabase.rpc('get_executive_analytics')
      if (data) {
        const a = data as Record<string, unknown>
        if (q.includes('اليوم')) return `مبيعات اليوم: ${formatPrice(Number(a.today_revenue || 0))}\nعدد الطلبات: ${a.total_orders}`
        if (q.includes('الشهر')) {
          const growth = Number(a.revenue_growth || 0)
          return `مبيعات هذا الشهر: ${formatPrice(Number(a.month_revenue || 0))}\nمبيعات الشهر السابق: ${formatPrice(Number(a.prev_month_revenue || 0))}\n${growth > 0 ? 'نمو' : 'انخفاض'}: ${Math.abs(growth)}%`
        }
        return `إجمالي المبيعات: ${formatPrice(Number(a.total_revenue || 0))}\nعدد الطلبات: ${a.total_orders}\nعدد العملاء: ${a.total_customers}\nعدد المنتجات: ${a.total_products}\nمتوسط قيمة الطلب: ${formatPrice(Number(a.avg_order_value || 0))}`
      }
    } catch { /* fall through */ }
  }

  // Orders
  if (q.includes('طلب') || q.includes('الطلبات')) {
    try {
      const { data } = await supabase.rpc('fetch_staff_orders')
      const orders = (data || []) as Array<Record<string, unknown>>
      if (q.includes('اليوم')) {
        const today = orders.filter(o => new Date(o.created_at as string).toDateString() === new Date().toDateString())
        return `عدد طلبات اليوم: ${today.length}\n${today.slice(0, 3).map(o => `• ${o.order_number} — ${formatPrice(Number(o.total_amount || 0))}`).join('\n')}`
      }
      return `إجمالي الطلبات: ${orders.length}\nآخر 3 طلبات:\n${orders.slice(0, 3).map(o => `• ${o.order_number} — ${formatPrice(Number(o.total_amount || 0))} — ${o.status}`).join('\n')}`
    } catch { /* fall through */ }
  }

  // Products / top selling
  if (q.includes('منتج') || q.includes('الأكثر') || q.includes('مبيع') || q.includes('الأصناف') || q.includes('المتاحة')) {
    try {
      const { data } = await supabase.rpc('get_executive_analytics')
      if (data) {
        const a = data as Record<string, unknown>
        const topRev = (a.top_products_revenue || []) as Array<Record<string, unknown>>
        if (q.includes('الأكثر') || q.includes('مبيع')) {
          if (topRev.length > 0) {
            return `الأكثر مبيعاً:\n${topRev.slice(0, 5).map(p => `• ${p.product_name} — ${formatPrice(Number(p.revenue || 0))} (${p.quantity} وحدة)`).join('\n')}`
          }
          return 'لا توجد بيانات مبيعات كافية بعد.'
        }
        return `عدد المنتجات النشطة: ${a.total_products}`
      }
    } catch { /* fall through */ }
    try {
      const products = await fetchProducts()
      return `عدد المنتجات المتاحة: ${products.length}\nأحدث 3 منتجات:\n${products.slice(0, 3).map(p => `• ${p.name} — ${p.item_code}`).join('\n')}`
    } catch { /* fall through */ }
  }

  // Low stock
  if (q.includes('مخزون') || q.includes('منخفض') || q.includes('نفد') || q.includes('إعادة طلب')) {
    try {
      const { data } = await supabase.rpc('get_executive_analytics')
      if (data) {
        const a = data as Record<string, unknown>
        const lowStock = (a.low_stock_items || []) as Array<Record<string, unknown>>
        if (lowStock.length > 0) {
          return `عدد الأصناف منخفضة المخزون: ${a.low_stock_count}\n${lowStock.slice(0, 5).map(i => `• ${i.name} — المتبقي: ${i.quantity_on_hand} ${i.unit} (حد الطلب: ${i.reorder_point})`).join('\n')}`
        }
        return 'المخزون في حالة جيدة، لا توجد أصناف منخفضة.'
      }
    } catch { /* fall through */ }
  }

  // Customers
  if (q.includes('عميل') || q.includes('العملاء') || q.includes('نشط')) {
    try {
      const { data } = await supabase.rpc('get_executive_analytics')
      if (data) {
        const a = data as Record<string, unknown>
        const topCust = (a.top_customers || []) as Array<Record<string, unknown>>
        return `إجمالي العملاء: ${a.total_customers}\nأفضل 3 عملاء:\n${topCust.slice(0, 3).map(c => `• ${c.business_name || c.contact_name} — ${formatPrice(Number(c.total_revenue || 0))} (${c.order_count} طلبات)`).join('\n')}`
      }
    } catch { /* fall through */ }
  }

  // Recommendations
  if (q.includes('توصية') || q.includes('نصيحة') || q.includes('ماذا أفعل') || q.includes('اقتراح')) {
    try {
      const { data } = await supabase.rpc('get_executive_analytics')
      if (data) {
        const a = data as Record<string, unknown>
        const recs = (a.recommendations || []) as Array<Record<string, unknown>>
        if (recs.length > 0) {
          return `لدي ${recs.length} توصية ذكية:\n${recs.map((r, i) => `${i + 1}. ${r.title}\n   ${r.description}`).join('\n')}`
        }
        return 'لا توجد توصيات حالياً، النظام يعمل بشكل جيد!'
      }
    } catch { /* fall through */ }
  }

  // Greetings
  if (q.includes('مرحبا') || q.includes('السلام') || q.includes('هاي') || q.includes('hello')) {
    return 'مرحباً بك! أنا مساعد الأغبري الذكي. يمكنني مساعدتك بمعرفة حالة المتجر، المبيعات، الطلبات، المخزون، والعملاء. ماذا تريد أن تعرف؟'
  }

  // Default
  return 'يمكنني مساعدتك في:\n• تقارير المبيعات (اليوم، الشهر، الإجمالي)\n• حالة الطلبات\n• المنتجات الأكثر مبيعاً\n• المخزون المنخفض\n• بيانات العملاء\n• التوصيات الذكية\n\nجرّب أحد الأسئلة السريعة بالأسفل!'
}
