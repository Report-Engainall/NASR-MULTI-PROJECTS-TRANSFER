import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { StatCard, SectionCard, LoadingState } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { TrendingUp, Package, ShoppingCart, Users, TriangleAlert as AlertTriangle } from 'lucide-react';

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalCustomers: 0,
    totalOrders: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    ordersByStatus: [] as { status: string; count: number }[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, custRes, orderRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('total, status'),
      ]);

      const orders = orderRes.data ?? [];
      const totalRevenue = orders.reduce((s, o) => s + (o.total ?? 0), 0);
      const statusMap: Record<string, number> = {};
      orders.forEach((o) => { statusMap[o.status] = (statusMap[o.status] ?? 0) + 1; });
      const ordersByStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);

      setStats({
        totalProducts: prodRes.count ?? 0,
        totalCustomers: custRes.count ?? 0,
        totalOrders: orders.length,
        totalRevenue,
        avgOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
        ordersByStatus,
      });
    } catch {
      // Keep defaults
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div><LoadingState /></div>;
  }

  const statusLabels: Record<string, string> = {
    draft: 'مسودة', submitted: 'مُرسلة', received: 'مستلمة', confirmed: 'مؤكدة', processing: 'قيد المعالجة',
    packed: 'مُعبأة', ready: 'جاهزة', delivered: 'مُسلمة', completed: 'مكتملة', returned: 'مُرجعة',
    cancelled: 'ملغاة', rejected: 'مرفوضة', payment_pending: 'بانتظار الدفع',
  };

  const maxCount = Math.max(...stats.ordersByStatus.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="المنتجات" value={formatNumber(stats.totalProducts)} icon={<Package className="w-5 h-5" />} />
        <StatCard label="العملاء" value={formatNumber(stats.totalCustomers)} icon={<Users className="w-5 h-5" />} />
        <StatCard label="الطلبات" value={formatNumber(stats.totalOrders)} icon={<ShoppingCart className="w-5 h-5" />} />
        <StatCard label="إجمالي الإيرادات" value={formatCurrency(stats.totalRevenue)} icon={<TrendingUp className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="توزيع الطلبات حسب الحالة">
          {stats.ordersByStatus.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">لا توجد بيانات</p>
          ) : (
            <div className="space-y-3">
              {stats.ordersByStatus.map((s) => (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-sm text-app w-24 shrink-0">{statusLabels[s.status] ?? s.status}</span>
                  <div className="flex-1 bg-app rounded-full h-6 overflow-hidden">
                    <div className="bg-primary-500 h-full rounded-full transition-all duration-500" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium text-app w-8 text-left">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="ملخص الأداء">
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-app">
              <span className="text-muted text-sm">متوسط قيمة الطلب</span>
              <span className="font-semibold text-app">{formatCurrency(stats.avgOrderValue)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-app">
              <span className="text-muted text-sm">إجمالي الإيرادات</span>
              <span className="font-semibold text-app">{formatCurrency(stats.totalRevenue)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-app">
              <span className="text-muted text-sm">عدد المنتجات</span>
              <span className="font-semibold text-app">{formatNumber(stats.totalProducts)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted text-sm">عدد العملاء</span>
              <span className="font-semibold text-app">{formatNumber(stats.totalCustomers)}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="card p-4 bg-warning-50/50 dark:bg-warning-900/10 border-warning-200 dark:border-warning-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-app">حالة البيانات: تحليل حتمي</p>
            <p className="text-xs text-muted mt-0.5">جميع الأرقام محسوبة مباشرة من قاعدة البيانات — لا تقديرات ولا ذكاء اصطناعي في الحسابات المالية.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
