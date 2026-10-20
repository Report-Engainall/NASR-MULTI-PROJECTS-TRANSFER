import { useState, useMemo, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { useBlocker } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

const card: CSSProperties = { background: 'var(--card, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: 16 };
const quiet: CSSProperties = { margin: 0, color: 'var(--muted-foreground, #64748b)', fontSize: 13 };
const field: CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', background: 'var(--background, #fff)', font: 'inherit' };
import {
  AlertTriangle, Bell, Bot, Check, ChevronLeft, Database,
  Package, Plus, RefreshCw, Search, Settings, Smartphone,
  X, ExternalLink, Save, Download,
} from 'lucide-react';
import {
  fetchAiAlerts, fetchAiTasks, fetchNotifications, fetchOrders, fetchOrderItems,
  fetchSettings, fetchSuppliers, fetchAdminStorefrontAnnouncements, saveStorefrontAnnouncement,
  markAllNotificationsRead, markNotificationRead, resolveAiAlert, toggleAiTaskStatus,
  updateOrderStatus, reviewOrderLines, updateSetting, createSupplier,
  fetchAiGatewayBudget, configureAiGatewayBudget, testAiGatewayConnection,
  type AiGatewayBudget,
} from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { formatCurrency, formatDateShort, formatNumber, timeAgo } from '@/lib/format';
import type { AiAlert, AiTask, Notification, Supplier, AdminSetting, OrderItem, StorefrontAnnouncement, StorefrontAnnouncementAudience, StorefrontAnnouncementInput } from '@/lib/types';
import { buildOnyxOrderWorkbook, onyxOrderWorkbookFilename } from '@/lib/onyx-export';

import type { LucideIcon } from 'lucide-react';
import { getCurrentTenantScope, supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
type IconType = LucideIcon;

export function Notifications({ onNotice }: { onNotice: (m: string) => void }) {
  const { data, loading, error, refetch } = useFetch(fetchNotifications);
  const unread = data?.filter((n) => !n.is_read).length ?? 0;
  async function readAll() { try { await markAllNotificationsRead(); refetch(); onNotice('تم تعليم الكل كمقروء'); } catch (e) { onNotice(e instanceof Error ? e.message : 'خطأ'); } }
  async function readOne(id: string) { try { await markNotificationRead(id); refetch(); } catch { /* ignore */ } }
  return <AdminPage eyebrow="النظام" title="التنبيهات" description="كل رسائل النظام والتنبيهات في مكان واحد" icon={Bell} note={`${data?.length ?? 0} تنبيه — ${unread} غير مقروء`} toolbar={<><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button>{unread > 0 && <Button onClick={readAll}>تعليم الكل كمقروء</Button>}</>}>
    {loading ? <Loading /> : error ? <ErrorBox message={error} /> : <div className="notif-list">{data?.map((n: Notification) => <div className={`notif-row ${n.is_read ? 'read' : ''}`} key={n.id} onClick={() => !n.is_read && readOne(n.id)}><span className={`notif-type ${n.type}`}><Bell size={16} /></span><div><strong>{n.title}</strong><p>{n.body ?? '—'}</p><small>{timeAgo(n.created_at)}</small></div>{!n.is_read && <span className="notif-dot" />}</div>)}</div>}
  </AdminPage>;
}

type AiGatewayDraft = {
  ai_enabled: boolean;
  fallback_enabled: boolean;
  primary_provider: 'openai_compatible' | 'gemini';
  primary_model: string;
  primary_base_url: string;
  fallback_provider: 'openai_compatible' | 'gemini';
  fallback_model: string;
  fallback_base_url: string;
  daily_cost_limit: string;
  monthly_cost_limit: string;
  daily_token_limit: string;
  monthly_token_limit: string;
  per_request_cost_limit: string;
};

const defaultAiGatewayDraft: AiGatewayDraft = {
  ai_enabled: false, fallback_enabled: true,
  primary_provider: 'openai_compatible', primary_model: 'gpt-4o-mini', primary_base_url: 'https://api.openai.com/v1',
  fallback_provider: 'gemini', fallback_model: 'gemini-2.0-flash', fallback_base_url: 'https://generativelanguage.googleapis.com/v1beta',
  daily_cost_limit: '1', monthly_cost_limit: '20', daily_token_limit: '50000', monthly_token_limit: '1000000', per_request_cost_limit: '0.05',
};

export function AiCenter({ onNotice }: { onNotice: (m: string) => void }) {
  const { user } = useAuth();
  const canManageGateway = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const { data: alerts, loading: aLoading, refetch: rAlerts } = useFetch(fetchAiAlerts);
  const { data: tasks, loading: tLoading, refetch: rTasks } = useFetch(fetchAiTasks);
  const [tab, setTab] = useState<'alerts' | 'tasks'>('alerts');
  const [gateway, setGateway] = useState<AiGatewayBudget | null>(null);
  const [draft, setDraft] = useState<AiGatewayDraft>(defaultAiGatewayDraft);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewaySaving, setGatewaySaving] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [gatewayMessage, setGatewayMessage] = useState('');
  const [gatewayError, setGatewayError] = useState('');

  useEffect(() => {
    if (!canManageGateway) return;
    let active = true;
    setGatewayLoading(true);
    void fetchAiGatewayBudget().then((value) => {
      if (!active) return;
      setGateway(value);
      setDraft({
        ai_enabled: value.ai_enabled,
        fallback_enabled: value.fallback_enabled,
        primary_provider: value.primary_provider,
        primary_model: value.primary_model,
        primary_base_url: value.primary_base_url,
        fallback_provider: value.fallback_provider,
        fallback_model: value.fallback_model,
        fallback_base_url: value.fallback_base_url,
        daily_cost_limit: String(value.daily_cost_limit || ''),
        monthly_cost_limit: String(value.monthly_cost_limit || ''),
        daily_token_limit: String(value.daily_token_limit || ''),
        monthly_token_limit: String(value.monthly_token_limit || ''),
        per_request_cost_limit: String(value.per_request_cost_limit || ''),
      });
      setGatewayError('');
    }).catch((error: unknown) => {
      if (active) setGatewayError(error instanceof Error ? error.message : 'تعذر تحميل إعدادات الذكاء.');
    }).finally(() => { if (active) setGatewayLoading(false); });
    return () => { active = false; };
  }, [canManageGateway]);

  function patchGateway(patch: Partial<AiGatewayDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setGatewayMessage('');
  }
  async function saveGateway() {
    const daily = Number(draft.daily_cost_limit), monthly = Number(draft.monthly_cost_limit);
    const dailyTokens = Number(draft.daily_token_limit), monthlyTokens = Number(draft.monthly_token_limit);
    const perRequest = Number(draft.per_request_cost_limit);
    if (![daily,monthly,dailyTokens,monthlyTokens,perRequest].every(Number.isFinite) ||
        daily < 0 || monthly < daily || dailyTokens < 0 || monthlyTokens < dailyTokens ||
        perRequest < 0 || perRequest > daily || perRequest > monthly ||
        (draft.ai_enabled && (daily <= 0 || monthly <= 0 || dailyTokens <= 0 || monthlyTokens <= 0 || perRequest <= 0))) {
      setGatewayError('تحقق من حدود التكلفة والرموز. عند التفعيل يجب أن تكون الحدود موجبة، والحد اليومي لا يتجاوز الشهري.');
      return;
    }
    setGatewaySaving(true); setGatewayError(''); setGatewayMessage('');
    try {
      const saved = await configureAiGatewayBudget({
        ...draft, daily_cost_limit: daily, monthly_cost_limit: monthly,
        daily_token_limit: dailyTokens, monthly_token_limit: monthlyTokens, per_request_cost_limit: perRequest,
      });
      setGateway(saved);
      setGatewayMessage('حُفظت الإعدادات والحدود لهذه المؤسسة. لم يتم حفظ أي مفتاح سري في قاعدة البيانات.');
      onNotice('تم حفظ إعدادات بوابة الذكاء وحدود الاستهلاك.');
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'تعذر حفظ إعدادات الذكاء.');
    } finally { setGatewaySaving(false); }
  }
  async function testGateway() {
    setConnectionBusy(true); setGatewayError(''); setGatewayMessage('');
    try {
      const result = await testAiGatewayConnection();
      setGatewayMessage('نجح اتصال المزود: ' + (result.provider ?? '') + ' / ' + (result.model ?? '') +
        (result.fallback_used ? ' (عبر المزود الاحتياطي)' : '') + '. تم تسجيل الاستهلاك.');
      onNotice('اجتاز مزود الذكاء اختبار الاتصال.');
      const latest = await fetchAiGatewayBudget(); setGateway(latest);
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'فشل اختبار اتصال المزود.');
    } finally { setConnectionBusy(false); }
  }

  async function resolve(id: string) { try { await resolveAiAlert(id); rAlerts(); onNotice('تم حل التنبيه'); } catch (e) { onNotice(e instanceof Error ? e.message : 'خطأ'); } }
  async function taskAction(id: string, status: string) { try { await toggleAiTaskStatus(id, status); rTasks(); onNotice(status === 'completed' ? 'تم إنجاز المهمة' : 'تم تحديث المهمة'); } catch (e) { onNotice(e instanceof Error ? e.message : 'خطأ'); } }

  return <AdminPage eyebrow="الذكاء الاصطناعي" title="مركز الذكاء" description="تنبيهات ومهام ومزودون بحدود استهلاك واضحة" icon={Bot} note={`${alerts?.filter((a) => !a.is_resolved).length ?? 0} تنبيه نشط — ${tasks?.filter((t) => t.status !== 'completed').length ?? 0} مهمة معلقة`} toolbar={<Button variant="secondary" onClick={() => { rAlerts(); rTasks(); }}><RefreshCw size={16} /> تحديث</Button>}>
    {canManageGateway && <section style={{ ...card, display: 'grid', gap: 14 }}>
      <div><h2 style={{ margin: 0, fontSize: 19 }}>بوابة الذكاء والميزانية</h2><p style={quiet}>المفاتيح لا تُحفظ هنا. خزّنها كأسرار Edge Function ثم اختبر الاتصال بعد الحفظ.</p></div>
      {gatewayLoading ? <Loading /> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>المزود الأساسي
            <select style={field} value={draft.primary_provider} onChange={(e) => patchGateway({ primary_provider: e.target.value as AiGatewayDraft['primary_provider'], primary_base_url: e.target.value === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://api.openai.com/v1' })}>
              <option value="openai_compatible">OpenAI Compatible: OpenAI / OpenRouter / Groq / Together / DeepSeek / Mistral</option><option value="gemini">Google Gemini</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>معرف نموذج المزود الأساسي
            <input style={field} value={draft.primary_model} maxLength={160} onChange={(e) => patchGateway({ primary_model: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>عنوان API الأساسي (HTTPS)
            <input style={field} type="url" value={draft.primary_base_url} maxLength={500} onChange={(e) => patchGateway({ primary_base_url: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>المزود الاحتياطي
            <select style={field} value={draft.fallback_provider} onChange={(e) => patchGateway({ fallback_provider: e.target.value as AiGatewayDraft['fallback_provider'], fallback_base_url: e.target.value === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://api.openai.com/v1' })}>
              <option value="openai_compatible">OpenAI Compatible / OpenRouter</option><option value="gemini">Google Gemini</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>معرف النموذج الاحتياطي
            <input style={field} value={draft.fallback_model} maxLength={160} onChange={(e) => patchGateway({ fallback_model: e.target.value })} disabled={!draft.fallback_enabled} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>عنوان API الاحتياطي (HTTPS)
            <input style={field} type="url" value={draft.fallback_base_url} maxLength={500} onChange={(e) => patchGateway({ fallback_base_url: e.target.value })} disabled={!draft.fallback_enabled} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
          {([
            ['daily_cost_limit','حد التكلفة اليومي (USD)'],
            ['monthly_cost_limit','حد التكلفة الشهري (USD)'],
            ['per_request_cost_limit','حد التكلفة للطلب (USD)'],
            ['daily_token_limit','حد الرموز اليومي'],
            ['monthly_token_limit','حد الرموز الشهري'],
          ] as const).map(([key,label]) => <label key={key} style={{ display: 'grid', gap: 6 }}>{label}
            <input style={field} type="number" min="0" step={key.includes('token') ? '1' : '0.000001'} value={draft[key]} onChange={(e) => patchGateway({ [key]: e.target.value } as Partial<AiGatewayDraft>)} />
          </label>)}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={draft.ai_enabled} onChange={(e) => patchGateway({ ai_enabled: e.target.checked })} /> تفعيل مزود الذكاء</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={draft.fallback_enabled} onChange={(e) => patchGateway({ fallback_enabled: e.target.checked })} /> استخدام المزود الاحتياطي عند الفشل</label>
        </div>
        {gateway && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
          <div style={card}><span style={quiet}>التكلفة اليوم</span><strong style={{ display: 'block' }}>{Number(gateway.today_cost).toFixed(4)} USD</strong></div>
          <div style={card}><span style={quiet}>التكلفة هذا الشهر</span><strong style={{ display: 'block' }}>{Number(gateway.month_cost).toFixed(4)} USD</strong></div>
          <div style={card}><span style={quiet}>الرموز اليوم</span><strong style={{ display: 'block' }}>{formatNumber(gateway.today_tokens)}</strong></div>
          <div style={card}><span style={quiet}>الرموز هذا الشهر</span><strong style={{ display: 'block' }}>{formatNumber(gateway.month_tokens)}</strong></div>
        </div>}
        <p style={quiet}>أسرار الخادم المطلوبة عند استخدام المزود: AI_OPENAI_COMPATIBLE_API_KEY وAI_GEMINI_API_KEY، وأسعار الرمز AI_OPENAI_COMPATIBLE_INPUT_COST_PER_1K / OUTPUT_COST_PER_1K وAI_GEMINI_INPUT_COST_PER_1K / OUTPUT_COST_PER_1K. ضع القيمة صفرًا للمزود المجاني؛ لا تدخل المفاتيح في الحقول أو قاعدة البيانات.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={() => void saveGateway()} disabled={gatewaySaving || connectionBusy}>{gatewaySaving ? 'جارٍ الحفظ...' : 'حفظ الميزانية والمزود'}</Button>
          <Button variant="secondary" onClick={() => void testGateway()} disabled={gatewaySaving || connectionBusy || !draft.ai_enabled}>{connectionBusy ? 'جارٍ اختبار الاتصال...' : 'اختبار الاتصال'}</Button>
        </div>
        {gatewayMessage && <p role="status" style={card}>{gatewayMessage}</p>}
        {gatewayError && <ErrorBox message={gatewayError} />}
      </>}
    </section>}
    <div className="ai-tabs"><button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}><AlertTriangle size={16} /> التنبيهات</button><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}><Check size={16} /> المهام</button></div>
    {tab === 'alerts' ? (aLoading ? <Loading /> : <div className="ai-alert-list">{alerts?.filter((a: AiAlert) => !a.is_resolved).map((a: AiAlert) => <div className="ai-alert-row" key={a.id}><span className={`ai-severity ${a.severity}`}><AlertTriangle size={18} /></span><div><strong>{a.title}</strong><p>{a.body ?? '—'}</p><small>{timeAgo(a.created_at)}</small></div><Button variant="outline" onClick={() => resolve(a.id)}>حل</Button></div>)}{!alerts?.filter((a) => !a.is_resolved).length && <Empty text="لا توجد تنبيهات نشطة" />}</div>) : (tLoading ? <Loading /> : <div className="ai-task-list">{tasks?.filter((t: AiTask) => t.status !== 'completed').map((t: AiTask) => <div className="ai-task-row" key={t.id}><span className={`ai-priority ${t.priority}`} /><div><strong>{t.title}</strong><p>{t.description ?? '—'}</p><small>{timeAgo(t.created_at)}</small></div><div className="ai-task-actions"><Button variant="outline" onClick={() => taskAction(t.id, 'in_progress')}>بدء</Button><Button onClick={() => taskAction(t.id, 'completed')}>إنجاز</Button></div></div>)}{!tasks?.filter((t) => t.status !== 'completed').length && <Empty text="لا توجد مهام معلقة" />}</div>)}
  </AdminPage>;
}
type OrderReviewDraft = { quantity: string; unitPrice: string; reason: string };

export function OrderDetail({ orderId, onBack, onNotice, onBlockedChange }: { orderId: string; onBack: () => void; onNotice: (m: string) => void; onBlockedChange: (blocked: boolean) => void }) {
  const { data: orders, refetch: refetchOrders } = useFetch(fetchOrders);
  const { data: items, loading, error, refetch } = useFetch(() => fetchOrderItems(orderId), [orderId]);
  const order = orders?.find((o) => o.id === orderId);
  const canExportOnyxOrder = Boolean(
    order && ['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status) &&
    !order.quantity_review_required && !loading && !error && items?.length,
  );
  const [drafts, setDrafts] = useState<Record<string, OrderReviewDraft>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const quantityInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!items) return;
    const next: Record<string, OrderReviewDraft> = {};
    for (const item of items) {
      next[item.id] = {
        quantity: String(item.proposed_quantity ?? item.approved_quantity ?? item.quantity),
        unitPrice: String(item.proposed_unit_price ?? item.approved_unit_price ?? item.unit_price_snapshot),
        reason: item.proposed_price_reason ?? item.price_override_reason ?? '',
      };
    }
    setDrafts(next);
    setDirty(false);
  }, [items]);

  const editable = order?.status === 'pending' || order?.status === 'draft';
  const hasStaged = Boolean(order?.quantity_review_required) || Boolean(items?.some((item) =>
    item.proposed_quantity != null || item.proposed_unit_price != null,
  ));
  const blocked = dirty || hasStaged;
  const blocker = useBlocker({
    shouldBlockFn: () => blocked,
    enableBeforeUnload: () => blocked,
    withResolver: true,
  });

  useEffect(() => {
    onBlockedChange(blocked);
  }, [blocked, onBlockedChange]);

  const transitions: Record<string, string[]> = {
    draft: ['pending', 'cancelled'],
    pending: ['cancelled'],
    confirmed: ['processing', 'shipped', 'delivered', 'cancelled'],
    processing: ['shipped', 'delivered', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
  };
  const statuses = transitions[order?.status ?? 'pending'] ?? [];
  const projectedTotal = (items ?? []).reduce((sum, item) => {
    const draft = drafts[item.id];
    const quantity = Number(draft?.quantity ?? item.quantity);
    const unitPrice = Number(draft?.unitPrice ?? item.unit_price_snapshot);
    return sum + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0);
  }, 0);

  function payload() {
    return (items ?? []).map((item) => ({
      item_id: item.id,
      quantity: Number(drafts[item.id]?.quantity ?? item.proposed_quantity ?? item.approved_quantity ?? item.quantity),
      unit_price: Number(drafts[item.id]?.unitPrice ?? item.proposed_unit_price ?? item.approved_unit_price ?? item.unit_price_snapshot),
      price_reason: (drafts[item.id]?.reason ?? item.proposed_price_reason ?? item.price_override_reason ?? '').trim() || null,
    }));
  }

  async function changeStatus(status: string) {
    if (blocked) {
      setReviewMessage('لا يمكن مغادرة مراجعة الطلب أو تغيير حالته قبل اعتماد الكميات والأسعار أو إلغاء المسودة.');
      return;
    }
    setBusy(true);
    try {
      await updateOrderStatus(orderId, status);
      await Promise.all([refetch(), refetchOrders()]);
      onNotice('تم تحديث حالة الطلب إلى: ' + status);
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر تحديث حالة الطلب');
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(itemId: string, patch: Partial<OrderReviewDraft>) {
    setDrafts((previous) => ({ ...previous, [itemId]: { ...previous[itemId], ...patch } }));
    setDirty(true);
    onBlockedChange(true);
    setReviewMessage('توجد تعديلات لم تُحفظ بعد. اعتمدها أو ألغها قبل مغادرة القسم.');
  }

  function enterNext(event: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const next = items?.[index + 1];
    if (next) quantityInputs.current[next.id]?.focus();
    else setReviewMessage('وصلت إلى آخر بند. احفظ المسودة ثم نفّذ اعتماد الكميات لتأكيد الطلب.');
  }

  async function stageReview() {
    if (!items?.length || busy) return;
    const lines = payload();
    if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 10000 ||
      !Number.isFinite(line.unit_price) || line.unit_price < 0 ||
      Math.abs(line.quantity * 1000 - Math.round(line.quantity * 1000)) > 0.000001)) {
      setReviewMessage('تحقق من أن كل كمية بين 0.001 و10,000 وأن الأسعار أرقام غير سالبة.');
      return;
    }
    if (lines.some((line) => {
      const current = items.find((item) => item.id === line.item_id);
      return current && line.unit_price !== Number(current.unit_price_snapshot) && !line.price_reason;
    })) {
      setReviewMessage('سبب تعديل السعر مطلوب لكل بند تغير سعره. تعديل طلب واحد لا يغيّر سعر الكتالوج.');
      return;
    }
    setBusy(true);
    setReviewMessage('');
    try {
      const result = await reviewOrderLines(orderId, lines, 'stage', customerNote);
      await Promise.all([refetch(), refetchOrders()]);
      setDirty(false);
      onBlockedChange(Boolean(result.quantity_review_required));
      setReviewMessage(result.quantity_review_required
        ? 'حُفظت مسودة التعديلات في الخادم. ما تزال غير معتمدة؛ لا يمكن تأكيد الطلب أو مغادرة هذه المراجعة.'
        : 'حُفظت المسودة؛ راجع جميع البنود ثم أكد الطلب عند الجاهزية.');
      onNotice('تم حفظ مسودة مراجعة الطلب دون تعديل المخزون أو إصدار فاتورة.');
    } catch (cause) {
      setReviewMessage(cause instanceof Error ? cause.message : 'تعذر حفظ مسودة المراجعة');
    } finally {
      setBusy(false);
    }
  }

  async function approveReview() {
    if (!items?.length || busy) return;
    const lines = payload();
    if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 10000 ||
      !Number.isFinite(line.unit_price) || line.unit_price < 0)) {
      setReviewMessage('تحقق من صحة جميع الكميات والأسعار قبل الاعتماد.');
      return;
    }
    if (lines.some((line) => {
      const current = items.find((item) => item.id === line.item_id);
      return current && line.unit_price !== Number(current.unit_price_snapshot) && !line.price_reason;
    })) {
      setReviewMessage('أضف سببًا لكل تعديل سعر قبل الاعتماد.');
      return;
    }
    setBusy(true);
    setReviewMessage('');
    try {
      // Submit the complete visible grid to one database transaction. When no prior draft exists,
      // the server stages this exact grid and approves it inside the same transaction; on any stock,
      // credit or invoice failure, the complete approval is rolled back.
      const result = await reviewOrderLines(orderId, lines, 'approve', customerNote);
      await Promise.all([refetch(), refetchOrders()]);
      setDirty(false);
      onBlockedChange(false);
      setReviewMessage(result.adjusted
        ? 'اعتمدت التعديلات، تأكد الطلب، أُنشئت الفاتورة من الخادم، وسُجل طلب السداد للعميل.'
        : 'اعتمدت الكميات وأُكد الطلب. أُنشئت الفاتورة وطلب السداد من الخادم.');
      onNotice('تم اعتماد الطلب ذريًا. حالة طلب السداد: ' + (result.payment_request_status ?? 'requested'));
    } catch (cause) {
      await Promise.all([refetch(), refetchOrders()]);
      setReviewMessage(cause instanceof Error ? cause.message : 'تعذر اعتماد الطلب؛ بقي الطلب دون تأكيد إذا رفض الخادم العملية.');
    } finally {
      setBusy(false);
    }
  }

  async function discardReview() {
    if (busy) return;
    setBusy(true);
    try {
      if (hasStaged && editable) await reviewOrderLines(orderId, [], 'discard');
      if (items) {
        const next: Record<string, OrderReviewDraft> = {};
        for (const item of items) next[item.id] = {
          quantity: String(item.approved_quantity ?? item.quantity),
          unitPrice: String(item.approved_unit_price ?? item.unit_price_snapshot),
          reason: item.price_override_reason ?? '',
        };
        setDrafts(next);
      }
      setDirty(false);
      await Promise.all([refetch(), refetchOrders()]);
      onBlockedChange(false);
      setReviewMessage('أُلغيت المسودة غير المعتمدة. لم يتغير المخزون ولم تصدر فاتورة من هذه المسودة.');
    } catch (cause) {
      setReviewMessage(cause instanceof Error ? cause.message : 'تعذر إلغاء المسودة');
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    if (blocked) {
      setReviewMessage('أكمل الاعتماد أو ألغ المسودة قبل مغادرة مراجعة الطلب.');
      return;
    }
    onBack();
  }

  async function downloadOnyxWorkbook() {
    if (!order || !items?.length || !canExportOnyxOrder || exportBusy) {
      onNotice('لا يمكن تصدير هذا الطلب للمحاسبة قبل اكتمال الاعتماد وتحميل البنود.');
      return;
    }
    setExportBusy(true);
    try {
      const bytes = buildOnyxOrderWorkbook({
        orderId: order.id,
        orderNumber: order.order_number,
        orderStatus: order.status,
        orderCreatedAt: order.created_at,
        customerCode: order.customer?.customer_code ?? '',
        customerName: order.customer?.business_name ?? '',
        items,
      });

      // The RPC rechecks active staff identity, tenant, order state and persisted item count.
      // An audit-write failure blocks the download instead of leaving an unrecorded export.
      const { data: auditId, error: auditError } = await supabase.rpc('record_onyx_order_export', {
        p_order_id: order.id,
        p_item_count: items.length,
      });
      if (auditError || typeof auditId !== 'string' || !auditId) {
        throw new Error('تعذر تسجيل حدث التصدير في سجل التدقيق المركزي؛ لم يبدأ تنزيل الملف.');
      }

      const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = onyxOrderWorkbookFilename(order.order_number);
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotice('تم إعداد ملف XLSX وتسجيل حدث التصدير. لم يُثبت بعد اكتمال تنزيل المتصفح أو توافق الملف مع إصدار أونكس المستهدف.');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر إعداد ملف XLSX للطلب.');
    } finally {
      setExportBusy(false);
    }
  }

  return <AdminPage eyebrow="المبيعات والعملاء" title={'الطلب #' + (order?.order_number ?? '')}
    description="راجع البنود والكميات والأسعار، ثم احفظ المسودة واعتمدها في معاملة واحدة قبل تأكيد الطلب."
    icon={Package} note="" toolbar={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="secondary" onClick={goBack} disabled={blocked || busy}><ChevronLeft size={16} /> رجوع</Button>
      <Button disabled={!canExportOnyxOrder || exportBusy} onClick={downloadOnyxWorkbook}><Download size={16} /> {exportBusy ? 'جارٍ تسجيل حدث التصدير...' : 'تنزيل XLSX للأونكس'}</Button>
    </div>}>
    {order && !canExportOnyxOrder && <p className="privacy-note" role="status" style={{ marginTop: 12 }}>
      تصدير المحاسبة متاح بعد اعتماد الطلب وإكمال مراجعة الكميات والأسعار. لا تُصدّر المسودة غير المعتمدة كمستند محاسبي.
    </p>}
    {order && canExportOnyxOrder && <p className="privacy-note" role="note" style={{ marginTop: 12 }}>
      يحتوي الملف على ورقة تفاصيل ذات 27 عمودًا بالترتيب المرجعي وورقة مستقلة لرأس المستند والعميل. الحقول غير المتاحة تُترك فارغة. يُسجل حدث إعداد التصدير خادميًا قبل بدء التنزيل، لكن ذلك لا يثبت اكتمال تنزيل المتصفح أو قبول الملف في إصدار أونكس الفعلي؛ يلزم اختبار قبول قبل الاعتماد المحاسبي.
    </p>}
    {order && <div className="order-detail-grid">
      <div className="order-info-panel">
        <div className="order-info-row"><span>العميل</span><strong>{order.customer?.business_name ?? '—'}</strong></div>
        <div className="order-info-row"><span>التاريخ</span><strong>{formatDateShort(order.created_at)}</strong></div>
        <div className="order-info-row"><span>الإجمالي المقترح</span><strong>{formatCurrency(projectedTotal)}</strong></div>
        <div className="order-info-row"><span>عدد البنود</span><strong>{formatNumber(order.total_items)}</strong></div>
        <div className="order-info-row"><span>الحالة الحالية</span><span className={'badge ' + (order.status === 'confirmed' ? 'success' : 'info')}>{order.status}</span></div>
        <div className="order-info-row"><span>طلب السداد</span><strong>{order.payment_request_status === 'requested' ? 'مطلوب من العميل' : order.payment_request_status ?? 'غير مطلوب'}</strong></div>
      </div>
      <div className="order-status-panel">
        <h3>تغيير الحالة</h3>
        <p>تأكيد الطلب يصدر الفاتورة ويطلب السداد. استخدم الاعتماد أدناه حتى تمر الكميات والأسعار عبر مسار المراجعة المحكوم.</p>
        <div className="order-status-btns">{statuses.map((status) =>
          <button key={status} disabled={busy || blocked} className={order.status === status ? 'active' : ''} onClick={() => void changeStatus(status)}>
            {({ pending: 'بانتظار المراجعة', processing: 'قيد التجهيز', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'إلغاء الطلب' } as Record<string, string>)[status] ?? status}
          </button>,
        )}</div>
      </div>
    </div>}


    {order?.delivery_address_snapshot && <section className="panel" style={{ marginTop: 16, padding: 16 }}>
      <h3 style={{ margin: '0 0 10px' }}>عنوان التوصيل المحفوظ مع الطلب</h3>
      <p style={{ margin: '0 0 4px', fontWeight: 800 }}>{order.delivery_address_snapshot.label}</p>
      <p style={{ margin: '6px 0 4px' }}>{order.delivery_address_snapshot.recipient_name} — <span dir="auto">{order.delivery_address_snapshot.phone}</span></p>
      <p style={{ margin: '0 0 4px' }}>{order.delivery_address_snapshot.address_line1}{order.delivery_address_snapshot.address_line2 ? '، ' + order.delivery_address_snapshot.address_line2 : ''}</p>
      <p style={{ margin: '0 0 4px', color: '#536b70' }}>{[order.delivery_address_snapshot.city, order.delivery_address_snapshot.region, order.delivery_address_snapshot.postal_code].filter(Boolean).join('، ')} — {order.delivery_address_snapshot.country}</p>
      {order.delivery_address_snapshot.delivery_instructions && <p style={{ margin: '7px 0 0', color: '#536b70' }}>تعليمات المندوب: {order.delivery_address_snapshot.delivery_instructions}</p>}
    </section>}

    {editable && <section className="panel table-panel" style={{ marginTop: 16 }}>
      <div className="panel-head"><div><h2>مراجعة بنود الطلب</h2><p>Enter ينتقل إلى كمية السطر التالي. اللون الأزرق الفاتح يميز الحقول القابلة للتعديل. أي تغيير يبقى غير معتمد حتى تنفيذ الاعتماد.</p></div>
        <span className={'badge ' + (blocked ? 'warning' : 'success')}>{blocked ? 'مراجعة غير معتمدة' : 'جاهز للمراجعة'}</span>
      </div>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : !items?.length ? <Empty text="لا توجد بنود يمكن مراجعتها." /> :
        <TableWrap><table><thead><tr><th>المنتج / SKU</th><th>الكمية المطلوبة</th><th>الكمية المقترحة/المعتمدة</th><th>السعر للوحدة</th><th>سبب تعديل السعر</th><th>الإجمالي المقترح</th></tr></thead><tbody>
          {items.map((item, index) => {
            const draft = drafts[item.id] ?? { quantity: String(item.quantity), unitPrice: String(item.unit_price_snapshot), reason: '' };
            const quantity = Number(draft.quantity);
            const price = Number(draft.unitPrice);
            const valid = Number.isFinite(quantity) && quantity > 0 && quantity <= 10000 && Number.isFinite(price) && price >= 0;
            return <tr key={item.id}>
              <td><strong>{item.product_name_snapshot}</strong><small style={{ display: 'block' }}><code>{item.item_code}</code> · {item.unit_snapshot ?? ''}</small></td>
              <td>{formatNumber(Number(item.requested_quantity ?? item.quantity))}</td>
              <td><input
                ref={(element) => { quantityInputs.current[item.id] = element; }}
                aria-label={'الكمية المقترحة ' + item.product_name_snapshot}
                type="number" min="0.001" max="10000" step="0.001"
                value={draft.quantity}
                disabled={busy}
                onChange={(event) => updateDraft(item.id, { quantity: event.target.value })}
                onKeyDown={(event) => enterNext(event, index)}
                style={{ width: 130, padding: '8px 10px', border: '1px solid #b8d7f3', borderRadius: 8, background: '#eef7ff', color: '#193b56' }}
              /></td>
              <td><input
                aria-label={'السعر المقترح ' + item.product_name_snapshot}
                type="number" min="0" max="999999999999" step="0.01"
                value={draft.unitPrice}
                disabled={busy}
                onChange={(event) => updateDraft(item.id, { unitPrice: event.target.value })}
                style={{ width: 130, padding: '8px 10px', border: '1px solid #b8d7f3', borderRadius: 8, background: '#eef7ff', color: '#193b56' }}
              /></td>
              <td><input
                aria-label={'سبب تعديل السعر ' + item.product_name_snapshot}
                value={draft.reason}
                disabled={busy}
                maxLength={500}
                onChange={(event) => updateDraft(item.id, { reason: event.target.value })}
                placeholder="مطلوب إذا تغير السعر"
                style={{ width: 180, padding: '8px 10px', border: '1px solid #d9e5eb', borderRadius: 8, background: '#fff' }}
              /></td>
              <td>{valid ? formatCurrency(quantity * price) : '—'}</td>
            </tr>;
          })}
        </tbody></table></TableWrap>}
      <label className="form-field" style={{ marginTop: 12 }}><span>ملاحظة للعميل (اختيارية)</span><textarea value={customerNote} onChange={(event) => { setCustomerNote(event.target.value); setDirty(true); onBlockedChange(true); }} maxLength={1000} rows={2} placeholder="توضيح أي تغيير في الأصناف أو الكميات" /></label>
      {reviewMessage && <div className={blocked ? 'form-error' : 'privacy-note'} role={blocked ? 'alert' : 'status'}>{reviewMessage}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <Button variant="secondary" disabled={busy || loading || !items?.length} onClick={() => void stageReview()}>{busy ? 'جارٍ الحفظ...' : 'حفظ المسودة دون اعتماد'}</Button>
        <Button disabled={busy || loading || !items?.length} onClick={() => void approveReview()}>{busy ? 'جارٍ الاعتماد...' : 'اعتماد الكميات وتأكيد الطلب'}</Button>
        {(blocked || dirty) && <Button variant="outline" disabled={busy} onClick={() => void discardReview()}>إلغاء المسودة</Button>}
      </div>
      {blocked && <p role="alert" style={{ color: '#9a5b13', fontWeight: 800, marginTop: 12 }}>لا يمكن مغادرة هذا القسم أو تغيير حالة الطلب قبل اعتماد الكميات/الأسعار المقترحة أو إلغاء المسودة.</p>}
    </section>}

    {!editable && items && <section className="panel table-panel" style={{ marginTop: 16 }}>
      <div className="panel-head"><div><h2>البنود المعتمدة</h2><p>الأسعار للعرض الداخلي للموظفين المخولين فقط.</p></div></div>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : <TableWrap><table><thead><tr><th>المنتج</th><th>الرمز</th><th>الكمية المعتمدة</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>{items.map((item: OrderItem) => <tr key={item.id}>
        <td><strong>{item.product_name_snapshot}</strong></td><td><code>{item.item_code}</code></td><td>{formatNumber(Number(item.approved_quantity ?? item.quantity))} {item.unit_snapshot ?? ''}</td><td>{formatCurrency(Number(item.approved_unit_price ?? item.unit_price_snapshot))}</td><td>{formatCurrency(Number(item.line_total))}</td>
      </tr>)}</tbody></table></TableWrap>}
      {order?.quantity_review_required && <p role="alert" style={{ color: '#9a5b13', fontWeight: 800 }}>توجد مراجعة معلقة. يجب إكمالها قبل متابعة الطلب.</p>}
      {order?.customer_adjustment_note && <p>{order?.customer_adjustment_note}</p>}
    </section>}
    {blocker.status === 'blocked' && <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="order-review-navigation-title">
      <section className="modal" style={{ maxWidth: 460 }} dir="rtl">
        <div className="modal-head"><h2 id="order-review-navigation-title">لا يمكن مغادرة مراجعة الطلب</h2></div>
        <p style={{ lineHeight: 1.8 }}>توجد كميات أو أسعار أو ملاحظات غير معتمدة. اعتمد التعديلات أو ألغِ المسودة قبل الانتقال إلى صفحة أخرى. سيبقى الطلب مفتوحًا حتى إكمال المراجعة.</p>
        <div className="modal-actions"><button type="button" className="btn primary" onClick={() => blocker.reset()}>العودة إلى المراجعة</button></div>
      </section>
    </div>}
  </AdminPage>;
}

export function Suppliers({ onNotice }: { onNotice: (m: string) => void }) {
  const { data, loading, error, refetch } = useFetch(fetchSuppliers);
  const [modal, setModal] = useState(false);
  return <AdminPage eyebrow="إدارة البيانات" title="الموردون" description="إدارة دليل الموردين وجهات الاتصال" icon={Package} note={`${data?.length ?? 0} مورد`} toolbar={<><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button><Button onClick={() => setModal(true)}><Plus size={17} /> إضافة مورد</Button></>}>
    {loading ? <Loading /> : error ? <ErrorBox message={error} /> : <TableWrap><table><thead><tr><th>المورد</th><th>جهة الاتصال</th><th>الهاتف</th><th>البريد</th><th>الحالة</th></tr></thead><tbody>{data?.map((s: Supplier) => <tr key={s.id}><td><strong>{s.name}</strong><small>{s.supplier_code}</small></td><td>{s.contact_name ?? '—'}</td><td>{s.phone ?? '—'}</td><td>{s.email ?? '—'}</td><td><span className={`badge ${s.status === 'active' ? 'success' : 'warning'}`}>{s.status}</span></td></tr>)}</tbody></table></TableWrap>}
    {modal && <SupplierModal onClose={() => setModal(false)} onSaved={() => { setModal(false); refetch(); onNotice('تمت إضافة المورد'); }} />}
  </AdminPage>;
}
function SupplierModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(''); const [contact, setContact] = useState(''); const [phone, setPhone] = useState(''); const [error, setError] = useState('');
  async function save() { if (!name.trim()) { setError('اسم المورد مطلوب'); return; } try { await createSupplier({ name, contact_name: contact, phone, supplier_code: `SUP-${Date.now().toString().slice(-5)}`, status: 'active' }); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); } }
  return <Modal title="إضافة مورد" onClose={onClose}><Field label="اسم المورد"><input value={name} onChange={(e) => setName(e.target.value)} /></Field><div className="form-grid"><Field label="جهة الاتصال"><input value={contact} onChange={(e) => setContact(e.target.value)} /></Field><Field label="الهاتف"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></div></Modal>;
}

export function Devices({ onNotice }: { onNotice: (m: string) => void }) {
  const { data: customers } = useFetch(async () => { const { organizationId } = await getCurrentTenantScope(); const { data, error } = await supabase.from('customers').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }); if (error) throw error; return data ?? []; });
  const [query, setQuery] = useState('');
  const rows = (customers ?? []).filter((c: { business_name: string; customer_code: string; phone: string | null }) => `${c.business_name} ${c.customer_code} ${c.phone ?? ''}`.includes(query));
  return <AdminPage eyebrow="المبيعات والعملاء" title="أجهزة العملاء" description="متابعة أجهزة البيع لدى العملاء" icon={Smartphone} note={`${customers?.length ?? 0} جهاز مسجل`} toolbar={<Button variant="secondary" onClick={() => onNotice('تم تحديث الحالة')}><RefreshCw size={16} /> تحديث</Button>}>
    <div className="table-head"><h2>قائمة الأجهزة</h2><label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث..." /></label></div>
    <TableWrap><table><thead><tr><th>العميل</th><th>الكود</th><th>الهاتف</th><th>الحالة</th><th /></tr></thead><tbody>{rows.map((c: { id: string; business_name: string; customer_code: string; phone: string | null; status: string }) => <tr key={c.id}><td><strong>{c.business_name}</strong></td><td><code>{c.customer_code}</code></td><td>{c.phone ?? '—'}</td><td><span className={`badge ${c.status === 'approved' ? 'success' : 'warning'}`}>{c.status}</span></td><td><button className="row-action"><ExternalLink size={15} /></button></td></tr>)}</tbody></table></TableWrap>
  </AdminPage>;
}

export function SettingsPage({ onNotice }: { onNotice: (m: string) => void }) {
  const { user } = useAuth();
  const canManageRoles = Boolean(user?.roles.includes('admin'));
  const canManageStorefrontContent = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const { data: settings, loading, refetch } = useFetch(fetchSettings);
  const [tab, setTab] = useState<'general' | 'storefront' | 'appearance' | 'access' | 'announcements'>('general');
  const [saving, setSaving] = useState(false);
  const map = useMemo(() => { const m: Record<string, unknown> = {}; settings?.forEach((s: AdminSetting) => m[s.key] = s.value); return m; }, [settings]);

  async function save(key: string, value: unknown, category: string) { setSaving(true); try { await updateSetting(key, value, category); refetch(); onNotice('تم حفظ الإعداد'); } catch (e) { onNotice(e instanceof Error ? e.message : 'خطأ'); } finally { setSaving(false); } }

  return <AdminPage eyebrow="النظام" title="الإعدادات العامة" description="تحكم كامل في إعدادات المتجر والمظهر" icon={Settings} note="" toolbar={<Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button>}>
    {loading ? <Loading /> : <>
      <div className="settings-tabs"><button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>عام</button><button className={tab === 'storefront' ? 'active' : ''} onClick={() => setTab('storefront')}>المتجر</button><button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}>المظهر</button>{canManageStorefrontContent && <button className={tab === 'announcements' ? 'active' : ''} onClick={() => setTab('announcements')}>إعلانات المتجر</button>}{canManageRoles && <button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>المستخدمون والصلاحيات</button>}</div>
      {tab === 'general' && <SettingsPanel title="معلومات المتجر"><SettingInput label="اسم المتجر" value={(map.store_name as string) ?? ''} onSave={(v) => save('store_name', v, 'general')} saving={saving} /><SettingInput label="الوصف المختصر" value={(map.store_tagline as string) ?? ''} onSave={(v) => save('store_tagline', v, 'general')} saving={saving} /><SettingInput label="الهاتف" value={(map.store_phone as string) ?? ''} onSave={(v) => save('store_phone', v, 'general')} saving={saving} /><SettingInput label="البريد" value={(map.store_email as string) ?? ''} onSave={(v) => save('store_email', v, 'general')} saving={saving} /><SettingInput label="العنوان" value={(map.store_address as string) ?? ''} onSave={(v) => save('store_address', v, 'general')} saving={saving} /></SettingsPanel>}
      {tab === 'storefront' && <SettingsPanel title="إعدادات المتجر"><SettingInput label="عنوان البانر" value={(map.hero_title as string) ?? ''} onSave={(v) => save('hero_title', v, 'storefront')} saving={saving} /><SettingInput label="نص البانر الفرعي" value={(map.hero_subtitle as string) ?? ''} onSave={(v) => save('hero_subtitle', v, 'storefront')} saving={saving} /><SettingToggle label="شريط العرض المتحرك" value={(map.ticker_enabled as boolean) ?? true} onSave={(v) => save('ticker_enabled', v, 'storefront')} saving={saving} /><SettingToggle label="إظهار المنتجات النافدة" value={(map.show_out_of_stock as boolean) ?? true} onSave={(v) => save('show_out_of_stock', v, 'storefront')} saving={saving} /></SettingsPanel>}
      {tab === 'appearance' && <SettingsPanel title="ألوان النظام"><SettingColor label="اللون الأساسي" value={(map.theme_primary as string) ?? '#087f8d'} onSave={(v) => save('theme_primary', v, 'appearance')} saving={saving} /><SettingColor label="لون التمييز" value={(map.theme_accent as string) ?? '#0eaa97'} onSave={(v) => save('theme_accent', v, 'appearance')} saving={saving} /></SettingsPanel>}
      {tab === 'announcements' && canManageStorefrontContent && <StorefrontAnnouncementManager onNotice={onNotice} />}
      {tab === 'access' && canManageRoles && user && <OrganizationRoleManagement currentProfileId={user.profileId} onNotice={onNotice} />}
    </>}
  </AdminPage>;
}



type AnnouncementDraft = {
  id: string | null; title: string; content: string; href: string; color: string; priority: string;
  isActive: boolean; startsAt: string; endsAt: string; audience: StorefrontAnnouncementAudience;
};
function newAnnouncementDraft(): AnnouncementDraft {
  return { id: null, title: '', content: '', href: '', color: '#B99347', priority: '100', isActive: true, startsAt: '', endsAt: '', audience: 'all' };
}
function announcementDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function announcementDateISO(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('تاريخ الإعلان غير صالح.');
  return date.toISOString();
}
function StorefrontAnnouncementManager({ onNotice }: { onNotice: (message: string) => void }) {
  const { data: announcements, loading, error, refetch } = useFetch(fetchAdminStorefrontAnnouncements);
  const [draft, setDraft] = useState<AnnouncementDraft>(() => newAnnouncementDraft());
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  function editAnnouncement(row: StorefrontAnnouncement) {
    setDraft({ id: row.id, title: row.title, content: row.content ?? '', href: row.href ?? '', color: row.color,
      priority: String(row.priority), isActive: row.is_active, startsAt: announcementDateInput(row.starts_at),
      endsAt: announcementDateInput(row.ends_at), audience: row.audience });
    setFormError('');
    setFormOpen(true);
  }
  function cancelForm() { setDraft(newAnnouncementDraft()); setFormError(''); setFormOpen(false); }
  async function persist(input: StorefrontAnnouncementInput) {
    await saveStorefrontAnnouncement(input);
    await refetch();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const priority = Number(draft.priority);
    if (!draft.title.trim() || draft.title.trim().length > 120) { setFormError('اسم الإعلان مطلوب وبحد أقصى 120 حرفًا.'); return; }
    if (!Number.isInteger(priority) || priority < 0 || priority > 10000) { setFormError('الأولوية يجب أن تكون عددًا صحيحًا من 0 إلى 10000.'); return; }
    try {
      const startsAt = announcementDateISO(draft.startsAt), endsAt = announcementDateISO(draft.endsAt);
      if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) { setFormError('وقت النهاية يجب أن يكون بعد وقت البداية.'); return; }
      setSaving(true);
      await persist({ id: draft.id, title: draft.title.trim(), content: draft.content.trim() || null,
        href: draft.href.trim() || null, color: draft.color, priority, is_active: draft.isActive,
        starts_at: startsAt, ends_at: endsAt, audience: draft.audience });
      cancelForm(); onNotice('تم حفظ الإعلان وتسجيل التغيير في سجل التدقيق.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'تعذر حفظ الإعلان.');
    } finally { setSaving(false); }
  }
  async function changeActive(row: StorefrontAnnouncement) {
    setBusyId(row.id);
    try {
      await persist({ id: row.id, title: row.title, content: row.content, href: row.href, color: row.color,
        priority: row.priority, is_active: !row.is_active, starts_at: row.starts_at, ends_at: row.ends_at, audience: row.audience });
      onNotice(row.is_active ? 'تم تعطيل الإعلان.' : 'تم تفعيل الإعلان وفق فترة النشر المحددة.');
    } catch (cause) { onNotice(cause instanceof Error ? cause.message : 'تعذر تغيير حالة الإعلان.'); }
    finally { setBusyId(null); }
  }
  return (
    <section className="sf-announcement-manager" aria-labelledby="sf-announcement-manager-title">
      <div className="sf-announcement-manager-head">
        <div><h2 id="sf-announcement-manager-title">إعلانات المتجر</h2><p>تحرير الإعلانات وفترة النشر والجمهور. تغييراتك محفوظة في سجل التدقيق.</p></div>
        <div className="sf-announcement-manager-actions">
          <Button variant="secondary" onClick={() => void refetch()} disabled={loading}><RefreshCw size={16} /> تحديث القائمة</Button>
          <Button onClick={() => { setDraft(newAnnouncementDraft()); setFormError(''); setFormOpen(true); }}><Plus size={16} /> إعلان جديد</Button>
        </div>
      </div>
      {formOpen && <form className="sf-announcement-form" onSubmit={(event) => void submit(event)}>
        <div className="sf-announcement-form-heading"><h3>{draft.id ? 'تعديل إعلان' : 'إنشاء إعلان'}</h3>
          <button type="button" className="btn btn-ghost" onClick={cancelForm} disabled={saving}>إلغاء</button></div>
        <label>عنوان الإعلان <input required maxLength={120} value={draft.title} onChange={(event) => setDraft((p) => ({ ...p, title: event.target.value }))} /></label>
        <label>النص المختصر <textarea maxLength={600} rows={3} value={draft.content} onChange={(event) => setDraft((p) => ({ ...p, content: event.target.value }))} /></label>
        <label>الرابط الداخلي أو HTTPS <input maxLength={500} placeholder="/products أو https://example.com" value={draft.href} onChange={(event) => setDraft((p) => ({ ...p, href: event.target.value }))} /></label>
        <div className="sf-announcement-form-grid">
          <label>لون التمييز <input type="color" value={draft.color} onChange={(event) => setDraft((p) => ({ ...p, color: event.target.value }))} /></label>
          <label>الأولوية <input type="number" min={0} max={10000} step={1} required value={draft.priority} onChange={(event) => setDraft((p) => ({ ...p, priority: event.target.value }))} /></label>
          <label>بدء النشر <input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((p) => ({ ...p, startsAt: event.target.value }))} /></label>
          <label>انتهاء النشر <input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((p) => ({ ...p, endsAt: event.target.value }))} /></label>
          <label>الجمهور <select value={draft.audience} onChange={(event) => setDraft((p) => ({ ...p, audience: event.target.value as StorefrontAnnouncementAudience }))}>
            <option value="all">جميع الزوار</option><option value="customers">العملاء المسجلون</option><option value="staff">الموظفون المخولون</option>
          </select></label>
          <label className="sf-announcement-active-control"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((p) => ({ ...p, isActive: event.target.checked }))} /> منشور</label>
        </div>
        {formError && <p role="alert" className="sf-announcement-form-error">{formError}</p>}
        <div className="sf-announcement-form-actions">
          <Button type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : <><Save size={16} /> حفظ الإعلان</>}</Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={cancelForm}>إلغاء</Button>
        </div>
      </form>}
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : !announcements?.length ? (
        <div className="sf-announcement-empty" role="status">لا توجد إعلانات محفوظة لهذه المؤسسة. أنشئ إعلانًا عند وجود محتوى حقيقي للنشر.</div>
      ) : <div className="sf-announcement-admin-list">{announcements.map((row) => (
        <article key={row.id} className="sf-announcement-admin-card">
          <div className="sf-announcement-admin-title"><span style={{ borderColor: row.color }} className="sf-announcement-color-mark" />
            <div><h3>{row.title}</h3><p>{row.content || 'بدون نص إضافي'}</p></div>
            <span className={row.is_active ? 'badge success' : 'badge warning'}>{row.is_active ? 'نشط' : 'متوقف'}</span>
          </div>
          <dl className="sf-announcement-metadata">
            <div><dt>الأولوية</dt><dd>{row.priority}</dd></div>
            <div><dt>الجمهور</dt><dd>{row.audience === 'all' ? 'الجميع' : row.audience === 'customers' ? 'العملاء' : 'الموظفون'}</dd></div>
            <div><dt>بداية النشر</dt><dd>{row.starts_at ? new Date(row.starts_at).toLocaleString('ar') : 'دون بداية'}</dd></div>
            <div><dt>نهاية النشر</dt><dd>{row.ends_at ? new Date(row.ends_at).toLocaleString('ar') : 'دون نهاية'}</dd></div>
            <div><dt>الرابط</dt><dd>{row.href || 'بدون رابط'}</dd></div>
          </dl>
          <div className="sf-announcement-card-actions"><Button variant="secondary" onClick={() => editAnnouncement(row)}>تعديل</Button>
            <Button variant="secondary" disabled={busyId === row.id} onClick={() => void changeActive(row)}>{busyId === row.id ? 'جارٍ التحديث...' : row.is_active ? 'تعطيل' : 'تفعيل'}</Button></div>
        </article>
      ))}</div>}
    </section>
  );
}

