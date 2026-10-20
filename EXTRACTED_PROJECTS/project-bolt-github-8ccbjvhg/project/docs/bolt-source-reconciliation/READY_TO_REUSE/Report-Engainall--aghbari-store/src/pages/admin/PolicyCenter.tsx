import { useEffect, useState } from 'react'
import { CheckCircle2, LockKeyhole, PackageCheck, Palette, ReceiptText, Save, Settings2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useCommercePolicies, type CommercePolicies, type QuantityInputTone } from '@/lib/useCommercePolicies'

function PolicyNumberField({ title, description, value, min, max, onChange, step = 1, suffix }: {
  title: string
  description: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  step?: number
  suffix?: string
}) {
  return <label className="block rounded-xl border border-neutral-200 p-4">
    <span className="block font-semibold text-neutral-900">{title}</span>
    <span className="mt-1 block text-xs leading-5 text-neutral-500">{description}</span>
    <span className="mt-3 flex items-center gap-2">
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={event => { if (event.target.value !== '' && Number.isFinite(Number(event.target.value))) onChange(Number(event.target.value)) }}
        className="input max-w-44" />
      {suffix && <span className="text-sm text-neutral-500">{suffix}</span>}
    </span>
  </label>
}

function PolicyToggle({ checked, onChange, title, description, disabled = false }: {
  checked: boolean
  onChange: (value: boolean) => void
  title: string
  description: string
  disabled?: boolean
}) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4 transition ${disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-primary-200'}`}>
      <span className="min-w-0">
        <span className="block font-semibold text-neutral-900">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-neutral-500">{description}</span>
      </span>
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-primary-600"
      />
    </label>
  )
}

