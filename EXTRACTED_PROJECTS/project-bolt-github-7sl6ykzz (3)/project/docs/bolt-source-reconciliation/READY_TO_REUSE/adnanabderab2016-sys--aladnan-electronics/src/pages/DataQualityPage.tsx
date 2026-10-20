import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SectionCard, LoadingState, Badge } from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import { Activity, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle } from 'lucide-react';

interface QualityReport {
  totalProducts: number;
  productsWithoutPrice: number;
  productsWithoutCategory: number;
  productsWithoutBrand: number;
  duplicateSkus: { sku: string; count: number }[];
  negativeStock: number;
  totalCustomers: number;
  duplicateCustomers: { code: string; count: number }[];
  duplicateSerials: number;
  duplicateImeis: number;
  orphanedInventory: number;
}

export default function DataQualityPage() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prodCount, noPrice, noCat, noBrand, allSkus, negStock, custCount, allCustCodes, dupSerials, dupImeis, orphanInv] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }).not('id', 'in', '(select product_id from price_rules where is_active = true)'),
        supabase.from('products').select('id', { count: 'exact', head: true }).is('category_id', null),
        supabase.from('products').select('id', { count: 'exact', head: true }).is('brand_id', null),
        supabase.from('products').select('sku'),
        supabase.from('inventory_items').select('id', { count: 'exact', head: true }).lt('on_hand', 0),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('code'),
        supabase.from('serial_devices').select('serial_number'),
        supabase.from('serial_devices').select('imei_1').not('imei_1', 'is', null),
        supabase.from('inventory_items').select('id', { count: 'exact', head: true }).not('product_id', 'in', '(select id from products)'),
      ]);

      // Compute duplicate SKUs
      const skuMap: Record<string, number> = {};
      (allSkus.data ?? []).forEach((p: { sku: string }) => { skuMap[p.sku] = (skuMap[p.sku] ?? 0) + 1; });
      const duplicateSkus = Object.entries(skuMap).filter(([, c]) => c > 1).map(([sku, count]) => ({ sku, count }));

      // Compute duplicate customer codes
      const codeMap: Record<string, number> = {};
      (allCustCodes.data ?? []).forEach((c: { code: string }) => { codeMap[c.code] = (codeMap[c.code] ?? 0) + 1; });
      const duplicateCustomers = Object.entries(codeMap).filter(([, c]) => c > 1).map(([code, count]) => ({ code, count }));

      // Duplicate serials
      const serialMap: Record<string, number> = {};
      (dupSerials.data ?? []).forEach((s: { serial_number: string }) => { serialMap[s.serial_number] = (serialMap[s.serial_number] ?? 0) + 1; });
      const serialDupCount = Object.values(serialMap).filter((c) => c > 1).length;

      // Duplicate IMEIs
      const imeiMap: Record<string, number> = {};
      (dupImeis.data ?? []).forEach((s: { imei_1: string }) => { imeiMap[s.imei_1] = (imeiMap[s.imei_1] ?? 0) + 1; });
      const imeiDupCount = Object.values(imeiMap).filter((c) => c > 1).length;

      setReport({
        totalProducts: prodCount.count ?? 0,
        productsWithoutPrice: noPrice.count ?? 0,
        productsWithoutCategory: noCat.count ?? 0,
        productsWithoutBrand: noBrand.count ?? 0,
        duplicateSkus,
        negativeStock: negStock.count ?? 0,
        totalCustomers: custCount.count ?? 0,
        duplicateCustomers,
        duplicateSerials: serialDupCount,
        duplicateImeis: imeiDupCount,
        orphanedInventory: orphanInv.count ?? 0,
      });
    } catch {
      setReport(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !report) {
    return <div className="space-y-6"><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div><LoadingState /></div>;
  }

  const issues = [
    { label: 'منتجات بلا سعر', value: report.productsWithoutPrice, severity: 'warning' as const },
    { label: 'منتجات بلا تصنيف', value: report.productsWithoutCategory, severity: 'warning' as const },
    { label: 'منتجات بلا علامة تجارية', value: report.productsWithoutBrand, severity: 'info' as const },
    { label: 'مخزون سالب', value: report.negativeStock, severity: 'error' as const },
    { label: 'أرقام تسلسلية مكررة', value: report.duplicateSerials, severity: 'error' as const },
    { label: 'IMEI مكرر', value: report.duplicateImeis, severity: 'error' as const },
    { label: 'مخزون يتيم', value: report.orphanedInventory, severity: 'error' as const },
  ];

  const totalIssues = issues.reduce((s, i) => s + i.value, 0) + report.duplicateSkus.length + report.duplicateCustomers.length;
  const score = report.totalProducts > 0 ? Math.max(0, Math.round(100 - (totalIssues / Math.max(1, report.totalProducts + report.totalCustomers)) * 100)) : 100;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center"><Activity className="w-6 h-6 text-primary-600" /></div>
            <div><h3 className="font-semibold text-app">درجة جودة البيانات</h3><p className="text-muted text-sm">تقييم شامل لسلامة البيانات</p></div>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${score >= 90 ? 'text-success-600' : score >= 75 ? 'text-warning-600' : 'text-error-600'}`}>{score}</p>
            <p className="text-muted text-xs">من 100</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {issues.map((issue) => (
          <div key={issue.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              {issue.value === 0 ? <CheckCircle className="w-4 h-4 text-success-600" /> : <AlertTriangle className="w-4 h-4 text-warning-600" />}
              <Badge variant={issue.value === 0 ? 'success' : issue.severity}>{issue.value === 0 ? 'سليم' : 'مشكلة'}</Badge>
            </div>
            <p className="text-muted text-sm">{issue.label}</p>
            <p className="text-xl font-bold text-app mt-1">{formatNumber(issue.value)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="SKU مكررة">
          {report.duplicateSkus.length === 0 ? <div className="flex items-center gap-2 text-success-600 text-sm py-4"><CheckCircle className="w-4 h-4" /> لا توجد SKU مكررة</div> :
           <div className="space-y-2">{report.duplicateSkus.map((d) => <div key={d.sku} className="flex items-center justify-between p-3 rounded-xl bg-app/50"><code className="text-sm text-app" dir="ltr">{d.sku}</code><Badge variant="error">{d.count} مكرر</Badge></div>)}</div>}
        </SectionCard>

        <SectionCard title="أكواد عملاء مكررة">
          {report.duplicateCustomers.length === 0 ? <div className="flex items-center gap-2 text-success-600 text-sm py-4"><CheckCircle className="w-4 h-4" /> لا توجد أكواد مكررة</div> :
           <div className="space-y-2">{report.duplicateCustomers.map((d) => <div key={d.code} className="flex items-center justify-between p-3 rounded-xl bg-app/50"><code className="text-sm text-app" dir="ltr">{d.code}</code><Badge variant="error">{d.count} مكرر</Badge></div>)}</div>}
        </SectionCard>
      </div>

      {totalIssues === 0 && (
        <div className="card p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-success-50 dark:bg-success-900/20 flex items-center justify-center mx-auto mb-3"><CheckCircle className="w-7 h-7 text-success-600" /></div>
          <p className="font-semibold text-app">جودة البيانات ممتازة</p>
          <p className="text-muted text-sm mt-1">جميع الفحوصات نجحت — لا توجد مشاكل في البيانات</p>
        </div>
      )}
    </div>
  );
}
