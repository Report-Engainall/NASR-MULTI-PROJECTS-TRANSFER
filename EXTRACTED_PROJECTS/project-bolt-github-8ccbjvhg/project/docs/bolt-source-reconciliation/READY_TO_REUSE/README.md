# READY_TO_REUSE — فهرس الأكواد الجاهزة للمراجعة والدمج

**الموقع:** `docs/bolt-source-reconciliation/READY_TO_REUSE/`  
**الهدف:** تقليل إعادة الإنشاء: هذه نسخ حقيقية مأخوذة من ملفات المصدر، وليست أمثلة مولّدة.  
**إثبات النسخ:** `PROVENANCE_MANIFEST.csv` يربط كل ملف مستلم بمصدره ومساره وبصمته.  
**حدود الإثبات:** تطابق Git blob SHA يثبت تطابق محتوى الملف في لقطة المصدر والنسخة المرفقة، لكنه لا يثبت أن الملف يعمل في Nasr1 أو أن تبعياته متوافقة.

## الملفات التي أُرفقت بالفعل

### 1. `Aghbari-Technologies--aghbari-commerce-evolved/` — مصدر قريب جدًا من الهدف

الملفات:
- `src/lib/customer-addresses.ts` — عقود قراءة/حفظ/حذف دفتر عناوين العميل عبر RPC.
- `src/lib/customer-company-members.ts` — عضويات الشركة والدعوات والقبول والإلغاء والتحقق من استجابة الخادم.
- `src/lib/unified-import.ts` — أساس الاستيراد الموحد: حدود الملفات/الصفوف، canonical JSON، SHA-256 تدريجي، تحقق من تسلسل شرائح الاستئناف، ومرادفات رؤوس عربية/إنجليزية.
- `src/lib/finance-document-pdf.ts` — توليد مستندات PDF مالية.
- `src/routes/api.invoice-pdf.$invoiceId.ts` — مسار توليد PDF للفاتورة، ويحتاج مواءمة مع راوتر Nasr1 قبل النقل.
- `src/test/tenant-scope.test.ts` — اختبارات نطاق/عزل كمرجع لإعادة الاستخدام.

HEAD المصدر المسجل: `d24695209b45f2352e0ba994e1f5109d7e2afc9d`.

### 2. `Report-Engainall--aghbari-commerce/` — منطق تجاري واختبارات وأمثلة SQL

يتضمن وحدات مباشرة للاستخدام/الاقتباس بعد المصالحة:
- المجال: `src/domain/types.ts`, `pricing.ts`, `import.ts`, `importProfiles.ts`, `order.ts`, `outbox.ts`, `catalog.ts`, `businessIntelligence.ts`, `image.ts`.
- الخدمات: `src/services/cart.ts`, `catalog.ts`, `customerOrders.ts`, `customers.ts`, `finance.ts`, `importExcel.ts`, `inventory.ts`, `orders.ts`, `staffOrders.ts`.
- إعادة المحاولة: `src/lib/retry.ts`.
- اختبارات الوحدة والعقود وحدود الإدخال المرتبطة بالوحدات أعلاه تحت `src/**/*.test.ts`.
- عقد الخدمة والأمن: `docs/DOMAIN-API-CONTRACT-MAP-V1.md` و`docs/SECURITY-RBAC-RLS-BASELINE.md`.
- عامل Outbox: `supabase/functions/outbox-worker/index.ts` — قارن هذا الملف بملف Nasr1 الموجود الذي يختلف محتواه.
- مراجع SQL/tests محصورة في مجلد المراجعة: atomic import commit، order concurrency، import boundary، outbox claim/recovery، idempotency race authority، finance/invoices/cash/expenses، اختبارات RLS/صلاحيات RPC والتزامن.

HEAD المصدر المسجل: `00d7446bba9652ea40178a08b00c9da9a2bba8a1`.