type ManagedOrganizationProfile = {
  profile_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  roles: string[];
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'مدير النظام', detail: 'الإدارة الكاملة وإدارة الصلاحيات.' },
  { value: 'manager', label: 'مدير', detail: 'تشغيل الأقسام وصلاحيات المالية المعتمدة.' },
  { value: 'staff', label: 'موظف تشغيل', detail: 'الطلبات والمهام التشغيلية دون صلاحيات المحاسبة.' },
  { value: 'accountant', label: 'محاسب', detail: 'الفواتير والتحصيل فقط، دون أقسام التشغيل.' },
  { value: 'customer', label: 'عميل', detail: 'واجهة المتجر والحساب التجاري.' },
] as const;

function OrganizationRoleManagement({ currentProfileId, onNotice }: { currentProfileId: string; onNotice: (m: string) => void }) {
  const [rows, setRows] = useState<ManagedOrganizationProfile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await supabase.rpc('list_organization_user_roles');
      if (result.error) {
        setError('تعذر تحميل حسابات المؤسسة وصلاحياتها. تحقق من نشر ترحيل إدارة الأدوار.');
        return;
      }
      const loaded = (Array.isArray(result.data) ? result.data : []) as ManagedOrganizationProfile[];
      setRows(loaded);
      setDrafts(Object.fromEntries(loaded.map((profile) => [profile.profile_id, [...(profile.roles ?? [])]])));
    } catch {
      setError('تعذر الاتصال بالخادم لتحميل حسابات المؤسسة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = rows.filter((profile) =>
    !query.trim() || (profile.full_name + ' ' + (profile.email ?? '')).toLocaleLowerCase('ar').includes(query.trim().toLocaleLowerCase('ar')),
  );

  function toggleRole(profileId: string, role: string, checked: boolean) {
    setDrafts((previous) => {
      const current = previous[profileId] ?? [];
      // Customer is a standalone identity; it cannot be combined with staff/admin roles.
      const next = role === 'customer'
        ? (checked ? ['customer'] : [])
        : checked
          ? [...current.filter((value) => value !== 'customer' && value !== role), role]
          : current.filter((value) => value !== role);
      return { ...previous, [profileId]: next };
    });
    setError('');
  }

  async function save(profile: ManagedOrganizationProfile) {
    const selected = [...(drafts[profile.profile_id] ?? [])].sort();
    if (!selected.length) {
      setError('يجب إبقاء دور واحد على الأقل لكل حساب نشط.');
      return;
    }
    if (profile.profile_id === currentProfileId) {
      setError('لا يمكنك تعديل أدوار حسابك الحالي من هذه الشاشة. استخدم حساب مدير آخر لتغييرها.');
      return;
    }
    setSavingProfileId(profile.profile_id);
    setError('');
    try {
      const result = await supabase.rpc('set_organization_user_roles', {
        p_profile_id: profile.profile_id,
        p_roles: selected,
      });
      if (result.error) {
        const message = result.error.message;
        setError(message.includes('last active administrator')
          ? 'لا يمكن إزالة آخر مدير نظام نشط في المؤسسة.'
          : message.includes('outside the current organization')
            ? 'لا يمكن إدارة حساب خارج مؤسستك.'
            : message.includes('customer role cannot be combined')
              ? 'لا يمكن جمع دور العميل مع أدوار الإدارة أو التشغيل.'
              : 'تعذر حفظ الأدوار. تحقق من صلاحيتك وأن الحساب ما زال نشطًا.');
        return;
      }
      onNotice('تم حفظ أدوار ' + profile.full_name + ' وتسجيل التغيير في سجل التدقيق.');
      await load();
    } catch {
      setError('تعذر الاتصال بالخادم لحفظ الأدوار. أعد التحميل للتحقق من الحالة الحالية.');
    } finally {
      setSavingProfileId(null);
    }
  }

  const roleLabel = (role: string) => ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
  const changed = (profile: ManagedOrganizationProfile) =>
    JSON.stringify([...(profile.roles ?? [])].sort()) !== JSON.stringify([...(drafts[profile.profile_id] ?? [])].sort());

  return <SettingsPanel title="المستخدمون والأدوار">
    <div style={{ padding: 18 }}>
      <p style={{ marginTop: 0, color: '#71868a', lineHeight: 1.8 }}>
        إدارة الأدوار متاحة لمدير النظام فقط. تُحفظ عبر أوامر خادمية مقيّدة بالمؤسسة، ويسجل كل تغيير في سجل التدقيق.
        دور المحاسب مخصص للفواتير والتحصيل ولا يمنح صلاحيات تشغيل الطلبات أو المخزون. لا يمكن تعديل دور حسابك الحالي من هذه الشاشة.
      </p>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ display: 'block', fontWeight: 800, marginBottom: 6 }}>بحث بالاسم أو البريد</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم المستخدم أو البريد الإلكتروني" style={{ width: '100%', maxWidth: 440, padding: '10px 12px', border: '1px solid #d5e7e9', borderRadius: 9 }} />
      </label>
      {error && <div className="error-box" role="alert" style={{ display: 'block' }}>{error}<Button variant="outline" onClick={() => void load()}>إعادة التحميل</Button></div>}
      {loading ? <Loading /> : !visible.length ? <Empty text="لا توجد حسابات نشطة في هذه المؤسسة." /> : <div style={{ display: 'grid', gap: 12 }}>
        {visible.map((profile) => {
          const selected = drafts[profile.profile_id] ?? [];
          const isSelf = profile.profile_id === currentProfileId;
          const busy = savingProfileId === profile.profile_id;
          return <article key={profile.profile_id} style={{ border: '1px solid #dcebed', borderRadius: 14, padding: 14, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div><strong style={{ display: 'block', color: '#234b55' }}>{profile.full_name}</strong><span style={{ color: '#789297', fontSize: 12 }}>{profile.email ?? 'بريد غير مسجل'}</span></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{profile.roles.map((role) => <span key={role} className="badge info">{roleLabel(role)}</span>)}</div>
            </div>
            <fieldset disabled={isSelf || busy} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, border: 0, padding: '12px 0 4px', margin: 0 }}>
              {ROLE_OPTIONS.map((option) => <label key={option.value} title={option.detail} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#385d65', fontSize: 12 }}>
                <input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => toggleRole(profile.profile_id, option.value, event.target.checked)} />
                {option.label}
              </label>)}
            </fieldset>
            {isSelf && <small style={{ display: 'block', color: '#9a6a1c', marginBottom: 8 }}>حسابك الحالي محمي من التعديل المباشر.</small>}
            {!isSelf && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <small style={{ color: '#71868a' }}>{selected.length} دور محدد</small>
              <Button onClick={() => void save(profile)} disabled={busy || savingProfileId !== null || !changed(profile)}>
                <Save size={14} /> {busy ? 'جارٍ الحفظ...' : 'حفظ الأدوار'}
              </Button>
            </div>}
          </article>;
        })}
      </div>}
    </div>
  </SettingsPanel>;
}

