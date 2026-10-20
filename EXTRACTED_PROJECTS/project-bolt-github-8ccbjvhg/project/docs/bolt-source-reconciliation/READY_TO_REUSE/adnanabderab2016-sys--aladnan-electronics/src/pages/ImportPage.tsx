import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { EmptyState, LoadingState, Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { Upload, FileSpreadsheet, Loader as Loader2, CircleAlert as AlertCircle, X } from 'lucide-react';
import type { ImportJob } from '@/types';

const PROFILES = [
  { key: 'products', label: 'منتجات' },
  { key: 'prices', label: 'أسعار' },
  { key: 'inventory', label: 'مخزون' },
  { key: 'customers', label: 'عملاء' },
  { key: 'suppliers', label: 'موردون' },
  { key: 'sales', label: 'مبيعات' },
  { key: 'purchases', label: 'مشتريات' },
  { key: 'mixed', label: 'مختلط' },
];

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'تم الرفع', detecting: 'كشف', mapping: 'تخطيط', validating: 'تحقق',
  previewing: 'معاينة', committing: 'تنفيذ', completed: 'مكتمل', failed: 'فشل', cancelled: 'ملغي',
};
function statusVariant(s: string) {
  if (s === 'completed') return 'success' as const;
  if (s === 'failed' || s === 'cancelled') return 'error' as const;
  return 'warning' as const;
}

export default function ImportPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState('products');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('import_jobs').select('*').order('created_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      // Compute file hash
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

      // Check for duplicate import (idempotency)
      const { data: existing } = await supabase.from('import_jobs').select('id').eq('file_hash', hashHex).eq('profile', profile).maybeSingle();
      if (existing) {
        setError('تم استيراد هذا الملف مسبقاً بنفس الملف الشخصي. إعادة الاستيراد ممنوعة (منع التكرار).');
        setUploading(false);
        return;
      }

      // Create import job
      const { error: insertErr } = await supabase.from('import_jobs').insert({
        profile,
        file_name: file.name,
        file_hash: hashHex,
        status: 'uploaded',
        total_rows: 0,
      });

      if (insertErr) {
        setError(insertErr.message);
      } else {
        load();
      }
    } catch {
      setError('فشل قراءة الملف');
    }
    setUploading(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      <div className="card p-5">
        <h3 className="font-semibold text-app mb-4">استيراد بيانات جديد</h3>

        {/* Profile selection */}
        <div className="mb-4">
          <label className="label" htmlFor="profile">نوع البيانات</label>
          <select id="profile" value={profile} onChange={(e) => setProfile(e.target.value)} className="input max-w-xs">
            {PROFILES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragOver ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10' : 'border-app hover:border-primary-300'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.json,.xml,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              <p className="text-muted text-sm">جاري رفع الملف...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="font-medium text-app">اسحب الملف هنا أو اضغط للاختيار</p>
                <p className="text-muted text-sm mt-1">Excel, CSV, JSON, XML, PDF — الحد الأقصى 50 ميجابايت</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 bg-error-50 dark:bg-error-900/20 text-error-700 dark:text-error-300 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="mr-auto btn-ghost p-1"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Info */}
        <div className="mt-4 bg-app rounded-xl p-4">
          <p className="text-sm text-muted">
            <strong className="text-app">محرك استيراد موحد:</strong> جميع الملفات تمر عبر مسار واحد — رفع، كشف، تخطيط، تطبيع، تحقق، معاينة، تنفيذ، تدقيق.
            كل استيراد يمنع التكرار عبر بصمة الملف (hash) ويدعم التتبع الكامل.
          </p>
        </div>
      </div>

      {/* Jobs history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-app"><h3 className="font-semibold text-app">سجل الاستيراد</h3></div>
        {loading ? <div className="p-5"><LoadingState rows={4} /></div> :
         jobs.length === 0 ? <EmptyState icon={<FileSpreadsheet className="w-8 h-8" />} title="لا توجد عمليات استيراد" description="ابدأ برفع ملف للاستيراد" /> :
         <div className="overflow-x-auto"><table className="w-full text-sm">
           <thead><tr className="border-b border-app bg-app/50">
             <th className="text-right font-medium text-muted px-4 py-3">الملف</th>
             <th className="text-right font-medium text-muted px-4 py-3 hidden sm:table-cell">النوع</th>
             <th className="text-right font-medium text-muted px-4 py-3">الحالة</th>
             <th className="text-right font-medium text-muted px-4 py-3 hidden md:table-cell">الصفوف</th>
             <th className="text-right font-medium text-muted px-4 py-3 hidden md:table-cell">التاريخ</th>
           </tr></thead>
           <tbody>
             {jobs.map((j) => (
               <tr key={j.id} className="border-b border-app last:border-0 hover:bg-app/30 transition-colors">
                 <td className="px-4 py-3">
                   <div className="flex items-center gap-3">
                     <div className="w-9 h-9 rounded-lg bg-secondary-100 dark:bg-secondary-800/40 flex items-center justify-center shrink-0">
                       <FileSpreadsheet className="w-4 h-4 text-secondary-600 dark:text-secondary-300" />
                     </div>
                     <div className="min-w-0"><p className="font-medium text-app truncate">{j.file_name}</p><code className="text-xs text-muted">{j.file_hash.slice(0, 12)}...</code></div>
                   </div>
                 </td>
                 <td className="px-4 py-3 hidden sm:table-cell text-muted">{PROFILES.find((p) => p.key === j.profile)?.label ?? j.profile}</td>
                 <td className="px-4 py-3"><Badge variant={statusVariant(j.status)}>{STATUS_LABELS[j.status] ?? j.status}</Badge></td>
                 <td className="px-4 py-3 hidden md:table-cell text-muted">{j.total_rows > 0 ? `${j.processed_rows}/${j.total_rows}` : '—'}</td>
                 <td className="px-4 py-3 hidden md:table-cell text-muted text-xs">{formatDateTime(j.created_at)}</td>
               </tr>
             ))}
           </tbody>
         </table></div>}
      </div>
    </div>
  );
}