### 3. `Report-Engainall--aghbari-store/` — استيراد وقرارات المنتج والسياسات والواجهة

- `src/lib/csvImportPipeline.ts` — خط استيراد CSV.
- `src/lib/sha256File.ts` — بصمة الملفات.
- `src/lib/customerProductSelect.ts` — اختيار/عرض المنتجات ضمن سياق العميل.
- `src/lib/orders.ts` — وحدة أوامر مختصرة.
- `src/lib/useCommercePolicies.ts` — سياسات التجارة.
- `src/components/storefront/ProductCard.tsx` — بطاقة منتج بديلة مرجعية.
- `src/pages/admin/PolicyCenter.tsx` — مركز السياسات.
- `src/pages/admin/AIAssistant.tsx` — واجهة المساعد.

HEAD المصدر المسجل: `df3d7dd13276910d90a7273c8ace13e9a74ee277`.

### 4. `adnanabderab2016-sys--aladnan-electronics/` — شاشات مرجعية لعمليات الإدارة

- `src/pages/ImportPage.tsx`
- `src/pages/DataQualityPage.tsx`
- `src/pages/AnalyticsPage.tsx`
- `src/pages/ControlTowerPage.tsx`
- `src/pages/PricingPage.tsx`
- `src/pages/OrdersPage.tsx`
- `src/components/ui.tsx`

HEAD المصدر المسجل: `99eb3fa452eb3344c4c1fd625209e20d2f7169ed`.

هذه الشاشة ليست ترخيصًا لاستبدال تصميم Nasr1. خذ التدفق والحقول والحالات والمنطق الصالح فقط، وأعد توصيله بمكونات Nasr1 مع الحفاظ على ألوانه وشعاره وتخطيطه الحالي.

## طريقة استخدام الأكواد — إلزامية

1. افتح كل ملف مرفق وقارنه بالمنطق الموجود في Nasr1؛ لا تفترض غيابه قبل الفحص، ولا تكرر وظيفة موجودة.
2. **إن كان الملف كاملًا ومتوافقًا:** انقله/استخدمه بدل إعادة كتابة الوظيفة من الصفر، مع إضافة imports/ties اللازمة فقط.
3. **إن كان مكتمل المنطق لكن تبعياته تختلف:** احتفظ بالمنطق والاختبارات، وكيّف طبقة الوصول للبيانات والـimports والراوتر مع Nasr1، ولا تنسخ backend آخر إلى قاعدة البيانات الحالية.
4. **إن كان جزئيًا أو فيه Stub أو نقطة ناقصة:** لا ترمه ولا تُعِد إنشاءه من الصفر؛ أكمل الجزء الناقص في الملف نفسه/الوحدة المعتمدة واكتب اختبار regression.
5. **إن كان SQL من مصدر مانح:** قارن الجداول والقيود وRLS/grants/RPC/search_path وترتيب المهاجرات أولًا. هذه ملفات مرجعية وليست ترخيصًا لتطبيقها مباشرةً على قاعدة الإنتاج. حوّل المفيد إلى migration جديدة متوافقة فقط عند ثبوت الحاجة.
6. لا تنقل مفاتيح أو بيانات إنتاج أو ملفات بيئة. ولا تنقل ملف واجهة من مصدر آخر بطريقة تستبدل ألوان Nasr1 أو نظام تصميمه.

## ما لم يُرفق كاملًا هنا

الأرشيفات الأصلية والفروع والمستودعات الكاملة لم تتحول كلها إلى ملفات تحت هذا المجلد. لتجميع كل ما يمكن الوصول إليه، شغّل `tools/collect-source-inputs.mjs` وفق `SOURCE_COLLECTOR_GUIDE.md`، ثم افحص `COLLECTION_MANIFEST.json`. أي أرشيف مفقود أو مستودع خاص غير متاح يجب أن يبقى معلّمًا BLOCKED؛ لا تخترع ملفات مفقودة ولا تزعم فحصها.
