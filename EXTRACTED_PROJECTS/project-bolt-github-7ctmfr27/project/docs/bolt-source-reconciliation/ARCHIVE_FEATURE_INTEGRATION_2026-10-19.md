# نتيجة دمج أرشيفي Bolt في Nasr1 — 19 أكتوبر 2026

## النتيجة الدقيقة

تم دمج فائدة تحليلية مفقودة من أرشيف **Before Failure** داخل التطبيق الحالي، مع الحفاظ على واجهات Nasr1 ومعمارية TanStack والمخطط الحالي. لا يعني ذلك نسخ كل محتوى الأرشيفين، ولا تشغيل SQL القديم كما هو.

- مستودع التعديل الوحيد: [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1), الفرع `main`.
- مصدر قراءة فقط: [report-insight-engine / incoming-archives/nasr1-bolt-recovery-2026-10-17](https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17).
- التحقق الفعلي من ZIP في [Actions 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493) على لقطة مستهدفة تاريخية SHA `d20c1aced5f6595b1b2a81bb017c153a260c5a0d` والمصدر المثبت `b1ca62ec277ff9f55c8e850e0470d61d81aaa138`.
- Before Failure: 1,003,172 بايت، SHA-256 `d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365`، Git blob SHA-1 `7c35f3ecde19dc5596fd22053be61924ef3d5318`، 359 عضوًا.
- Restored Current: 997,589 بايت، SHA-256 `9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214`، Git blob SHA-1 `f01684a56e093a33a173b0965d1d7239c48f0936`، 358 عضوًا.
- مقارنة الأعضاء: 717 صفًا، 340 مطابقًا، 18 متغيرًا، وعضو واحد موجود في Before Failure فقط. فحوص الحجم والبصمات وCRC وفك الضغط والمسارات الآمنة والاستخراج المؤقت نجحت. لم يُشغّل كود الأرشيف ولم تُطبّق SQL منه.

## قرارات الميزات

| ميزة / مصدر | حالة Nasr1 | القرار |
|---|---|---|
| `fetch_staff_products(uuid)` | موجودة بإصدار أقوى في `supabase/migrations/20261015210000_product_price_column_boundary.sql`؛ صلاحية خادمية ونطاق مؤسسة، وحظر SELECT المباشر لحقول الأسعار الحساسة | `ALREADY_PRESENT_BETTER` — لم تُستبدل |
| `get_ai_gateway_budget()` و`configure_ai_usage_budget(jsonb)` | موجودتان في `supabase/migrations/20261015200000_ai_gateway_budget_reservations.sql` مع مزودي AI، حجوزات حصص ذرية ودفتر استخدام والتحقق من HTTPS؛ مفاتيح المزود تبقى في أسرار Edge Function | `ALREADY_PRESENT_BETTER` — لم تُستبدلا |
| `get_onyx_snapshot_analytics(uuid)` | موجودة في `supabase/migrations/20261009090000_onyx_deterministic_analytics.sql`، وتخص اللقطة الثابتة المستوردة من Onyx | `ALREADY_PRESENT` — لا تعادل تحليل مبيعات المتجر |
| `get_executive_analytics()` في العضو الوحيد Before-only | لم تكن الوظيفة بالاسم والعقد القديم موجودة في التطبيق الحالي؛ الاستعلام القديم يعتمد مخططًا قديمًا ويحذف الوظيفة بـ`DROP ... CASCADE` | `ADAPT_AND_INTEGRATE` — أُعيد تنفيذ القدرة بعقد آمن متوافق |
| شاشات React Router القديمة وملفات الأنماط القديمة و`package-lock.json` | توجد واجهات أحدث ومسارات TanStack وBun lock في Nasr1؛ النسخ القديم قد يستبدل تحسينات أو يكسر البناء | لم تُنسخ؛ القرار مبني على عدم التوافق ووجود تنفيذ أحدث |
| ملفات الأسرار مثل `.env` وملفات بيانات الاعتماد | محتوى حساس | مستبعدة أمنيًا، لا تُنقل إلى Git |

## التغيير المتكامل