export default function PolicyCenter() {
  const { organization, isAdmin } = useAuth()
  const { show } = useToast()
  const { policies, loading, saving, error, save, refresh } = useCommercePolicies()
  const [draft, setDraft] = useState<CommercePolicies>(policies)

  useEffect(() => setDraft(policies), [policies])

  const change = <K extends keyof CommercePolicies>(key: K, value: CommercePolicies[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
  }

  const submit = async () => {
    if (!(draft.dqs_excellent_min > draft.dqs_acceptable_min && draft.dqs_acceptable_min > draft.dqs_warning_min)) {
      show('error', 'حدود DQS غير صحيحة', 'يجب أن يكون حد الممتاز أعلى من المقبول، وحد المقبول أعلى من المراجعة/الرفض.')
      return
    }
    const numericPolicyEntries: [string, number, number, number][] = [
      ['حجم شريحة الرفع', draft.upload_chunk_size_mb, 2, 5],
      ['شريحة المعالجة', draft.processing_chunk_size, 500, 2000],
      ['الحد الأقصى للملف', draft.max_file_size_mb, 1, 100],
      ['أقصى عدد صفوف', draft.max_import_rows, 1, 100000],
      ['أقصى عدد أعمدة', draft.max_import_columns, 1, 100],
      ['أقصى طول للخلية', draft.max_cell_length, 1, 4000],
      ['عامل فك الضغط', draft.max_archive_expansion_factor, 1, 10],
      ['مدة الاحتفاظ', draft.import_retention_days, 1, 3650],
      ['مدة منع التكرار', draft.idempotency_ttl_hours, 1, 168],
    ]
    const invalidPolicy = numericPolicyEntries.find(([, value, min, max]) => !Number.isFinite(value) || value < min || value > max)
    if (invalidPolicy) { show('error', 'قيمة سياسة خارج الحدود', invalidPolicy[0]); return }
    const saved = await save(draft)
    if (saved) show('success', 'تم حفظ سياسات المؤسسة', 'تُطبق السياسات المحفوظة على مسارات الواجهة والخادم التي تدعمها.')
    else show('error', 'تعذر حفظ السياسات')
  }

  const tones: { value: QuantityInputTone; title: string; hint: string; className: string }[] = [
    { value: 'sky', title: 'أزرق هادئ', hint: 'تمييز لطيف للحقل النشط', className: 'border-sky-200 bg-sky-50 text-sky-800' },
    { value: 'mint', title: 'أخضر نعناعي', hint: 'إشارة هادئة للحالة النشطة', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    { value: 'slate', title: 'رمادي متناسق', hint: 'تمييز محايد وقليل التباين', className: 'border-slate-200 bg-slate-50 text-slate-800' },
  ]

  if (!organization) return <div className="p-6"><div className="card p-6">يلزم تحديد المؤسسة قبل إدارة السياسات.</div></div>

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"><Settings2 className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">مركز السياسات</h1>
            <p className="mt-1 text-sm text-neutral-500">سياسات الطلبات والأسعار وسلوك شاشة العميل الخاصة بـ {organization.name}.</p>
          </div>
        </div>
        <button type="button" onClick={refresh} disabled={loading || saving} className="btn-secondary btn-sm">تحديث السياسات</button>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
        تعذر قراءة أو حفظ الإعدادات الأخيرة. تعمل الواجهة بإعدادات أمان افتراضية: إخفاء الأسعار واشتراط اعتماد الكميات.
        <p className="mt-1 break-words text-xs opacity-80">{error}</p>
      </div>}

      {!isAdmin && <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">يمكنك عرض السياسات؛ التعديل محفوظ لمالك المؤسسة أو مسؤولها فقط.</div>}

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">خصوصية الأسعار والعميل</h2></div>
        <div className="space-y-3">
          <PolicyToggle checked={true} onChange={() => undefined} disabled title="إخفاء الأسعار عن حسابات العملاء (سياسة إلزامية)" description="هذا الشرط لا يمكن تعطيله من الواجهة: لا تعرض واجهة العميل أسعاراً أو إجماليات رقمية في الطلب أو الفاتورة قبل الاعتماد أو بعده." />
          <PolicyToggle checked={true} onChange={() => undefined} disabled title="طلب إرسال المبلغ بعد اعتماد الإدارة (إلزامي)" description="بعد اعتماد الكميات، يُتاح للعميل تسجيل بيانات الدفع؛ ولا تصدر فاتورة بيع نهائية قبل تحقق الإدارة من إجمالي الدفعات." />
        </div>
      </section>

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">اعتماد الكميات</h2></div>
        <div className="space-y-3">
          <PolicyToggle checked={true} onChange={() => undefined} disabled title="منع مغادرة شاشة اعتماد الكميات قبل الحفظ (إلزامي)" description="لا تعتمد الكمية بسبب blur؛ الاعتماد عبر عملية خادمية صريحة. عند فقدان التركيز أو النقر على رابط ينتج تنبيه وتُحفظ التغييرات فقط بعد الاعتماد." />
        </div>
        <div className="mt-5">
          <p className="mb-3 font-semibold text-neutral-800">لون الحقل النشط للكمية المعتمدة</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tones.map(tone => <button key={tone.value} type="button" onClick={() => change('quantity_input_tone', tone.value)} aria-pressed={draft.quantity_input_tone === tone.value} className={`rounded-xl border p-4 text-right transition ${tone.className} ${draft.quantity_input_tone === tone.value ? 'ring-2 ring-primary-500 ring-offset-2' : ''}`}>
              <span className="block font-semibold">{tone.title}</span><span className="mt-1 block text-xs">{tone.hint}</span>
              {draft.quantity_input_tone === tone.value && <span className="mt-2 block text-xs font-bold">✓ محدد</span>}
            </button>)}
          </div>
        </div>
      </section>

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">محرك الاستيراد وجودة البيانات</h2></div>
        <p className="mb-4 text-sm leading-6 text-neutral-600">القيم التالية تُحفظ لكل مؤسسة ويُستهلك جزء منها في مسار CSV الحالي. خيارات الرفع القابل للاستئناف وقراءة Excel/PDF والدمج التشغيلي لم تكتمل بعد؛ لذلك تُعرض إعداداتها دون الادعاء بأنها مفعّلة في محركات غير موجودة.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PolicyNumberField title="حجم شريحة الرفع" description="إعداد لمسار الرفع القابل للاستئناف؛ غير مستخدم حالياً لأن الملف لا يرفع خاماً إلى Storage." value={draft.upload_chunk_size_mb} min={2} max={5} suffix="MB" onChange={v => change('upload_chunk_size_mb', v)} />
          <PolicyNumberField title="شريحة المعالجة" description="عدد السجلات في كل دفعة؛ مستخدم في استيراد CSV." value={draft.processing_chunk_size} min={500} max={2000} suffix="سجل" onChange={v => change('processing_chunk_size', v)} />
          <PolicyNumberField title="الحد الأقصى للملف" description="الحجم الأقصى للملف الوارد." value={draft.max_file_size_mb} min={1} max={100} suffix="MB" onChange={v => change('max_file_size_mb', v)} />
          <PolicyNumberField title="أقصى عدد صفوف" description="حد صفوف البيانات في الملف." value={draft.max_import_rows} min={1} max={100000} suffix="صف" onChange={v => change('max_import_rows', v)} />
          <PolicyNumberField title="أقصى عدد أعمدة" description="منع الملفات ذات الأعمدة المفرطة." value={draft.max_import_columns} min={1} max={100} suffix="عمود" onChange={v => change('max_import_columns', v)} />
          <PolicyNumberField title="أقصى طول للخلية" description="الخلايا الأطول تُرفض قيمتها ويُسجل الخطأ." value={draft.max_cell_length} min={1} max={4000} suffix="حرف" onChange={v => change('max_cell_length', v)} />
          <PolicyNumberField title="حد فك الضغط" description="حد عامل التوسع للملفات المؤرشفة؛ لم يتم تفعيل قارئ الأرشيف بعد." value={draft.max_archive_expansion_factor} min={1} max={10} suffix="×" onChange={v => change('max_archive_expansion_factor', v)} />
          <PolicyNumberField title="DQS — ممتاز" description="الحد الأدنى لقبول الجودة الممتازة." value={draft.dqs_excellent_min} min={50} max={100} suffix="/100" onChange={v => change('dqs_excellent_min', v)} />
          <PolicyNumberField title="DQS — مقبول" description="من هنا يبدأ نطاق القبول مع التحذيرات." value={draft.dqs_acceptable_min} min={25} max={99} suffix="/100" onChange={v => change('dqs_acceptable_min', v)} />
          <PolicyNumberField title="DQS — مراجعة / رفض" description="أقل من الحد يتطلب رفض الدفعة؛ وما فوقه إلى المقبول يتطلب مراجعة." value={draft.dqs_warning_min} min={0} max={98} suffix="/100" onChange={v => change('dqs_warning_min', v)} />
          <PolicyNumberField title="مدة الاحتفاظ" description="إعداد زمني لسجلات/لقطات الاستيراد؛ الإتلاف التشفيري الآلي لم يُنفذ بعد." value={draft.import_retention_days} min={1} max={3650} suffix="يوم" onChange={v => change('import_retention_days', v)} />
        </div>
      </section>

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">الموثوقية والأداء</h2></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PolicyNumberField title="مهلة منع التكرار" description="مدة صلاحية مفاتيح idempotency لعمليات الخادم الجديدة." value={draft.idempotency_ttl_hours} min={1} max={168} suffix="ساعة" onChange={v => change('idempotency_ttl_hours', v)} />
          <PolicyNumberField title="مهلة المهمة الثقيلة" description="ميزانية زمنية مستهدفة للمهام غير المتزامنة." value={draft.max_processing_timeout_seconds} min={10} max={3600} suffix="ثانية" onChange={v => change('max_processing_timeout_seconds', v)} />
          <PolicyNumberField title="هدف استجابة API" description="SLO مستهدف؛ يحتاج قياس P95 ومراقبة تشغيلية ليكون دليلاً." value={draft.api_p95_target_ms} min={50} max={10000} suffix="ms P95" onChange={v => change('api_p95_target_ms', v)} />
          <PolicyNumberField title="هدف البحث" description="زمن الاستجابة المستهدف؛ فهرسة البحث العربي ذات الإصدارات لم تكتمل." value={draft.search_p95_target_ms} min={25} max={5000} suffix="ms P95" onChange={v => change('search_p95_target_ms', v)} />
        </div>
        <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">
          <strong>سياسة التشغيل:</strong> الطلبات تبقى متصلة بالخادم فقط ولا تُحفظ محلياً كطلبات Offline. تصدر الفاتورة الأولية عند إنشاء الطلب، وتصبح فاتورة بيع رسمية بعد تأكيد الدفعات التي تغطي كامل القيمة من الإدارة.
        </div>
      </section>

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">حوكمة الذكاء الاصطناعي والخصوصية</h2></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PolicyNumberField title="حصة يومية" description="صفر يعني عدم السماح باستدعاءات نموذج مدفوع في الوضع الافتراضي." value={draft.ai_daily_token_quota} min={0} max={100000000} suffix="token" onChange={v => change('ai_daily_token_quota', v)} />
          <PolicyNumberField title="حصة شهرية" description="حد استهلاك مجمّع قبل الحظر." value={draft.ai_monthly_token_quota} min={0} max={1000000000} suffix="token" onChange={v => change('ai_monthly_token_quota', v)} />
          <PolicyNumberField title="ميزانية الطلب" description="السقف التقديري لكل طلب AI بالدولار؛ القيمة الافتراضية صفر." value={draft.ai_request_budget_usd} min={0} max={100} step={0.01} suffix="USD" onChange={v => change('ai_request_budget_usd', v)} />
        </div>
        <div className="mt-4 space-y-3">
          <PolicyToggle checked={true} onChange={() => undefined} disabled title="موافقة صريحة قبل تمرير بيانات للخدمات الخارجية" description="إلزامي؛ حتى يتم تنفيذ منظومة توجيه وتنقية البيانات يجب أن تبقى حصص AI الافتراضية صفراً." />
          <PolicyToggle checked={true} onChange={() => undefined} disabled title="الرجوع إلى محرك القواعد عند تجاوز الحصة أو تعذر AI" description="إلزامي في سياسة النظام. دفتر استهلاك AI وراوتر النماذج ما زالا غير منفذين، لذا لا تُعد هذه الحقول دليلاً على وجود محرك AI." />
          <PolicyToggle checked={true} onChange={() => undefined} disabled title="حظر الطلبات دون اتصال" description="إلزامي؛ مصدر الحقيقة للطلبات هو الخادم وليس تخزيناً محلياً أو طابور Offline." />
        </div>
      </section>

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">مصفوفة حالة التنفيذ</h2></div>
        <p className="mb-4 text-sm leading-6 text-neutral-600">الحالة أدناه تفصل ما تم ربطه فعلياً بما لا يزال يحتاج محركاً/اختباراً؛ حفظ قيمة سياسة وحده لا يعني تنفيذها.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ['إخفاء أسعار العميل','مرتبط بواجهة تفاصيل الطلب وقائمة الفواتير',true],
            ['اعتماد الكميات','RPC خادمي ذرّي مع تحقق صلاحية المؤسسة',true],
            ['احتساب الجملة والتجزئة','قواعد SQL مع إعادة احتساب السعر عند تغيير/حذف القاعدة',true],
            ['CSV ودرجة الجودة','Streaming CSV، دفعات، تطبيع، كشف تكرار وSnapshot',true],
            ['Excel وPDF','قارئ الجدول غير مربوط؛ التحويل للمراجعة فقط',false],
            ['دمج الاستيراد إلى Live DB','لم يُنفذ بعد، لذلك لا تُغيّر بيانات التشغيل من Snapshot',false],
            ['مطابقة مخزون أونكس','المحرك المعزول ومطابقة المخزون غير منفذين',false],
            ['حوكمة AI / دفتر التكلفة','الحصص مخزنة، لكن Ledger والراوتر والتنقية غير مربوطة',false],
            ['Outbox delivery / DLQ','تُسجل الأحداث؛ عامل التسليم والتعافي غير مثبت',false],
            ['منع تكرار كلمة المرور عالمياً','غير منفذ؛ لا يجوز حفظ كلمات المرور/بصمات قابلة للمقارنة خارج مزود الهوية',false],
            ['جلسة جهاز واحد','يحتاج إبطال جلسات server-side واختباراً عملياً',false],
          ].map(([title, description, done]) => <div key={String(title)} className="rounded-xl border border-neutral-200 p-4">
            <div className="flex items-start justify-between gap-2"><strong className="text-sm">{String(title)}</strong><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${done ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>{done ? 'مرتبط جزئياً' : 'مفتوح'}</span></div>
            <p className="mt-2 text-xs leading-5 text-neutral-500">{String(description)}</p>
          </div>)}
        </div>
      </section>

      <section className="card mb-6 p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">حدود تطبيق السياسات</h2></div>
        <p className="text-sm leading-7 text-neutral-600">هذه الإعدادات تُحفظ على مستوى المؤسسة وتُقرأ من سجل السياسات الخاص بها. يتم تفعيل أي سياسة فقط بعد ربطها بمسارات التنفيذ والتحقق المناسبة؛ لا يُعتبر وجود مفتاح إعداد وحده دليلاً على اكتمال بقية محركات المذكرة.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-neutral-50 p-3 text-sm"><ReceiptText className="mb-2 h-4 w-4 text-neutral-500" /><strong>مسارات الطلب والفاتورة</strong><p className="mt-1 text-neutral-500">إخفاء الأرقام المالية من واجهات العميل مع إبقائها في السجلات التشغيلية للإدارة.</p></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-sm"><Palette className="mb-2 h-4 w-4 text-neutral-500" /><strong>هوية الواجهة</strong><p className="mt-1 text-neutral-500">لون الحقل النشط اختيار مرئي؛ ولا يغيّر السعر أو حالة اعتماد الكمية.</p></div>
        </div>
      </section>

      <div className="sticky bottom-3 flex justify-between gap-3 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <span className="flex items-center gap-2 text-xs text-neutral-500"><CheckCircle2 className="h-4 w-4" /> التغييرات لا تُحفظ قبل الضغط</span>
        <button type="button" onClick={submit} disabled={loading || saving || !isAdmin} className="btn-primary"><Save className="h-4 w-4" />{saving ? 'جارٍ الحفظ…' : 'حفظ السياسات'}</button>
      </div>
    </div>
  )
}
