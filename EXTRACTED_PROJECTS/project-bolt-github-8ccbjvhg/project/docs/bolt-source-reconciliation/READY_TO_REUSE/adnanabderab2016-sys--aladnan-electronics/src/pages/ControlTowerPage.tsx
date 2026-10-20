import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SectionCard, LoadingState, Badge } from '@/components/ui';
import { formatCurrency, formatNumber, formatDateTime } from '@/lib/utils';
import { ShoppingCart, TriangleAlert as AlertTriangle, Wrench, RotateCcw, Upload, Clock, Radio } from 'lucide-react';

interface TowerData {
  newOrders: number;
  lowStock: number;
  overduePOs: number;
  activeRepairs: number;
  pendingRmas: number;
  failedImports: number;
  recentOrders: { id: string; order_number: string; status: string; total: number; created_at: string; customers: { name: string }[] | null }[];
  criticalStock: { id: string; product_id: string; on_hand: number; reserved: number; products: { name: string; sku: string }[] | null }[];
  overdueRepairs: { id: string; ticket_number: string; status: string; sla_due_date: string | null; customers: { name: string }[] | null }[];
}

export default function ControlTowerPage() {
  const [data, setData] = useState<TowerData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersNew, lowStock, pos, repairs, rmas, importsFail, recentOrders, criticalStock, overdueRepairs] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['draft', 'submitted', 'received']),
        supabase.from('inventory_items').select('id', { count: 'exact', head: true }).lte('on_hand', 5),
        supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['draft', 'submitted']),
        supabase.from('repair_tickets').select('id', { count: 'exact', head: true }).not('status', 'in', '("delivered","cancelled")'),
        supabase.from('rmas').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
        supabase.from('import_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('orders').select('id, order_number, status, total, created_at, customers(name)').order('created_at', { ascending: false }).limit(5),
        supabase.from('inventory_items').select('id, product_id, on_hand, reserved, products(name, sku)').lte('on_hand', 5).limit(5),
        supabase.from('repair_tickets').select('id, ticket_number, status, sla_due_date, customers(name)').not('status', 'in', '("delivered","cancelled")').order('sla_due_date', { ascending: true }).limit(5),
      ]);

      setData({
        newOrders: ordersNew.count ?? 0,
        lowStock: lowStock.count ?? 0,
        overduePOs: pos.count ?? 0,
        activeRepairs: repairs.count ?? 0,
        pendingRmas: rmas.count ?? 0,
        failedImports: importsFail.count ?? 0,
        recentOrders: recentOrders.data ?? [],
        criticalStock: criticalStock.data ?? [],
        overdueRepairs: overdueRepairs.data ?? [],
      });
    } catch {
      setData({ newOrders: 0, lowStock: 0, overduePOs: 0, activeRepairs: 0, pendingRmas: 0, failedImports: 0, recentOrders: [], criticalStock: [], overdueRepairs: [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <div className="space-y-6"><div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div><LoadingState /></div>;
  }

  const metrics = [
    { label: 'طلبات جديدة', value: data.newOrders, icon: <ShoppingCart className="w-5 h-5" />, variant: data.newOrders > 0 ? 'warning' : 'success' as const },
    { label: 'مخزون حرج', value: data.lowStock, icon: <AlertTriangle className="w-5 h-5" />, variant: data.lowStock > 0 ? 'error' : 'success' as const },
    { label: 'أوامر شراء معلقة', value: data.overduePOs, icon: <Clock className="w-5 h-5" />, variant: data.overduePOs > 0 ? 'warning' : 'success' as const },
    { label: 'إصلاحات نشطة', value: data.activeRepairs, icon: <Wrench className="w-5 h-5" />, variant: 'info' as const },
    { label: 'مرتجعات معلقة', value: data.pendingRmas, icon: <RotateCcw className="w-5 h-5" />, variant: data.pendingRmas > 0 ? 'warning' : 'success' as const },
    { label: 'استيرادات فاشلة', value: data.failedImports, icon: <Upload className="w-5 h-5" />, variant: data.failedImports > 0 ? 'error' : 'success' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-muted text-sm">
        <Radio className="w-4 h-4" />
        <span>مراقبة مباشرة لجميع العمليات</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">{m.icon}</div>
              <Badge variant={m.variant as 'warning' | 'error' | 'success' | 'info'}>{m.value > 0 ? 'يتطلب انتباه' : 'جيد'}</Badge>
            </div>
            <p className="text-muted text-sm">{m.label}</p>
            <p className="text-2xl font-bold text-app mt-1">{formatNumber(m.value)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="أحدث الطلبات">
          {data.recentOrders.length === 0 ? <p className="text-muted text-sm text-center py-8">لا توجد طلبات</p> :
           <div className="space-y-2">
             {data.recentOrders.map((o) => (
               <div key={o.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-app transition-colors">
                 <div><p className="font-medium text-app text-sm">{o.order_number}</p><p className="text-muted text-xs">{o.customers?.[0]?.name ?? '—'} — {formatDateTime(o.created_at)}</p></div>
                 <span className="text-sm font-semibold text-app">{formatCurrency(o.total)}</span>
               </div>
             ))}
           </div>}
        </SectionCard>

        <SectionCard title="مخزون حرج">
          {data.criticalStock.length === 0 ? <p className="text-muted text-sm text-center py-8">المخزون في حالة جيدة</p> :
           <div className="space-y-2">
             {data.criticalStock.map((s) => (
               <div key={s.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-app transition-colors">
                 <div><p className="font-medium text-app text-sm">{s.products?.[0]?.name ?? '—'}</p><code className="text-xs text-muted">{s.products?.[0]?.sku ?? ''}</code></div>
                 <div className="text-right"><p className="text-sm font-semibold text-error-600">{s.on_hand} متبقي</p><p className="text-xs text-muted">{s.reserved} محجوز</p></div>
               </div>
             ))}
           </div>}
        </SectionCard>

        <SectionCard title="إصلاحات تحتاج متابعة">
          {data.overdueRepairs.length === 0 ? <p className="text-muted text-sm text-center py-8">لا توجد إصلاحات معلقة</p> :
           <div className="space-y-2">
             {data.overdueRepairs.map((r) => (
               <div key={r.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-app transition-colors">
                 <div><p className="font-medium text-app text-sm">{r.ticket_number}</p><p className="text-muted text-xs">{r.customers?.[0]?.name ?? '—'}</p></div>
                 <div className="text-right">{r.sla_due_date && <p className="text-xs text-warning-600">SLA: {formatDateTime(r.sla_due_date)}</p>}<Badge variant="info">{r.status}</Badge></div>
               </div>
             ))}
           </div>}
        </SectionCard>

        <SectionCard title="ملخص الأداء">
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-app"><span className="text-muted text-sm">إجمالي العمليات النشطة</span><span className="font-semibold text-app">{formatNumber(data.newOrders + data.activeRepairs + data.pendingRmas)}</span></div>
            <div className="flex justify-between items-center pb-3 border-b border-app"><span className="text-muted text-sm">تنبيهات حرجة</span><span className="font-semibold text-app">{formatNumber(data.lowStock + data.failedImports)}</span></div>
            <div className="flex justify-between items-center"><span className="text-muted text-sm">حالة النظام</span><Badge variant={data.lowStock + data.failedImports > 0 ? 'warning' : 'success'}>{data.lowStock + data.failedImports > 0 ? 'يتطلب مراجعة' : 'مستقر'}</Badge></div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