- `supabase/migrations/20261019210000_store_executive_analytics.sql`: RPC جديد يجمع الأرقام كاملةً في PostgreSQL من طلبات المؤسسة الحالية وبنودها؛ نطاق المؤسسة مشتق من هوية الجلسة في الخادم، يتطلب ملفًا نشطًا ودور موظف، يستخدم `SECURITY DEFINER` و`search_path=''`، يمنع التنفيذ للـ`anon` و`PUBLIC`، ويستبعد الملغى والمرفوض من المبيعات والاتجاه والترتيب.
- `src/lib/executive-analytics.ts`: أنواع محللة وفحوص صارمة؛ القيم الغائبة أو غير الصالحة تُرفض ولا تتحول بصمت إلى أصفار.
- `src/lib/api.ts`: استدعاء RPC من API التطبيق.
- `src/components/ExecutiveStoreAnalytics.tsx`: بطاقات المؤشرات، اتجاه المبيعات لـ30 يومًا، أعلى خمسة أصناف وأعلى خمسة عملاء وحالات تحميل/خطأ/فراغ وتحديث.
- `src/components/AghbariApp.tsx`: ربط الوحدة فعليًا بشاشة التقارير بجوار تحليلات Onyx.
- `src/test/executive-analytics.test.ts`: اختبارات صحة الاستجابة وحدود الأرقام والتواريخ والحقول المفقودة.

## دليل الاختبار