function SettingsPanel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel settings-panel"><div className="panel-head"><div><h2>{title}</h2></div></div><div className="settings-body">{children}</div></section>; }
function SettingInput({ label, value, onSave, saving }: { label: string; value: string; onSave: (v: string) => void; saving: boolean }) { const [v, setV] = useState(value); useEffect(() => setV(value), [value]); return <div className="setting-row"><label><span>{label}</span><input value={v} onChange={(e) => setV(e.target.value)} /></label><Button variant="outline" onClick={() => onSave(v)} disabled={saving}>حفظ</Button></div>; }
function SettingToggle({ label, value, onSave, saving }: { label: string; value: boolean; onSave: (v: boolean) => void; saving: boolean }) { return <div className="setting-row"><div className="setting-label"><span>{label}</span><label className="switch"><input type="checkbox" checked={value} onChange={(e) => onSave(e.target.checked)} disabled={saving} /><span /></label></div></div>; }
function SettingColor({ label, value, onSave, saving }: { label: string; value: string; onSave: (v: string) => void; saving: boolean }) { return <div className="setting-row"><label><span>{label}</span><input type="color" value={value} onChange={(e) => onSave(e.target.value)} disabled={saving} /></label></div>; }

// ─── Shared components ───
export function AdminPage({ eyebrow, title, description, icon: Icon, note, toolbar, children }: { eyebrow: string; title: string; description: string; icon: IconType; note: string; toolbar?: React.ReactNode; children: React.ReactNode }) {
  return <><div className="heading"><div className="heading-icon"><Icon size={25} /></div><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>{(note || toolbar) && <div className="toolbar"><span className="toolbar-note">{note}</span><div className="toolbar-actions">{toolbar}</div></div>}{children}</>;
}
export function Loading() { return <div className="loading"><RefreshCw size={20} className="spin" /> جار تحميل البيانات...</div>; }
export function ErrorBox({ message }: { message: string }) { return <div className="error-box"><AlertTriangle size={19} /> تعذر تحميل البيانات. {message}</div>; }
export function Empty({ text }: { text: string }) { return <div className="empty"><Database size={26} /><span>{text}</span></div>; }
export function Button({ children, variant = 'primary', onClick, disabled }: { children: React.ReactNode; variant?: 'primary' | 'secondary' | 'outline' | 'danger'; onClick?: () => void; disabled?: boolean }) { return <button className={`btn ${variant}`} onClick={onClick} disabled={disabled}>{children}</button>; }
export function TableWrap({ children }: { children: React.ReactNode }) { return <div className="table-wrap">{children}</div>; }
export function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X size={19} /></button></div>{children}</div></div>; }