التكامل النهائي للكود والواجهة في commit [`55c1d970496c69db36d01197a109a5afd7c6aa04`](https://github.com/Report-Engainall/Nasr1/commit/55c1d970496c69db36d01197a109a5afd7c6aa04)، واجتاز [Actions 39303848194 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39303848194):
- اختبارات الوحدات: **38/38 ملفات و307/307 اختبارات**.
- تطبيق migrations وفحوص RLS وسير العمل على PostgreSQL 17 معزول.
- Lint.
- Build.
- Production preview smoke على 4173 وdev smoke على 5173.

هذا إثبات CI على SHA المحدد، وليس إثبات متصفح تفاعلي بحساب حي أو تطبيق migrations على قاعدة الإنتاج.

## حالة الإكمال

`archive integrity = PASS`; `archive comparison = PASS`; `missing executive analytics capability = IMPLEMENTED + INTEGRATED + TESTED`; `old archive SQL copied/applied = NO`; `browser proof = NOT RUN`; `production migration = NOT RUN`.

المصالحة هنا انتقائية ومبنية على المصدر: لم يُدّعَ دمج كل ملف وكل شاشة من الأرشيفين. العناصر غير المنقولة محفوظة كقرارات مراجعة مع السبب؛ استمر تنفيذ بقية المواصفة الأصلية بشكل مستقل.

## متابعة تنفيذ المواصفة الأصلية — المشتريات والاستلام (منفصل عن استعادة ZIP)

الميزة التالية لا تُنسب إلى الأرشيفين؛ مصدرها فجوة مواصفة Aghbari Commerce في دورة الشراء والاستلام، وتم تنفيذها فوق مخطط Nasr1 الحالي.

- المسار: `/admin/purchase-orders`.
- الترحيل: `supabase/migrations/20261019230000_purchase_orders_and_receiving.sql`.
- دورة التشغيل: مسودة → اعتماد داخلي → استلام جزئي/كامل، أو إلغاء مع سبب. لا يفترض النظام أن الاعتماد أرسل البريد للمورد.
- مخزون صحيح: المسودة والاعتماد لا يغيران الرصيد؛ إيصال الاستلام الفعلي يحدّث الرصيد ويسجل حركة داخل معاملة واحدة. الكمية لا تتجاوز المتبقي، replay بالمفتاح والحمولة نفسيهما لا يكرر الحركة، ومفتاح مستعمل لحمولة مختلفة يُرفض. التكلفة غير المتاحة NULL وليست صفرًا.
- المهام: انتقال أمر الشراء إلى حالة بانتظار الاستلام يُنشئ/يحدّث مهمة مخزن idempotent من حدث ثابت؛ الاستلام الكامل أو الإلغاء يغلق المهمة.
- الدليل: [Actions 39309895500 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39309895500), SHA `2986f59c3350f313eaa53b529a7507da47192773`, 41/41 suites and 317/317 tests; migrations/RLS PostgreSQL 17; lint/build; preview/dev smoke.
- لا يوجد دليل متصفح تفاعلي بجلسة مستخدم حقيقية أو نشر ترحيل الإنتاج: `BROWSER-PROVEN=NOT RUN`, `PRODUCTION_MIGRATION=NOT RUN`.


## 2026-10-19 — إغلاق قرارات عناصر أرشيف Bolt (P2)

**لم يُعد تنزيل أو فتح ملفات ZIP في هذه الدفعة.** دليل سلامة الأرشيف السابق: [Action 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493). تمت تسوية قرار كل عضو في `ARCHIVE_MEMBERS.csv`؛ إجمالي 717 صفًا: 548 مطابق تمامًا، 8 مستبعد أمنيًا، 1 عنصر مكيّف سابقًا، و160 صفًا كان بحاجة إلى قرار (64 مسارًا مختلف المحتوى + 19 مسارًا مرشحًا للغياب). حالات القرار المطلوب مراجعتها المتبقية = 0.

### قرارات المسارات المفتوحة
| المسار | الحالة السابقة | القرار | الدليل والسبب |
|---|---|---|---|
| `.github/copilot-instructions.md` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `.github/workflows/commerce-checks.yml` | different target content | **ALREADY_PRESENT_BETTER** | workflow الهدف يحمل acceptance الحالي وPR #3 يملكه مؤقتًا؛ محفوظ ولم يُستبدل بالملف الأقدم. |
| `AGENTS.md` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `bun.lock` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `docs/bolt-source-reconciliation/ARCHIVE_INTAKE_RECONCILIATION_2026-10-17.md` | different target content | **KEEP_AS_REFERENCE** | مستند تاريخي/استعادة؛ الإصدار الحالي ونقطة الدخول 2026-10-18 لهما الأولوية، ولا يُكتب القديم فوقهما. |
| `docs/bolt-source-reconciliation/BOLT_EXECUTION_MANDATE.md` | different target content | **KEEP_AS_REFERENCE** | لم يثبت تفوق أو توافق النسخة المختلفة؛ يبقى كمرجع تاريخي دون overwrite للهدف. |
| `docs/bolt-source-reconciliation/BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_2026-10-17.md` | different target content | **KEEP_AS_REFERENCE** | مستند تاريخي/استعادة؛ الإصدار الحالي ونقطة الدخول 2026-10-18 لهما الأولوية، ولا يُكتب القديم فوقهما. |
| `docs/bolt-source-reconciliation/README_AR.md` | different target content | **KEEP_AS_REFERENCE** | مستند تاريخي/استعادة؛ الإصدار الحالي ونقطة الدخول 2026-10-18 لهما الأولوية، ولا يُكتب القديم فوقهما. |
| `docs/bolt-source-reconciliation/READY_TO_REUSE/adnanabderab2016-sys--aladnan-electronics/src/pages/OrdersPage.tsx` | different target content | **KEEP_AS_REFERENCE** | نسخة مرجعية ضمن نطاق READY_TO_REUSE المملوك للمبرمج 1؛ لم يُعدل الكود أو سجل المصدر المانح. |
| `docs/bolt-source-reconciliation/READY_TO_REUSE/adnanabderab2016-sys--aladnan-electronics/src/pages/PricingPage.tsx` | different target content | **KEEP_AS_REFERENCE** | نسخة مرجعية ضمن نطاق READY_TO_REUSE المملوك للمبرمج 1؛ لم يُعدل الكود أو سجل المصدر المانح. |
| `docs/bolt-source-reconciliation/READY_TO_REUSE/README.md` | different target content | **KEEP_AS_REFERENCE** | نسخة مرجعية ضمن نطاق READY_TO_REUSE المملوك للمبرمج 1؛ لم يُعدل الكود أو سجل المصدر المانح. |
| `docs/bolt-source-reconciliation/READY_TO_REUSE/Report-Engainall--aghbari-store/src/pages/admin/AIAssistant.tsx` | different target content | **KEEP_AS_REFERENCE** | نسخة مرجعية ضمن نطاق READY_TO_REUSE المملوك للمبرمج 1؛ لم يُعدل الكود أو سجل المصدر المانح. |
| `docs/bolt-source-reconciliation/READY_TO_REUSE/Report-Engainall--aghbari-store/src/pages/admin/PolicyCenter.tsx` | different target content | **KEEP_AS_REFERENCE** | نسخة مرجعية ضمن نطاق READY_TO_REUSE المملوك للمبرمج 1؛ لم يُعدل الكود أو سجل المصدر المانح. |
| `docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt` | target absent | **KEEP_AS_REFERENCE** | تمت إضافة النص الموحد من لقطة الاستعادة إلى هذا المسار canonical؛ المرجع محفوظ ولا يثبت وحده تنفيذ متطلباته. |
| `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md` | different target content | **KEEP_AS_REFERENCE** | المرجع يحمل بيانات مشروع مانح؛ لا يُعامل كمرجع التنفيذ canonical لـNasr1 ولا يُستبدل بالوثيقة الحالية. |
| `eslint.config.js` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `index.html` | target absent | **INCOMPATIBLE_WITH_EVIDENCE** | بنية المستند تُنشأ من src/routes/__root.tsx/TanStack Start؛ CI يبني المشروع من دون هذا الملف الجذري القديم. |
| `ops/AGHBARI-LATEST-EXECUTION-STATE.md` | different target content | **KEEP_AS_REFERENCE** | مستند تاريخي/استعادة؛ الإصدار الحالي ونقطة الدخول 2026-10-18 لهما الأولوية، ولا يُكتب القديم فوقهما. |
| `ops/AGHBARI-SESSION-RESUME.md` | different target content | **KEEP_AS_REFERENCE** | مستند تاريخي/استعادة؛ الإصدار الحالي ونقطة الدخول 2026-10-18 لهما الأولوية، ولا يُكتب القديم فوقهما. |
| `package-lock.json` | target absent | **INCOMPATIBLE_WITH_EVIDENCE** | الهدف يستخدم bun.lock وفحص frozen lock؛ إضافة package-lock تنشئ قفل اعتماد منافسًا قد ينحرف عن CI. |
| `package.json` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `PROJECT_MEMORY.md` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `README.md` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `scripts/test-database-migrations.mjs` | different target content | **ALREADY_PRESENT_BETTER** | اختبارات قبول PostgreSQL 17 الحالية خاصة بمخطط Nasr1؛ المسار مقفول في PR #3 للمبرمج 1 ولم يُستبدل بسكربت المصدر. |
| `src/App.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/components/AdminPages.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/AghbariApp.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/CustomerCompanyMembers.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/CustomerWorkflows.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/Login.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/OperationsCenter.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/store/BannerSlider.tsx` | different target content | **KEEP_AS_REFERENCE** | مكونات واجهة من لقطة storefront؛ الواجهة النشطة في Storefront.tsx، ولم يُثبت أن هذه النسخة تحسن التكامل/العقود؛ حفظها كمرجع بدل الاستبدال. |
| `src/components/store/ProductCard.tsx` | different target content | **KEEP_AS_REFERENCE** | مكونات واجهة من لقطة storefront؛ الواجهة النشطة في Storefront.tsx، ولم يُثبت أن هذه النسخة تحسن التكامل/العقود؛ حفظها كمرجع بدل الاستبدال. |
| `src/components/store/StoreFooter.tsx` | different target content | **KEEP_AS_REFERENCE** | مكونات واجهة من لقطة storefront؛ الواجهة النشطة في Storefront.tsx، ولم يُثبت أن هذه النسخة تحسن التكامل/العقود؛ حفظها كمرجع بدل الاستبدال. |
| `src/components/store/StoreHeader.tsx` | different target content | **KEEP_AS_REFERENCE** | مكونات واجهة من لقطة storefront؛ الواجهة النشطة في Storefront.tsx، ولم يُثبت أن هذه النسخة تحسن التكامل/العقود؛ حفظها كمرجع بدل الاستبدال. |
| `src/components/Storefront.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/ui/breadcrumb.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/ui/calendar.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/ui/pagination.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/components/UnifiedImportEngine.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/integrations/supabase/previewAuthStorage.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/integrations/supabase/types.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/lib/api.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/lib/authStore.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/lib/commerce-utils.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/lib/finance-document-pdf.test.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/lib/pricing.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/lib/supabase.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/lib/types.ts` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/main.tsx` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `src/pages/admin/AdminAiWorkspace.tsx` | target absent | **ALREADY_PRESENT_BETTER** | AiCenter الحالي في AdminPages.tsx مرتبط بالعنصر ai في AghbariApp ويستخدم RPCs الحالية وAiAlert.body؛ الملف القديم يقرأ a.message. |
| `src/pages/admin/AdminAuditLog.tsx` | target absent | **INCOMPATIBLE_WITH_EVIDENCE** | عارض السجل القديم يقرأ عقد مخطط مختلفًا؛ سجل تدقيق الهدف يجب أن يقرأ audit_logs عبر RLS/RPC الهدف، لا direct table access القديم. |
| `src/pages/admin/AdminBanners.tsx` | target absent | **ALREADY_PRESENT_BETTER** | إدارة إعلانات المتجر موجودة عبر fetchAdminStorefrontAnnouncements/saveStorefrontAnnouncement في AdminPages.tsx. |
| `src/pages/admin/AdminCategories.tsx` | target absent | **INCOMPATIBLE_WITH_EVIDENCE** | واجهة CRUD قديمة بعقود Supabase/React Router غير مثبتة في الهدف؛ تصنيفات الكتالوج موجودة لكن الإدارة الكاملة تبقى فجوة مواصفة بدل استيراد غير موصول. |
| `src/pages/admin/AdminCustomer360.tsx` | target absent | **INCOMPATIBLE_WITH_EVIDENCE** | الصفحة تعتمد جداول/حقول عملاء وفواتير ومدفوعات قديمة وReact Router؛ توجد أعمار الذمم في CustomerWorkflows لكن Full Customer 360 لا يعلن مكتملًا، ويظل فجوة مواصفة هدفية. |
| `src/pages/admin/AdminCustomers.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/admin/AdminDashboard.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/admin/AdminInventory.tsx` | target absent | **ALREADY_PRESENT_BETTER** | مركز العمليات ومطابقة المخزون ودورة أوامر الشراء/الاستلام هي التدفقات الحالية؛ PR #3 يضيف نقل المخزون ولا يُعاد نسخه. |
| `src/pages/admin/AdminLayout.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/admin/AdminNotifications.tsx` | target absent | **ALREADY_PRESENT_BETTER** | عرض التنبيهات والإشعارات موجود في AdminPages.tsx/AghbariApp.tsx. |
| `src/pages/admin/AdminOrders.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/admin/AdminPricing.tsx` | target absent | **ALREADY_PRESENT_BETTER** | شبكة الأسعار وخدمات السعر المحكومة خادميًا وتدفقات الاستيراد موجودة؛ لا تُنشأ واجهة أسعار موازية. |
| `src/pages/admin/AdminProducts.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/admin/AdminReports.tsx` | target absent | **ALREADY_PRESENT_BETTER** | تقارير المتجر والتحليلات المستهدفة موجودة؛ تحليلات المبيعات عُدلت في 55c1d970 وCI 39303848194. |
| `src/pages/admin/AdminSettings.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/admin/AdminSuppliers.tsx` | target absent | **ALREADY_PRESENT_BETTER** | إدارة Suppliers الحالية مرتبطة بتدفق أوامر الشراء الفعلي. |
| `src/pages/auth/LoginPage.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/auth/RegisterPage.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/store/CartPage.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/store/CommerceAssistant.tsx` | target absent | **KEEP_AS_REFERENCE** | المساعد المرجعي يعتمد تخزين/توجيه قديمين؛ لا ينسخ فوق مساعد/تصنيف النوايا المستهدف قبل ربطه بعقد الوظائف الحالي. |
| `src/pages/store/ComparePage.tsx` | target absent | **ALREADY_PRESENT_BETTER** | المقارنة موجودة ضمن Storefront وعقد TanStack الحالي؛ صفحة React Router المستقلة ليست لازمة. |
| `src/pages/store/HomePage.tsx` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `src/pages/store/WishlistPage.tsx` | target absent | **ALREADY_PRESENT_BETTER** | قائمة الرغبات موجودة ضمن Storefront مع تطبيع معرفات التخزين المحلي؛ لا نعيد cart/auth stores القديمة. |
| `src/routeTree.gen.ts` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `src/styles.css` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `src/styles/premium-ui.css` | target absent | **INCOMPATIBLE_WITH_EVIDENCE** | CSS عام من الحزمة القديمة قد يغير tokens وتخطيط RTL الحالي؛ لا دليل أنه محمّل، لذلك لا يضاف إلى stylesheet الهدف. |
| `src/test/app-routing.test.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `src/test/storefront-discovery.test.tsx` | different target content | **ALREADY_PRESENT_BETTER** | حزمة target الحالية هي التي تُستخدم في التطبيق/عقود Supabase/RPC والاختبارات؛ لا تُستبدل بمحتوى مختلف مأخوذ من لقطة سابقة. |
| `supabase/migrations/20261016074744_001_initial_schema.sql` | different target content | **INCOMPATIBLE_WITH_EVIDENCE** | النسخة تنتمي لطبقة React Router/نموذج بيانات قديم؛ Nasr1 يستخدم TanStack routes وعقود خدمات/مخطط حالية، فلا تُستبدل أو تُطبق هذه النسخة. |
| `supabase/migrations/20261017003522_executive_analytics_and_customer_360.sql.sql` | target absent | **INCOMPATIBLE_WITH_EVIDENCE** | SQL يخلط تحليلات بكيانات قديمة؛ تحليلات المتجر نُقلت في 20261019210000_store_executive_analytics.sql، أما Customer 360 فيحتاج تكييفًا هدفيا لا تنفيذ SQL الخام. |
| `tsconfig.json` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |
| `tsconfig.tsbuildinfo` | target absent | **INCOMPATIBLE_WITH_EVIDENCE** | ملف incremental compiler مُولد وليس مصدرًا؛ لا يُنقل كأصل مشروع. |
| `vite.config.ts` | different target content | **ALREADY_PRESENT_BETTER** | ملف إعداد/تشغيل النسخة الحالية؛ يتسق مع TanStack/Bun وCI الهدف. إبقاء target الحالي بدل النسخة التاريخية المختلفة. |

### ما أُضيف وما لم يُدّعَ
- حفظ المرجع العربي الموحد كما ورد من لقطة الاستعادة في `docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt`.
- الإبقاء على تطبيق Nasr1 الحالي حيث توجد الوظائف الموصولة: AI center، التنبيهات، الموردون، الأسعار، التقارير، المقارنة/الرغبات، المخزون والاستيراد.
- عدم تنفيذ SQL Bolt القديم أو إنشاء قفل NPM ثانٍ أو ملف cache للمترجم. Customer 360 الشامل وسجل التدقيق الإداري وCRUD التصنيفات تبقى فجوات مواصفة تحتاج تنفيذًا عبر عقود Nasr1، لا تنقلًا حرفيًا.
- اختبارات كل ملف أرشيفي منفرد: **NOT RUN**. لا تساوي قرارات المصدر إثبات تشغيله.
- Browser proof، production migration وproduction proof: **NOT RUN**.


## Final CI proof for decision closure and financial statement implementation

- Archive decision matrix complete: all 717 rows resolved; former pending-review statuses now 0. Archive integrity evidence reused from Action 39294387493; no ZIP re-validation was repeated.
- Exact code SHA 869f0909bda0524275834952f64e1ce1609e79c0 passed Action 39320266809: 44/44 test files, 336/336 tests; PostgreSQL 17 migrations/acceptance, lint, build, preview 4173 and dev 5173 smoke all PASS.
- Previous test failure remains recorded; later test-only assertions were corrected without removing coverage. Legacy archive member tests, browser proof and production migration/proof remain NOT RUN.
- Archive decision closure does not close parent specification task. Next task is NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004.


## P2 original-spec execution continuation — cash-expense posting

- Archive work remains closed with 0 pending matrix review rows, based on the original successful verification Action 39294387493. No ZIP source operations were repeated.
- Subsequent target-native source posting SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b` passed Action 39321543032 (45/45 test files and 339/339 tests plus PostgreSQL 17 migration/acceptance, lint/build and smoke). Archive member code/SQL was not executed.
- Flow-specific DB trigger assertions for cash expense posting are NOT RUN because P1 currently owns the migration test harness. Request an acceptance-test patch via WORK_COORDINATION; do not change P1-owned files until released.
