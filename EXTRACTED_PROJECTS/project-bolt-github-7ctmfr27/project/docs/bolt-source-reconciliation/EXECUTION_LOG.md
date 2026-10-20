# سجل التنفيذ — Nasr1

## 2026-10-18 — NASR1-BOOT-001 — مواءمة البناء مع TanStack Start
- المستودع والفرع: `Report-Engainall/Nasr1` / `main`
- SHA الأساس: `41b8757183db97990f0c1f78f8ea6e45cf7d0201`
- الدليل الأساسي: [CI 38971144752](https://github.com/Report-Engainall/Nasr1/actions/runs/38971144752) أخفق عند `bun install --frozen-lockfile --dry-run` قبل بدء الاختبارات. log يشير إلى عدم تطابق overrides في manifest وlock.
- اكتشف الفحص أن manifest وnpm lock قديمان (React Router/Vite 5)، بينما lock وroutes وtests/workflow تعتمد TanStack Start/Vite 8/Vitest.
- التغييرات: manifest من lock الحالي، scripts موجودة للـCI، Vite config wrapper مع مدخل server، تعديل اسم workspace فقط في lock، نقل root HTML وnpm lock المتعارضين إلى REFERENCE_ONLY مع الاحتفاظ بالمحتوى.
- الاعتماديات: صفر اعتماديات جديدة؛ استخدمت الموجود في Bun lock.
- الاختبار على SHA الجديد: pending GitHub Actions؛ لم يُشغّل شيء من checkout محلي.
- المانع: الأرشيفات الثنائية لم تُنزّل/تُفك في هذا batch؛ حالتها التاريخية موثقة دون ادعاء جديد.
- next_task_id: `NASR1-BOOT-001` حتى اجتياز التثبيت والبناء؛ ثم `NASR1-OPS-TASK-CENTER-001`.


## 2026-10-18 — NASR1-MISSING-MODULES-001 — استعادة وحدات من provenance
- SHA المختبر السابق: `790afce1aa2a78a4692d6f990599ed99a495515b` — [Actions run 39139420150](https://github.com/Report-Engainall/Nasr1/actions/runs/39139420150) = FAIL في unit tests بعد نجاح التثبيت.
- Vitest: 9 test files failed، 6 passed، و48 tests passed ضمن الملفات التي تم تشغيلها.
- أسباب missing imports: `customer-addresses.ts`, `customer-company-members.ts`, `finance-document-pdf.ts`, `unified-import.ts`, و`routes/api.invoice-pdf.$invoiceId.ts`. routeTree كان يشير بالفعل إلى route ملفه مفقود.
- مصدر الملفات الخمسة: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`. تمت مقارنة blob SHAs مع READY_TO_REUSE/PROVENANCE_MANIFEST.csv قبل الإضافة، وتُحفظ النسخ المرجعية دون تعديل.
- اختبار ما بعد الاستعادة: PENDING على SHA التالي؛ لا ادعاء PASS قبل قراءة Actions.
- next_task_id: `NASR1-MISSING-MODULES-001` حتى اختبارات الوحدات والـPDF والمسارات تجتاز.

## 2026-10-18 — NASR1-SUPABASE-CLIENT-001 — استعادة عقد عميل Supabase الصحيح
- SHA الأساس: `2f523b729c6ed28aff06fbeddabd18cd79a25131`; CI المرتبط به: [run 39139802558](https://github.com/Report-Engainall/Nasr1/actions/runs/39139802558) = FAIL عند استيراد عميل Supabase أثناء اختبار route matching.
- الأدلة: frozen Bun lock PASS؛ التثبيت PASS؛ Vitest 14 ملفات PASS وملف واحد FAIL، 133 اختبارًا PASS. الاستثناء `supabaseUrl is required` من العميل القديم في `src/lib/supabase.ts`.
- المصدر: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`, الملف `src/lib/supabase.ts`, source blob `430fd42b111f26e5bd1104c9a19b4350a39de7fb`. الكود يربط بطبقة العميل الموجودة في Nasr1 ويضيف نطاق المؤسسة الذي تتوقعه API، دون أخذ IDs من browser أو إضافة اعتماديات.
- القرار: استبدال العميل القديم الذي لا يطابق عقد التطبيق النشط؛ حفظ قرار المصدر والبصمة في ledger.
- اختبار هذه الدفعة: `PENDING_REMOTE_CI`؛ لم تُشغّل أوامر محلية لأن checkout غير متاح.
- next_task_id يبقى `NASR1-SUPABASE-CLIENT-001` حتى قراءة CI الجديد.

# سجل التنفيذ — Nasr1

## 2026-10-18 — NASR1-DB-MIGRATION-ORDER-001 — تحييد baseline قديم متضارب مع حفظه
- المستودع/الفرع: `Report-Engainall/Nasr1` / `main`
- SHA الأساس: `63ab9fc050d165c1a088112979ab7a9fefbb2767`
- دليل الفشل: [Actions 39140257185](https://github.com/Report-Engainall/Nasr1/actions/runs/39140257185) → `MIGRATION_FAILED 20261016074744_001_initial_schema.sql`; PostgreSQL 17 `42703 column "is_active" does not exist`.
- مقارنة المخطط: `20261006063522_d656e1d4-1ca3-4cd7-8542-504968bc356c.sql` يعرّف `products.status`؛ الـbaseline الأحدث اسمًا يتوقع `products.is_active` ويضيف بيانات seed. `CREATE TABLE IF NOT EXISTS` لم يحدّث الجدول القائم.
- القرار: حفظ كل SQL الأصلي بلا تعديل في `docs/bolt-source-reconciliation/REFERENCE_ONLY/migrations/20261016074744_001_initial_schema.legacy.sql`. إبقاء migration version path، وتحويل جسمه إلى guard يثبت وجود `organizations` و`products` وعقد `products.status` قبل متابعة migrations. يمنع هذا تشغيل schema مزدوج أو seed منتجات ديمو فوق المخطط canonical.
- SQL الأصلي: Git blob `baf5744a4a7cf3f2d2077460f9c5517318dad2f8`, حجم النص `13742` حرفًا.
- اختبار SHA الأساس: dependency freeze/install PASS؛ unit tests PASS؛ DB acceptance FAIL للسبب أعلاه؛ بقية lint/build/smoke SKIPPED.
- اختبار SHA الجديد: PENDING exact-SHA GitHub Actions.
- لا تغييرات بقاعدة إنتاج أو اعتماديات أو secrets.
- next_task_id: `NASR1-DB-MIGRATION-ORDER-001` حتى مرور CI.

## 2026-10-18 — NASR1-LINT-BASELINE-001 — إصلاح ESLint بعد نجاح DB acceptance
- SHA الأساس: `7df4b5a48d52b71933d2c90885b600e61f1caf81`; [Actions 39140570076](https://github.com/Report-Engainall/Nasr1/actions/runs/39140570076).
- النتائج المثبتة: Bun install PASS؛ unit tests PASS؛ isolated PostgreSQL migrations/business acceptance PASS؛ ESLint FAIL (8 errors / 9 warnings)؛ build وpreview/dev smoke لم يبدأا.
- تغييرات المصدر: تجاهل مرجع READY_TO_REUSE وREFERENCE_ONLY من lint فقط؛ إزالة explicit-any من الصفحات القديمة باستخدام أنواع ثابتة أو unknown+error narrowing؛ تثبيت timer holder دون تغيير timeout.
- لا اعتماديات جديدة ولا تعطيل لقواعد lint. الاختبار على SHA الناتج: pending exact-SHA CI.
- next_task_id: `NASR1-LINT-BASELINE-001` حتى اجتياز lint/build/routes.

## 2026-10-18 — NASR1-OPS-TASK-CENTER-001 — مركز المهام فوق ai_tasks الحالية
- SHA الأساس: `36c604e95de1e8accb3225824596c49a1ae9db17`; بوابة الأساس [39140900669](https://github.com/Report-Engainall/Nasr1/actions/runs/39140900669) = SUCCESS في التثبيت، الاختبارات، PostgreSQL acceptance، lint، build وpreview/dev smoke.
- قاعدة البيانات: role lanes/source/due/assignment/resolution/metadata، unique source-event index، triggers للطلبات والمخزون والفواتير وعروض الأسعار والاستيراد، RPC للمصالحة والإنشاء وتغيير الحالة، وسجل audit. لا direct authenticated DML على ai_tasks.
- الواجهة: route `/admin/tasks`، task center RTL، فلترة حسب الدور/الحالة/البحث، مصالحة idempotent للبيانات الموجودة، استلام وإنجاز، وطباعة A4 landscape للنتائج الظاهرة.
- اختبارات قاعدة البيانات المضافة: منع تكرار الحدث، إعادة فتح مهمة نقص المخزون فقط بعد عبور حد المخزون مرة أخرى، RPC مدقق، رفض الكتابة المباشرة، عزل مهام المحاسب عن العميل/الأدوار الأخرى.
- لا checkout محلي؛ exact-SHA GitHub Actions هو بوابة القبول التالية.
- next_task_id: `NASR1-OPS-TASK-CENTER-001` حتى قراءة CI على SHA الجديد؛ لا يُنسب PASS لهذا التغيير مقدمًا.

## 2026-10-18 — إصلاح تابع لـ NASR1-OPS-TASK-CENTER-001
- Commit الميزة: `8842478d9b70fd11437c892bbf9cdcd8d22a1410`; [CI 39142666048](https://github.com/Report-Engainall/Nasr1/actions/runs/39142666048) = FAIL عند Vitest transform: duplicate import/declaration `AiTask` في `src/lib/api.ts`. 97 اختبارات ناجحة، وأربع suites فشلت قبل التنفيذ الفعلي بسبب خطأ الترجمة نفسه.
- الإصلاح: حذف الاستيراد المكرر من القائمة المضافة مع إبقاء import الأصلي، دون تغيير سلوك التنفيذ أو الصلاحيات.
- DB, lint, build, smoke ما زالت pending على SHA الإصلاح التالي.
- next_task_id: `NASR1-OPS-TASK-CENTER-001`.

## 2026-10-18 — إثبات نجاح NASR1-OPS-TASK-CENTER-001
- Code SHA: `283d2def75e2608e0aac1d2d16aabf81e7842347`.
- [GitHub Actions 39142794601](https://github.com/Report-Engainall/Nasr1/actions/runs/39142794601) = SUCCESS.
- Unit tests: 15 test files passed; 165 tests passed.
- PostgreSQL 17: migrations and commerce acceptance PASS. Task-specific proof: `PASS operational task center: source-event idempotency, stock threshold lifecycle, audited RPC writes, accountant-only lane and customer isolation`.
- ESLint PASS; Build PASS; production preview smoke PASS; dev-server smoke PASS.
- Route test includes `/admin/tasks`; migration extends `ai_tasks` and uses audited RPC writes, tenant and role policy, and unique source-event idempotency.
- Next task: `NASR1-TASK-ASSIGNMENT-001` — secure admin-only named assignee selection and role validation in the task UI.

## 2026-10-18 — NASR1-TASK-ASSIGNMENT-001 — اختيار موظف مسند بالاسم
- الأساس: `c3bc527443cd05ab07d16e15c3ae18401e95db0c`; مركز المهام السابق اجتاز [CI 39142794601](https://github.com/Report-Engainall/Nasr1/actions/runs/39142794601).
- Migration جديد `20261018020000_task_assignee_directory.sql`: RPC `list_operational_task_assignees()` يسرد فقط الحسابات النشطة ذات الأدوار من مؤسسة المدير/المسؤول؛ لا يوسع RPC إدارة الأدوار admin-only.
- UI: اختيار الموظف، تصفية المرشحين حسب دور المهمة، وإظهار اسم المسؤول في القائمة والطباعة حين يكون مرئيًا للحساب.
- اختبارات قاعدة البيانات: عزل المؤسسة، منع المحاسب من تعداد الدليل، نجاح إسناد صحيح، ورفض إسناد مهمة مبيعات لمحاسب مالي فقط.
- exact-SHA CI الجديد pending؛ لا PASS قبل قراءته.

## 2026-10-18 — إثبات نجاح NASR1-TASK-ASSIGNMENT-001
- Code SHA: `ae13810429cd4923108da4d840d187ff5590b489`.
- [GitHub Actions 39143265290](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290) = SUCCESS في جميع المراحل: التثبيت، الوحدات، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke.
- هجرة `20261018020000_task_assignee_directory.sql` أضافت `list_operational_task_assignees()`، صالحة للمسؤول/المدير فقط ومحدودة بالمؤسسة الحالية. قائمة الإسناد لا تغير RPC إدارة الأدوار admin-only.
- الواجهة تعرض أسماء الموظفين للمدير/المسؤول فقط وتفلتر المرشحين بتوافق الدور. الخادم يعيد التحقق عند إنشاء المهمة.
- اختبارات DB الإضافية اجتازت: لا مستخدم من مؤسسة أخرى في الدليل؛ المحاسب لا يستطيع تعداد الدليل؛ إسناد صحيح محفوظ؛ إسناد مهمة sales لمستخدم accountant-only مرفوض.
- `next_task_id = NASR1-FINANCE-COLLECTION-AGING-001`.


## 2026-10-18 — NASR1-OPS-TASK-FILTERS-001 — توسيع فلاتر مركز المهام
- الهدف: `Report-Engainall/Nasr1` / `main` فقط.
- Code commit: [6123321e99e35af85359797c9331532c0b9c5c6e](https://github.com/Report-Engainall/Nasr1/commit/6123321e99e35af85359797c9331532c0b9c5c6e).
- الملف المعدل: `src/components/TaskCenter.tsx`.
- التنفيذ: فلاتر الأولوية، الموظف المسؤول/غير المسندة، وفترة تاريخ الإنشاء؛ تُطبّق جميعها على مجموعة `filtered` نفسها التي تستخدمها القائمة والطباعة، مع طباعة وصف المرشحات وعدد النتائج.
- لا اعتماديات جديدة، ولا تغييرات قاعدة بيانات أو بيانات إنتاج.
- تحقق القراءة بعد الحفظ: الملف على `main` يحتوي مرشحات الأولوية والتاريخ والمسؤول؛ هذا يثبت حفظ الكود فقط.
- الاختبارات: **PENDING** — لا يوجد حتى الآن دليل CI مقروء لهذا SHA؛ لا يُسجل TESTED/PASS قبل نتيجة Actions المطابقة.
- next_task_id: `NASR1-OPS-TASK-FILTERS-001-VERIFY-CI`; بعد اجتياز CI انتقل إلى `NASR1-FINANCE-COLLECTION-AGING-001` وافحص عقد الفواتير/الدفعات قبل أي حساب للرصيد.

## 2026-10-18 — NASR1-FINANCE-COLLECTION-AGING-001 — تنفيذ تقرير أعمار الذمم

- الهدف الوحيد: `Report-Engainall/Nasr1` / `main`.
- التنفيذ البرمجي: `supabase/migrations/20261018030000_staff_receivables_aging.sql` يضيف `fetch_staff_receivables_aging(limit, offset)` بصلاحية مالية ومؤسسة مشتقة من الجلسة الخادمية، ويحسب الرصيد من إجمالي الفاتورة ودفعات `customer_payments` المحفوظة، مع استبعاد الفواتير الملغاة، وتجميع مستقل لكل عملة، وفئات 1–30/31–60/61–90/>90 يومًا، وبند منفصل لتاريخ الاستحقاق المفقود، وترقيم صفحات مضبوط.
- دمج الواجهة في `src/components/CustomerWorkflows.tsx`: ملخص حسب العملة وفترات العمر، وتفاصيل فواتير تتضمن الإجمالي والمدفوع والمتبقي والعميل وتاريخ الاستحقاق، مع حالات تحميل/خطأ وإعادة المحاولة.
- قبول قاعدة البيانات: أضيفت في `scripts/test-database-migrations.mjs` تأكيدات لبيانات الاختبار 370000 إجماليًا و100000 مدفوعًا و270000 متبقيًا، والفئات، وملخص العملة، وحدود الصفحة ورفض limit=0، ورفض العميل استدعاء RPC المالية.
- فشل أولي حقيقي: CI [39144533065](https://github.com/Report-Engainall/Nasr1/actions/runs/39144533065) أخفق لأن عمود العميل المفترض `company_name` غير موجود. تمت قراءة تعريف `customers` في `20261006063522_d656e1d4-1ca3-4cd7-8542-504968bc356c.sql` وتصحيح الاستعلام إلى `business_name` و`contact_name`، ولم تُضعّف الاختبارات.
- إثبات النسخة المصححة: commit [437527ff30bc44ce9a1cdf170c89edd5fc5b3104](https://github.com/Report-Engainall/Nasr1/commit/437527ff30bc44ce9a1cdf170c89edd5fc5b3104) — [Actions 39144691226](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226) **SUCCESS** لجميع المراحل: Bun lock/install، unit tests، PostgreSQL 17 migration/workflow acceptance، lint، build، preview smoke وdev smoke.
- لا اعتماديات جديدة، ولا تعديل لقاعدة الإنتاج. دليل DB في هذا المسار هو PostgreSQL 17 المعزول ضمن CI فقط.
- إضافة طباعة مجانية لكشف أعمار الذمم: [commit 393ca96b73c3b0d642bc5fc9b05681e84c6611d6](https://github.com/Report-Engainall/Nasr1/commit/393ca96b73c3b0d642bc5fc9b05681e84c6611d6) أضاف زر الطباعة، و[commit 6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b](https://github.com/Report-Engainall/Nasr1/commit/6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b) أضاف CSS للطباعة RTL/A4 بإخفاء زر الطباعة، وطباعة الملخص والصفحة التفصيلية المعروضة فقط. نتيجة CI الخاصة بدفعة الطباعة **PENDING** حتى قراءة run مطابق للـSHA الحالي؛ لا يُنقل PASS من `437527f` إليها.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-001-VERIFY-CI`; بعد نجاحه انتقل إلى مراجعة اختبارات ودقة تصدير/طباعة المالية، مع إبقاء ملخص إجمالي الفواتير الكامل منفصلًا عن صفحة التفاصيل المعروضة.

## 2026-10-18 — إغلاق بوابة CI لدفعة طباعة أعمار الذمم

- طباعة الواجهة: [Actions 39144916657](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657) على commit `393ca96b73c3b0d642bc5fc9b05681e84c6611d6` = **SUCCESS**.
- CSS/RTL/A4: [Actions 39144928394](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394) على commit `6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b` = **SUCCESS**؛ unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview smoke وdev smoke كلها SUCCESS.
- يطبع التقرير المالي الملخص حسب العملة وتفاصيل الصفحة المحمّلة فقط. زر الطباعة مخفي في نسخة الورق، وتطبق قواعد CSS إعداد الطباعة RTL/أبيض وأسود/A4 من المتصفح؛ لم تُضف مكتبة أو خدمة مدفوعة.
- حالة الإثبات: `IMPLEMENTED` و`TESTED` على SHA `6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b`. لا يوجد `BROWSER-PROVEN` أو `PRODUCTION-PROVEN`؛ لا تفترض تشغيل نافذة طباعة فعلية لمجرد نجاح smoke/build.
- بعد هذا الإدخال توجد تحديثات توثيقية أحدث في `main`؛ نتيجة CI الخاصة بأحدث SHA التوثيقي مطلوبة قبل إغلاق جلسة الاستئناف.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-002-TESTS` — أضف اختبار واجهة مستهدفًا للطباعة ضمن بيئة الاختبار القائمة إن أمكن دون إدخال مكتبات جديدة، وأثبت حالات الملخص/الصفحة المعروضة وحدود التقرير المطبوع.

## 2026-10-18 — NASR1-FINANCE-AGING-UI-TEST-001 — اختبار واجهة الطباعة والصلاحيات

- أضيف الملف `src/components/CustomerWorkflows.finance-aging.test.tsx` لاختبار إظهار فاتورة ذات رصيد محسوب من مصدر الاختبار، والتصنيف عند غياب تاريخ الاستحقاق، واستدعاء `window.print`، وعدم تنفيذ RPC المالية لمستخدم بلا دور مالي.
- أول تشغيل على SHA `356c4fcf3ec002fccd3dea5e5c2698465d9b38e4` أخفق في assertion نصي ثابت لترقيم الصفحات؛ run [39145139101](https://github.com/Report-Engainall/Nasr1/actions/runs/39145139101): 15 ملف اختبار ناجح وملف واحد فاشل، بإجمالي 166 اختبارًا ناجحًا وواحدًا فاشلًا. السبب هو اختلاف تنسيق الأرقام بحسب locale العربية، لا فشل شاشة التقرير.
- تم إصلاح المطابقة لتستخدم regex مرنًا في commit [cf2b5893e20b5a9d500249ba215feab5c67b6c21](https://github.com/Report-Engainall/Nasr1/commit/cf2b5893e20b5a9d500249ba215feab5c67b6c21). نتيجة CI لهذا الإصلاح **PENDING** عند كتابة السجل؛ لا يجوز تسجيل نجاح الاختبار قبل قراءة run المطابق.
- لا اعتماديات جديدة. يبقى اختبار نافذة الطباعة الفعلية في متصفح حقيقي غير مثبت.
- next_task_id: `NASR1-FINANCE-AGING-UI-TEST-VERIFY-CI` — اقرأ CI على commit `cf2b5893e20b5a9d500249ba215feab5c67b6c21`؛ أصلح أي فشل فعلي ثم حدّث الحالة والـrequirement registry.

### نتيجة إصلاح اختبار أعمار الذمم — SUCCESS

- الإصلاح: `cf2b5893e20b5a9d500249ba215feab5c67b6c21`، واختبار exact-SHA: [Actions 39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) = **SUCCESS**.
- نجحت جميع المراحل: frozen Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke. اختبار الواجهة وتصحيح المطابقة locale-safe اجتازا ضمن هذا التشغيل.
- تبقى حدود الإثبات: نجاح اختبار UI لا يساوي اختبار متصفح تفاعلي لميزة الطباعة ولا إثبات النشر الإنتاجي.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-002-TESTS` — يظل اختبار واجهة التقرير والطباعة موجودًا ومغطى؛ الخطوة التالية فحص مسار PDF المالي/التصدير الحالي وتحديد فجوة واحدة قابلة للإغلاق دون إنشاء نظام موازٍ أو إضافة اعتماديات.

## 2026-10-18 — NASR1-FINANCE-PDF-VALIDATION-001 — رفض المبالغ المالية غير الممكنة

- المراجعة وجدت أن `validatePayload()` في `src/lib/finance-document-pdf.ts` كان يقبل قيمة فاتورة سالبة أو مبلغ دفعة صفريًا/سالبًا، رغم أن عقد قاعدة البيانات يفرض `customer_invoices.total_amount >= 0` و`customer_payments.amount > 0`.
- التنفيذ: رفض إجمالي الفاتورة السالب، ورفض دفعات الحساب الصفريّة أو السالبة قبل إنشاء PDF. لم يتم تغيير احتساب الرصيد أو حدود الخصوصية.
- الاختبارات: `src/lib/finance-document-pdf.test.ts` يضيف تأكيدات رفض إجمالي فاتورة `-1.00` ودفعة `0.00` ودفعة `-0.01`.
- commit التنفيذ [c6f67a8ee45ee6da04a1760d663a32d1cf697b06](https://github.com/Report-Engainall/Nasr1/commit/c6f67a8ee45ee6da04a1760d663a32d1cf697b06); commit الاختبار [4e8e8a70f8d987585e436f1c8e6877dbb9276e58](https://github.com/Report-Engainall/Nasr1/commit/4e8e8a70f8d987585e436f1c8e6877dbb9276e58).
- حالة CI أثناء التحديث: run [39145321118](https://github.com/Report-Engainall/Nasr1/actions/runs/39145321118) للتنفيذ الأساسي، وrun [39145334417](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417) لنسخة الاختبار؛ كلاهما كان قيد التشغيل عند كتابة هذا السجل. **لا تُسجّل PASS حتى التحقق من النتيجة النهائية للمطابقة الصحيحة.**
- اختبار واجهة أعمار الذمم والطباعة اجتاز: [Actions 39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) على `cf2b5893e20b5a9d500249ba215feab5c67b6c21` = SUCCESS لجميع الخطوات.
- next_task_id: `NASR1-FINANCE-PDF-VALIDATION-VERIFY-CI` — اقرأ نتائج التشغيلين أعلاه، أصلح أي فشل، ثم حدّث سجل المتطلبات ونقطة الاستئناف.

### إغلاق بوابة تشديد تحقق PDF المالي — SUCCESS

- النسخة التي تضم المنطق والاختبارات: [commit `4e8e8a70f8d987585e436f1c8e6877dbb9276e58`](https://github.com/Report-Engainall/Nasr1/commit/4e8e8a70f8d987585e436f1c8e6877dbb9276e58).
- [Actions 39145334417 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417): نجحت unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview smoke وdev smoke.
- النتيجة: الحالات المستحيلة (إجمالي فاتورة سالب، دفعة صفرية أو سالبة) مرفوضة قبل إنشاء كشف الحساب PDF، مع اختبارات رجعية مضافة.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA أعلاه. لا يُدّعى اختبار متصفح أو إنتاج مباشر.
- next_task_id: `NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-001` — مراجعة عرض حالة الفاتورة في PDF مقابل due_at/الرصيد الفعلي، وإضافة اختبار حتمي إن كانت الفجوة مؤكدة.

## 2026-10-18 — NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-001 — تحديث حالة الفاتورة في كشف PDF

- الفجوة المؤكدة: `statusLabel()` في كشف الحساب كان يعتمد على `status` فقط، بينما قيم المخطط الفعلي لا تشمل حالة `overdue`؛ لذلك الفاتورة غير المسددة التي تجاوزت `due_at` قد تظهر «مستحقة» بدل «متأخرة».
- أضيف `resolveCustomerStatementInvoiceStatus()` لتحديد الحالة باستخدام `due_at` مقابل وقت ثابت لتوليد المستند، ورصيد الفاتورة بعد الدفعات؛ يعرض «متأخرة» و«متأخرة جزئيًا» عند ثبوت التأخر، ويحافظ على «مدفوعة» و«ملغاة»، ويعامل التاريخ المفقود/غير الصالح كغير محدد بدل اختلاق تأخر. الكود: [3c1bee5dea79cd055b3ac8d402adfbf7cf904f15](https://github.com/Report-Engainall/Nasr1/commit/3c1bee5dea79cd055b3ac8d402adfbf7cf904f15).
- أضيفت اختبارات حتمية: فاتورة مستحقة ومتأخرة، متأخرة جزئيًا، استحقاق مستقبلي، تاريخ مفقود، مدفوعة بحسب حالة المصدر، مدفوعة بحسب الرصيد المسدد، وملغاة. [Commit الاختبار 9b10d34b4b61c92871b8cc6d3874909d34f79e0a](https://github.com/Report-Engainall/Nasr1/commit/9b10d34b4b61c92871b8cc6d3874909d34f79e0a).
- فشل CI كشف اعتماد الفاتورة PDF الفردية على دالة `statusLabel()` نفسها التي استبدلناها لكشف الحساب؛ run [39145577858](https://github.com/Report-Engainall/Nasr1/actions/runs/39145577858) فشل اختبارين من هذه العلة المحددة، وrun [39145591658](https://github.com/Report-Engainall/Nasr1/actions/runs/39145591658) يماثل SHA الاختبارات. تمت المعالجة بإعادة دالة المصدر-status المستقلة للفاتورة الفردية مع إبقاء دالة الحساب مشتقة من الدفعات/الاستحقاق: [fix commit ba9523fdbe643d7a6503dce54f6d1b740f3f06ca](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca).
- نتيجة CI لإصلاح `ba9523f` كانت **PENDING** عند كتابة هذا الإدخال؛ run المطابق [39145659217](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217). لا تُسجل نجاحًا قبل قراءة النتيجة النهائية.
- فشل منفصل في run [39145507514](https://github.com/Report-Engainall/Nasr1/actions/runs/39145507514) توقف عند تنزيل Bun بسبب `Unexpected HTTP response: 403`، دون تشغيل الاختبارات. كان ذلك عطل تنزيل خارجي عابرًا؛ تنزيل Bun نجح لاحقًا في [39145577858](https://github.com/Report-Engainall/Nasr1/actions/runs/39145577858)، وسبب فشله كان اختبار التطبيق المذكور أعلاه لا Bun.

## سجل الفحوص المكتملة — لا تُعد من البداية

هذه الموضوعات مكتملة في هذه الجلسة بأدلة SHA/Actions؛ لا تُكرر فحصها في الانطلاقة التالية إلا إذا تغيّر الكود المعني أو أظهر CI فشلًا جديدًا:

- مركز المهام، مولد الأحداث/منع التكرار، صلاحيات المؤسسة/الدور، ودليل الإسناد: [39143265290 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر الأولوية والمسؤول والتاريخ التي تطابق القائمة والطباعة: [39144118407 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- تقرير أعمار الذمم من الفواتير/الدفعات، فصل العملات، الفئات والترقيم والتفويض: [39144691226 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة التقرير RTL/A4، ثم اختبار واجهته ومنع الدور غير المالي: [39144916657 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044).
- رفض إجمالي فاتورة PDF السالب والدفعة الصفرية/السالبة: [39145334417 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- قاعدة العمل الدائمة «إنجاز برمجي/اختباري حقيقي في كل انطلاقة» في `AGENTS.md`: [39144280302 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144280302).

- next_task_id: `NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-VERIFY-CI` — اقرأ run `39145659217` فقط لهذا التغيير. إذا نجح، حدّث نقطة الاستئناف وسجل المتطلبات ثم انتقل إلى فجوة جديدة دون إعادة الفحوص المكتملة أعلاه.

### إغلاق تنفيذ وسم التأخر في كشف الحساب PDF — SUCCESS

- SHA المختبر: [commit `ba9523fdbe643d7a6503dce54f6d1b740f3f06ca`](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca).
- [Actions 39145659217 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217): frozen Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، production-preview smoke، وdev-server smoke جميعها نجحت.
- الاختبارات الجديدة لاختلاف الحالة حسب تاريخ الاستحقاق والمدفوعات اجتازت؛ كما نجحت اختبارات PDF الفاتورة الفردية بعد إعادة فصل `statusLabel()` الخاص بها عن `resolveCustomerStatementInvoiceStatus()` الخاص بكشف الحساب.
- المحاولات التي فشلت في `39145577858` و`39145591658` انتهت بمعالجة مرجعية: `statusLabel is not defined` لأن محرر كشف الحساب أزال دالة كانت تستخدمها الفاتورة الفردية. `ba9523f` يعيد تلك الدالة بشكل مستقل؛ لا حاجة لإعادة تحليل هذا السبب.
- الحالة النهائية: `IMPLEMENTED` + `TESTED` على SHA أعلاه. لا `BROWSER-PROVEN` ولا `PRODUCTION-PROVEN`.
- next_task_id: `NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001` — اجعل تاريخ الاستحقاق ظاهرًا في كشف PDF بجوار تاريخ الإصدار، مع اختبار pagination وتنسيق RTL، دون تغيير مصادر الأرصدة أو صلاحياتها.

## تعليمات عدم تكرار العمل المكتمل

- نقطة التوقف لا تعني الرجوع لجرد المشروع أو مراجعة مكونات سبق اختبارها. ابدأ من `CURRENT_EXECUTION_STATE.md`، اقرأ فقط حالة SHA الحالي ونتيجة البوابة ذات الصلة بالدفعة النشطة، ثم نفّذ `NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001` مباشرة.
- لا تعِد فحص مركز المهام، دليل إسناد الموظفين، فلاتر المهام، تقرير أعمار الذمم، طباعة تقرير الأعمار، أو التحقق من المبالغ السالبة في PDF؛ نتائجها وSHAs وروابط CI موثقة في هذا السجل أعلاه. أعد تلك الاختبارات فقط إذا تغير الكود المعني أو كشف CI عن regression.

## 2026-10-18 — NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001 — إظهار الاستحقاق واختبار الترقيم

- تغيّر `src/lib/finance-document-pdf.ts` لإظهار تاريخ الإصدار وتاريخ الاستحقاق معًا في كشف الحساب PDF، على سطرين داخل عمود التاريخ نفسه لمنع تداخل الأعمدة بعد زيادة ارتفاع الصف. التاريخ المفقود أو غير الصالح يبقى `—` ولا يستنتج النظام تاريخًا بديلًا.
- أضيف `formatFinanceDocumentDate()` واختبار حتمي للمدخل الصحيح و`null` و`undefined` والتاريخ غير الصالح.
- أضيف اختبار قبول لتوليد كشف من 45 فاتورة بتاريخ استحقاق حقيقي أو مفقود، والتحقق من أن PDF ينشئ أكثر من صفحة ولا يرفض المستند. الاختبار: `src/lib/finance-document-pdf.test.ts`.
- الكود: [commit `a8e838fe64a0f90530d58cf165fe8b8e56e0e4e7`](https://github.com/Report-Engainall/Nasr1/commit/a8e838fe64a0f90530d58cf165fe8b8e56e0e4e7). اختبارات التنسيق والترقيم: [commit `84e0f424351bd22a9f5fc468852a8fe07b5596a2`](https://github.com/Report-Engainall/Nasr1/commit/84e0f424351bd22a9f5fc468852a8fe07b5596a2).
- [Exact-SHA Actions 39146074209 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146074209): Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke، dev smoke، والتنظيف النهائي كلها نجحت.
- فحص الفاتورة PDF الفردية أثناء تحديد النطاق أثبت أن تاريخ الإصدار والاستحقاق موجودان أصلًا هناك (`buildCustomerInvoicePdf`) ويستعملان المنسق نفسه. هذه المراجعة اكتملت ولا تحتاج إعادة فحص ما دام ذلك المسار لم يتغير.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA `84e0f424351bd22a9f5fc468852a8fe07b5596a2`. لا يوجد ادعاء باختبار متصفح فعلي أو إثبات نشر إنتاجي.
- next_task_id: `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-001` — أضف ملخصًا واضحًا للمبالغ المتأخرة داخل إجمالي الذمم حسب كل عملة في كشف الحساب، محسوبًا من due_at والدفعات، واختبر الحساب مع العملات المختلطة والفواتير الملغاة وتاريخ استحقاق مفقود.

## إغلاق مراجعة تاريخ الفاتورة الفردية — لا تُكرر

- ثبت أن `buildCustomerInvoicePdf()` يعرض بالفعل تاريخ الإصدار وتاريخ الاستحقاق في رأس الفاتورة. لا تضف عمودًا مكررًا ولا تعِد هذه المراجعة في الانطلاقة التالية إلا بعد تغيير ذلك المسار. مرجع الكود الحالي: `src/lib/finance-document-pdf.ts` على SHA `cb52fa3b7c94dc88455f98aa25617844f8c76f2e` قبل دفعة الاختبار الأخيرة؛ أحدث CI ناجح `39146074209` يشمل التغييرين.

## قاعدة الاستئناف

ابدأ دائمًا من `CURRENT_EXECUTION_STATE.md`، واعمل على `next_task_id` فقط. القائمة أعلاه توثيق نهائي للفحوص المكتملة؛ لا تُعد التحليل أو الفحص أو الاختبار السابق إلا إذا تغير الكود المعني أو أظهر CI عن خطأ جديد.


## 2026-10-18 — NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-001 — نسخ أحدث كود إلى مجلد المصالحة

- الطلب: حفظ أحدث الأكواد الفعلية المختبرة في المجلد التجميعي لتسريع التنفيذ التالي، دون خلط ملفات المصدر القديمة مع كود Nasr1 أو إعادة فحص الأعمال المغلقة.
- المجلد الجديد: `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/`.
- أضيفت 9 نسخ مطابقة للمسارات الحالية: `src/components/TaskCenter.tsx`، `src/components/CustomerWorkflows.tsx`، `src/components/CustomerWorkflows.finance-aging.test.tsx`، `src/lib/finance-document-pdf.ts`، `src/lib/finance-document-pdf.test.ts`، `src/styles.css`، `supabase/migrations/20261018030000_staff_receivables_aging.sql`، `scripts/test-database-migrations.mjs`، `AGENTS.md`.
- لكل ملف: المصدر المباشر على `main` قورن بالملف نفسه في commit الكود المختبر `84e0f424351bd22a9f5fc468852a8fe07b5596a2`; تطابقت بصمات Git blob، ثم أُنشئت نسخة Git blob أخرى بنفس SHA. التفاصيل في `CURRENT_NASR1_IMPLEMENTED_FILES.csv`.
- إصدار المرآة الأول اجتاز [Actions 39146625789 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146625789).
- المرآة الحالية تحدث إلى مصدر الكود `f830678ea99f4bb2318305a5f2e70ee761dbea1e` بعد ملخص أعمار الذمم؛ مصدر الكود اجتاز [Actions 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166). CI للcommit التوثيقي/المرآة الحالية ما يزال PENDING عند كتابة الحالة.
- `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` الأصلي لم يُعدّل، وهو لا يزال خاصًا بالمصادر المانحة. أضيف شرح منفصل إلى README لتحديد الفرق.
- تم تحديث `CURRENT_EXECUTION_STATE.md` وملف المتطلبات مع توثيق عدم تكرار العمل المكتمل.
- `next_task_id = NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI`.


## 2026-10-18 — NASR1-FINANCE-STATEMENT-AGING-SUMMARY-001 — ملخص المتأخر حسب العملة داخل PDF

- التنفيذ: `src/lib/finance-document-pdf.ts` يضيف `buildCustomerStatementCurrencySummary()` لحساب الإجمالي والمدفوع والمتبقي والمتأخر والرصيد الذي لا يملك تاريخ استحقاق صالحًا لكل عملة.
- المنطق يستخدم bigint بوحدات النقد الصغرى ووقت إصدار التقرير الثابت؛ يستبعد الفواتير الملغاة والمدفوعة بالكامل من المتأخر، ولا يصنف الاستحقاق المستقبلي على أنه متأخر.
- `src/lib/finance-document-pdf.test.ts` يختبر YER/USD/EUR والدفعات الجزئية والكاملة وفاتورة ملغاة ومدفوعاتها وموعدًا مستقبليًا وموعدًا مفقودًا. التشغيل الأول [39147011014](https://github.com/Report-Engainall/Nasr1/actions/runs/39147011014) أخفق في التوقع العددي للاختبار فقط؛ تم التصحيح وفق Vitest إلى YER مدفوع 8000 ومتَبقٍ 11000 minor units في commit [`f830678ea99f4bb2318305a5f2e70ee761dbea1e`](https://github.com/Report-Engainall/Nasr1/commit/f830678ea99f4bb2318305a5f2e70ee761dbea1e).
- [Exact-SHA CI 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166): unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview/dev smoke جميعها اجتازت.
- المرآة `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/` تُحدّث في نفس دفعة التوثيق مع manifest منفصل عن provenance المشاريع المانحة.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA `f830678ea99f4bb2318305a5f2e70ee761dbea1e`. لا يثبت هذا اختبار متصفح أو نشرًا إنتاجيًا.
- next_task_id: `NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI` ثم `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-RECONCILE`.


### إغلاق تحديث مرآة الكود الحالية — SUCCESS

- Commit المرآة والوثائق: [`1039b9424be66ea4feabb003096c3bfd3fff5319`](https://github.com/Report-Engainall/Nasr1/commit/1039b9424be66ea4feabb003096c3bfd3fff5319).
- [Actions 39147434273 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147434273): Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke كلها ناجحة.
- Readback للمجلد: manifest يحمل 9 صفوف، كل صف `git_blob_identical=YES`; `src/lib/finance-document-pdf.ts` و`.test.ts` داخل المرآة لهما بصمتا المصدر الأحدث `66ed7294...` و`07d3fc96...`. `PROVENANCE_MANIFEST.csv` الخاص بالمانحين لم يُعدّل.
- تم إغلاق `NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI`; next task هو `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-RECONCILE`.


## 2026-10-18 — NASR1-CUSTOMER-STATEMENT-FULL-AGING-SUMMARY-001 — مجاميع كاملة خادمية لكشف العميل

- الفجوة: `get_customer_account_statement()` كان يعيد حتى 200 فاتورة و500 دفعة، وكان PDF يحسب أعمار الذمم من السجلات العائدة فقط؛ هذا قد يقلل المدفوع أو الرصيد المتأخر في عميل كثير الحركات.
- migration جديدة `supabase/migrations/20261018040000_customer_statement_full_aging_summary.sql` تستبدل جسم الـRPC الحالي نفسه (ليس RPC موازٍ)، وتضيف `summary_as_of_utc` و`summary` حسب العملة من كل الفواتير والمدفوعات للمؤسسة/العميل المصدق عليه. تبقى قوائم التفاصيل محدودة بـ200/500.
- تُضاف إلى كل فاتورة في التفاصيل قيم `paid_amount` و`outstanding_amount` من دفترها الكامل، لتظل صفوف الفاتورة صحيحة حتى لو كانت بعض المدفوعات أقدم من أحدث 500 دفعة المعروضة.
- `src/lib/finance-document-pdf.ts` يفضّل الملخص الخادمي إذا وُجد ويطابق cut-off الخادمي عند حساب حالة التأخر، ويتحقق من مبالغ وقيم الملخص وازدواج العملات وبقاء بنود التأخر داخل المتبقي باستخدام bigint. إذا لم يكن الملخص موجودًا في نسخة backend أقدم، يحتفظ بfallback واضح أنه للسجلات المعادة فقط.
- `src/lib/finance-document-pdf.test.ts` يختبر دقة bigint للأرقام الكبيرة، المجاميع ذات العملة المتعددة، المدخل الخادمي الموثوق والـfallback، والبيانات غير الصحيحة.
- `scripts/test-database-migrations.mjs` يتحقق من summary cutoff ومجاميع الفاتورة/الدفع/المتبقي والـbuckets وعزل ملخص العميل عن العميل الآخر، بالإضافة إلى الحقول لكل فاتورة.
- عالجنا أخطاء اختبار حقيقية خلال التنفيذ: [39148570829](https://github.com/Report-Engainall/Nasr1/actions/runs/39148570829) و[39148691924](https://github.com/Report-Engainall/Nasr1/actions/runs/39148691924) كشفتا أخطاء تثبيت assertion/توقع bigint وإعادة تطبيع الملخص. لم تُخفف الاختبارات. الإصلاح النهائي [`98a80df80b366e811923b80d53fe06a519e754d0`](https://github.com/Report-Engainall/Nasr1/commit/98a80df80b366e811923b80d53fe06a519e754d0) اجتاز [Actions 39148856503 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503) بجميع المراحل.
- الحالة: `IMPLEMENTED + TESTED` على `98a80df80b366e811923b80d53fe06a519e754d0`. لا يوجد ادعاء بتطبيق migration في قاعدة الإنتاج أو اختبار متصفح مباشر.
- المرآة `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/` تُزامن إلى نفس الكود المختبر؛ donor `PROVENANCE_MANIFEST.csv` يبقى دون تغيير.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI` ثم `NASR1-CUSTOMER-STATEMENT-SUMMARY-CAP-BOUNDARY-001`.


## 2026-10-18 — إغلاق مرآة الكود بعد ملخص دفتر العميل الكامل

- commit المرآة/الوثائق: [`cbbcce4b1db64530f8234e82523e2b2aebbe6f53`](https://github.com/Report-Engainall/Nasr1/commit/cbbcce4b1db64530f8234e82523e2b2aebbe6f53).
- [Actions 39149188875 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39149188875): unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke اجتازت.
- readback للمجلد `READY_TO_REUSE/Nasr1--verified-current-implementation`: manifest يحتوي 10 صفوف، وكلها موسومة `git_blob_identical=YES`؛ تم التحقق من مرآة `src/lib/finance-document-pdf.ts` على blob `8729c401397a4c9000ab8714bfeb0a193f1dc2ab` وmigration ملخص الدفتر الكامل على blob `2734f6d88ba85d9556d7bbee5d142dce5c7556d9`. `PROVENANCE_MANIFEST.csv` للمانحين لم يُعدّل.
- تم إغلاق `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`. لا تُعد مزامنة أو تدقيق المجلد في الانطلاقة التالية ما لم يتغير أحد الملفات أو يفشل CI.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-CAP-BOUNDARY-001` — إثبات حدود التفاصيل 200/500 مع بقاء الملخص كاملًا.


## 2026-10-18 — NASR1-CUSTOMER-STATEMENT-VOID-EXCLUSION-001 — إغلاق اختبار الحدّ 200/500 مع فاتورة ملغاة

- تحديث اختبار القبول في `scripts/test-database-migrations.mjs`: أنشأ 205 فواتير و505 دفعات، كما أضاف فاتورة ملغاة بقيمة 900.00 ودفعة 500.00، ثم قارن ملخص العميل الكامل قبل/بعد fixture باستخدام `BigInt` في الوحدات النقدية الصغرى.
- أثبت الاختبار أن تفاصيل RPC لا تتجاوز 200 فاتورة و500 دفعة؛ الفواتير/الدفعات الخارجـة عن قوائم التفاصيل لا تضيع من الملخص الكامل؛ الفاتورة الملغاة ومدفوعاتها لا تدخل الإجمالي أو المدفوع أو المتبقي أو المتأخر؛ ورصيد الفاتورة المعروضة يحسب الدفعات الـ505 كلها.
- سبب إخفاق سابق: تعبير regex للمال كان مفرط الهروب، ثم assertions طرحت مبالغ عبر JavaScript `Number`. أصلحنا regex واستخدمنا `BigInt`; الاختبارات لم تُخفف.
- الكود [`618e3d3c019ecd7d05ca0462ca954f908178b814`](https://github.com/Report-Engainall/Nasr1/commit/618e3d3c019ecd7d05ca0462ca954f908178b814) اجتاز [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395): unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke.
- تحديث مرآة `READY_TO_REUSE` والـmanifest قيد الإضافة في commit منفصل؛ CI الخاص بالمرآة مطلوب قبل إغلاق مزامنتها.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`.


## إغلاق مزامنة مرآة أحدث كود — SUCCESS
- كود الاختبار [`618e3d3c019ecd7d05ca0462ca954f908178b814`](https://github.com/Report-Engainall/Nasr1/commit/618e3d3c019ecd7d05ca0462ca954f908178b814) اجتاز [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395): اختبار 205 فواتير و505 دفعات، استبعاد الفاتورة الملغاة ومدفوعاتها، مجاميع دقيقة بـBigInt، وحدود التفاصيل، وجميع مراحل CI.
- تمت مزامنة نسخة `scripts/test-database-migrations.mjs` إلى `READY_TO_REUSE/Nasr1--verified-current-implementation/` مع manifest من 10 ملفات؛ blob المصدر والنسخة `08193e20f311e82d87a3873ef4cf40ee800dc11a` متطابق.
- تحديث المرآة والوثائق [`c1d9d04ea969ba12f8cd748a3d06d6c9f40a303a`](https://github.com/Report-Engainall/Nasr1/commit/c1d9d04ea969ba12f8cd748a3d06d6c9f40a303a) اجتاز [Actions 39150638459 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150638459).
- تم إغلاق `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`. لا تكرر التحقق أو إعادة نسخ الملفات العشرة ما لم تتغير المصادر.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001`.

## 2026-10-18 — NASR1-BOOT-RECOVERY-SOURCE-MANDATE-001
- الهدف: Report-Engainall/Nasr1/main فقط. هذه الدفعة تحدث ملفات الإقلاع والجرد ولا تدعي دمج ميزة من ZIP.
- SHA الأساس: 154ec48397164473010d40bd3b509c24f188030e؛ [Actions 39150932901 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150932901). هذه النتيجة للأساس فقط ولا تنتقل إلى commit الوثائق.
- أُغلقت NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001 على SHA الأساس مع CI مطابق.
- READY_TO_REUSE/PROVENANCE_MANIFEST.csv فيه 69 صفًا؛ سجل الدمج السابق لا يثبت قرارًا منفصلًا لكل عنصر، لذا المصالحة مفتوحة.
- https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17 يعرض Nasr1_Bolt_Before_Failure.zip (1,003,172 بايت؛ Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318) وNasr1_Bolt_Restored_Current.zip (997,589 بايت؛ Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936). لم تُنزّل البايتات ولم يُحسب SHA-256 أو يُختبر ZIP ولم يحدث استخراج؛ عدد الأعضاء مجهول.
- أضيف الملفان إلى ARCHIVE_MANIFEST.csv وSOURCE_INTEGRATION_LEDGER.csv بصفة metadata متاحة وغير مستخرجة؛ لم تُختلق صفوف أعضاء في ARCHIVE_MEMBERS.csv.
- لا تغييرات runtime/DB/dependencies. الاختبارات المحلية NOT RUN إن لم تتوفر workspace؛ يلزم CI exact-SHA للـcommit الجديد.
- next_task_id: NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001.

## 2026-10-18 — NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001 — evidence persisted

- Target: Report-Engainall/Nasr1 / main; immutable source: Report-Engainall/report-insight-engine@b1ca62ec277ff9f55c8e850e0470d61d81aaa138.
- Before_Failure: 1,003,172 bytes; SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365; Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318; 359 members; ZIP integrity/safe extraction PASS.
- Restored_Current: 997,589 bytes; SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214; Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936; 358 members; ZIP integrity/safe extraction PASS.
- Pair diff: {"IDENTICAL_CONTENT": 340, "CHANGED_CONTENT": 18, "BEFORE_ONLY": 1}; 717 member rows. Member decisions: {"EXCLUDED_SECURITY": 8, "TARGET_PRESENT_DIFFERENT_CONTENT_REVIEW": 108, "ALREADY_PRESENT_EXACT": 562, "MISSING_TARGET_CANDIDATE": 39}.
- READY_TO_REUSE path/hash audit: {"ALREADY_PRESENT_EXACT": 4, "TARGET_PATH_DIFFERS_REVIEW_CONTENT": 2, "TARGET_PATH_MISSING_REVIEW_CONTENT": 63} across 69 rows; semantic contract/API/RLS review is NOT COMPLETE.
- Security decision: archived code not executed; sensitive/password/grant content not copied; legacy SQL with DROP FUNCTION ... CASCADE not applied.
- Archive workflow run: https://github.com/Report-Engainall/Nasr1/actions/runs/39154736119.
- Source integration: legacy React Router AdminAuditLog adapted into src/components/AdminAuditLog.tsx and src/routes/admin_.audit.tsx; RLS hardening migration and real PostgreSQL boundary assertions added. Exact code SHA bb08320b690203f7f9b1ce65287e389e847c2dea / Actions run 39154450426 SUCCESS (unit, PostgreSQL 17/RLS, lint, build, preview and dev smoke).
- Failures retained truthfully: Actions run 39154189270 found JSX parse error; run 39154309412 found invalid template-literal escapes; corrected build passed run 39154450426.
- BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production Supabase migration=NOT RUN; Onyx live vendor round-trip=NOT RUN.
- next_task_id = NASR1-READY-TO_REUSE-SEMANTIC-INTEGRATION-001

 
## 2026-10-18 — NASR1-BOLT-RECOVERY-CI-REVALIDATION-001
- Target: Report-Engainall/Nasr1/main only.
- Added both immutable raw Bolt ZIP URLs to `scripts/reconcile-source-release-snapshots.py`, preserving the previously recorded expected byte counts and SHA-256 values. The downloader supports explicit raw URLs as well as release assets.
- Code commit: `92a948e83ebc05278b09d50aec410da490c76f7c`.
- Full checks exact-SHA: [Actions 39157355224 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355224): frozen Bun lock, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview smoke and dev smoke.
- Archive audit exact-SHA: [Actions 39157355307 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355307). Both Bolt snapshots passed expected byte-count/SHA-256 checks, ZIP path/size/ratio checks, full member decompression/CRC traversal, and bounded non-sensitive source/text extraction to temporary CI storage. No archived code was executed and no SQL applied.
- Refreshed SOURCE_INTEGRATION_LEDGER.csv and ARCHIVE_MANIFEST.csv to remove stale NOT DOWNLOADED claims and record the actual validation evidence.
- Archive integrity is not semantic integration. READY_TO_REUSE/PROVENANCE_MANIFEST.csv has 69 data rows; per-file contract/import/route/RLS review and useful missing feature integration remain open.
- IMPLEMENTED: explicit raw-source support in audit tooling. INTEGRATED: CI workflow. TESTED: full checks and ZIP audit on exact code SHA above. BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migrations=NOT RUN; Onyx vendor round-trip=NOT RUN.
- next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001.

 
## 2026-10-18 — NASR1-READY-FINANCE-INPUT-001
- المصدر المراجع: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/finance.ts` (blob `d9c2131b2d582b5b5baa20e3b497cd272c3b31e9`).
- لم تُنسخ الخدمة القديمة بسبب اختلاف عقد Supabase وبنية الواجهة؛ كُيّفت حدود إدخال التحصيل إلى `src/lib/finance-input.ts` ووُصلت بالنموذج الفعلي في `src/components/CustomerWorkflows.tsx`. أضيف `src/test/finance-input.test.ts`.
- التحقق: [Actions 39157780840 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157780840), exact code SHA `dd6bdaac8225be3bc0c0bc8d266b5e13aaab6c75`: frozen lock, unit tests, PostgreSQL 17 migrations/RLS, lint, build, preview/dev smoke PASS.
- التغيير لا يستبدل تحقق قاعدة البيانات؛ لا فاتورة تاريخية أو بيانات demo أو خدمة مدفوعة أضيفت.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN.
- مراجعة بقية صفوف READY_TO_REUSE مستمرة؛ next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001.


## 2026-10-18 — NASR1-INVENTORY-AVAILABLE-STOCK-METRIC-001

- Target: `Report-Engainall/Nasr1` / `main`. Donor candidate: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `src/services/inventory.ts` blob `3506707a656e0db491b860d5e11ad28daeded5cf`; paired donor test blob `04d706d4f2f68f30743911b2f3dd3e824a0dd18c`.
- Corrected the active dashboard low-stock calculation to use `quantity_available`, not gross `quantity_on_hand`; made the dashboard surface inventory-read failure instead of silently calculating zero alerts. Added `countLowStockBalances` and unit coverage for reservations, threshold equality, zero/null threshold policy, invalid snapshots and empty sets.
- Semantic decision on donor service: its contract calls `transfer_inventory`, `set_stock_threshold`, `get_low_stock`, `start_stock_count`, `set_stock_count_line`, `complete_stock_count` and reads `stock_count_sessions/stock_count_lines`. Those names were absent from all 42 active target migration SQL files at code SHA `6e746a7684f4cf8696c3b2c2bbfdd8f410cd364f`. The donor test imports its legacy `./inventory` module, so it is not a drop-in target test. Rejected wholesale copy; no unsupported RPC or SQL was added.
- Code files: `src/lib/inventory-metrics.ts`, `src/lib/api.ts`, `src/test/inventory-metrics.test.ts`.
- Exact-SHA CI [39158519832 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39158519832), code SHA `6e746a7684f4cf8696c3b2c2bbfdd8f410cd364f`: frozen lock verification, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview smoke and dev smoke all successful.
- State: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production Supabase migrations=NOT RUN. This is only a target-native low-stock-metric correction, not inventory transfer/count feature completion.
- next_task_id remains `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`.


## 2026-10-18 — NASR1-IMPORT-CHUNK-CONTIGUITY-001

- Source candidate reviewed: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `supabase/migrations/0021_import_server_boundary_hardening.sql` source blob `16f9091fe712f947a4f4dfc6c06b38773273967f`; older `0008_atomic_import_commit.sql` blob `74372746bbbe7f000c42f24688e74542cab91448` uses a different products/import_rows/price_lists schema and was not copied.
- In the live target, `record_import_upload_chunk` previously validated offset/size/hash and idempotent duplicate rows but accepted out-of-order new chunk numbers. Added `supabase/migrations/20261018060000_import_upload_chunk_contiguity.sql` to enforce sequential chunk-prefix writes under a row lock and preserve identical retries.
- Extended `scripts/test-database-migrations.mjs` with multi-chunk acceptance: reject chunk 1 before 0; reject chunk 2 before 1; no failed write persists; accept idempotent retry; accept full ordered sequence with a smaller final chunk.
- Exact-SHA CI [39159034597 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159034597), code SHA `a02ad4682ed1e18a10811040ae20134875031de7`: lockfile, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build and preview/dev smoke all PASS.
- Status: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS on exact SHA; production migrations=NOT RUN; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. This is an import-integrity hardening, not full semantic integration of all donor candidates.
- next_task_id = `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`.

## 2026-10-18 — NASR1-INVENTORY-TRANSFER-001

- Source reviewed: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/inventory.ts`, blob `3506707a656e0db491b860d5e11ad28daeded5cf`. Old service uses distinct RPC parameters and assumptions about schema; no wholesale copy.
- Target-native integration: migration `supabase/migrations/20261018070000_inventory_transfer_command.sql`; API `fetchActiveInventoryWarehouses` + `transferInventory` in `src/lib/api.ts`; transfer modal and control in `src/components/AghbariApp.tsx`; PostgreSQL acceptance cases in `scripts/test-database-migrations.mjs`.
- Transaction invariants: active same-tenant product and warehouses; source available quantity (not gross on-hand) must cover transfer; row locking in deterministic order; source and destination balances change atomically; paired immutable movement rows and audit; exact-payload idempotent replay returns the same transfer without duplicate movement; payload mismatch rejected.
- Test correction history: first run [39159581588](https://github.com/Report-Engainall/Nasr1/actions/runs/39159581588) failed on invalid schema qualification of SQL COALESCE; corrected. [39159657535 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159657535) validated transfer logic and all project checks. The latest UI quantity-label correction then passed exact-SHA CI [39159745907 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159745907) at `89fe8089aa2fd7d4f1b5130c8af85dc1171b4185`.
- State: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN. Stock-count session/line feature remains open.
- next_task_id = `NASR1-INVENTORY-REORDER-POINT-COMMAND-001`.

## 2026-10-18 — NASR1-INVENTORY-WRITE-BOUNDARY-REORDER-POINT-001

- Source candidate: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/inventory.ts` blob `3506707a656e0db491b860d5e11ad28daeded5cf`. Legacy contract supports min/reorder/max quantities and calls `set_stock_threshold`; target schema has one integer `inventory_balances.reorder_point`, so only equivalent target-native behavior was adapted.
- Added `supabase/migrations/20261018080000_inventory_write_boundary_and_reorder_point.sql`, API `fetchInventoryReorderPoint` / `setInventoryReorderPoint` and admin/manager UI. Direct authenticated DML on inventory balances and movement ledger is revoked; reads remain available under existing RLS. A manager RPC writes only an existing same-tenant balance, validates threshold/reason, records audit history and lets the existing inventory trigger reconcile the purchasing task.
- Added migration acceptance for direct write denials, changing and repeating a threshold, audit old/new values, task reopen/complete lifecycle, invalid threshold, cross-tenant warehouse and accountant denial. Corrected the error-match regex in follow-up test commit `591dce4e59383e7a568c9a19c7f7e823fe5aa7f3`.
- Exact-SHA CI [39160377663 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39160377663), code SHA `591dce4e59383e7a568c9a19c7f7e823fe5aa7f3`: frozen lock, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview/dev smoke PASS.
- Production Supabase migrations=NOT RUN; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. next_task_id = `NASR1-INVENTORY-STOCK-COUNT-001`.

## 2026-10-18 — NASR1-INVENTORY-STOCK-COUNT-001 — ربط واجهة الجرد الفعلي

- الأساس الحي: `4ef323db2aa7b3ea9e11e1bb362fc37e7994221a`؛ schema/RPC/API للجرد الفعلي موجودة واختباراتها اجتازت [Actions 39161411949 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39161411949).
- أضيفت `src/components/InventoryStockCountPage.tsx` و`src/routes/admin_.stock-count.tsx` وربط التنقل في `src/components/AghbariApp.tsx`، وتحديث routeTree المولّد وقائمتي preview/dev smoke في workflow.
- الواجهة تعرض فقط بيانات المستودع الفعلية؛ بدء الجلسة idempotent، كل كمية تُحفظ عبر RPC، الاعتماد/الإلغاء إداريان، سبب الإلغاء مطلوب، والطباعة محصورة في منطقة ورقة الجرد. لا dependency أو خدمة مدفوعة أو سجل وهمي.
- backend tests المثبتة: snapshot، منع الجلسات المكررة، movement+audit، stale-snapshot denial، ورفض الأدوار غير الإدارية. Exact-SHA UI/code CI [39165071610 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39165071610) على `94c0f92eea5fe8d2add289106c3f76d884460d4d`: frozen Bun lock، unit tests، PostgreSQL 17 migrations/RLS acceptance، lint، build، preview smoke `/admin/stock-count` وdev smoke PASS.
- الحالة الحالية: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN.
- next_task_id = `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`.



## 2026-10-19 — NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001 — تكامل محاسبي ومسارات الدخول

- العمل استهدف `Report-Engainall/Nasr1` / `main` فقط؛ لا force-push ولا حذف لعمل قائم.
- Commit `5c36f1c0baf57a9b908b7d65d2dbe4d78aef5dca` أضاف مساري التسجيل واستعادة كلمة المرور، وتوسيع اختبار المسارات. فشل الاختبار الأول لأن النص المفترض لتسجيل الدخول لم يطابق النص الفعلي؛ صُحح الاختبار في `d94d642cdeab74ed2437407049434dd59466adf4`. [Actions 39171368206 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39171368206) اجتاز unit/build/preview/dev smoke على SHA المصحح.
- تمت قراءة المرشح `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/supabase/migrations/0032_finance_invoices_cash_expenses.sql`؛ نموذج المصدر يستخدم جداول `branches/cash_accounts/operational_invoices/public.payments/public.expenses` ودورًا مختلفًا. تم تكييف وظيفة المصروفات فقط إلى مخطط Nasr1 بدلاً من تطبيق migration المصدر.
- أضيفت `supabase/migrations/20261019100000_finance_cash_expenses.sql`، و`src/components/CashExpenseLedger.tsx`، و`src/lib/cash-expense-input.ts`، واختبارات الوحدة وقبول PostgreSQL، وربطها بـ`StaffFinancePage`. ميزات الاختبار: المبلغ الدقيق، idempotency/replay/conflict، عزل المؤسسة وRLS، دور المحاسب مقابل إلغاء المدير، منع DML المباشر، الحفظ غير الهدام للسجل الأصلي وحدثا تدقيق.
- فشل DB acceptance الأول على SHA `65ad6347aaf4938b24bf66577f6d1c82e51de778` لأنه توقع خطأً أن قراءة المصروفات يجب أن تفشل للمحاسب المصرّح به. أزيل التوقع الخاطئ؛ لا تغيير على صلاحيات الخادم. [Actions 39171703391 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39171703391) يطابق SHA `c3e4e3da71bedd9c8495fd5bd8cf901c6aee5d25` ويؤكد unit tests، PostgreSQL 17 migrations/RLS acceptance، lint، build، production-preview smoke وdev smoke PASS.
- أرشيفا Bolt: محاولتا raw download خلال هذه الجلسة انتهتا برسالة أداة GitHub الفعلية `HTTP 400: GitHub Fetch supports UTF-8 text files; this file appears to be binary or encoded differently (Response: None)`، بينما محاولة بيئة التنفيذ أعادت `URLError [Errno -3] Temporary failure in name resolution`. بصمات SHA-256 وCRC وفك المسارات مثبتة تاريخيًا في Actions 39157355307 على SHA 92a948e... فقط؛ إعادة التنزيل/إعادة التحقق الحالية `NOT RUN`.
- تم تحديث source integration ledger وaudit row لترحيل المصروفات. المراجعة الدلالية لجميع 69 مرشحًا لم تكتمل، لذلك يظل `next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001` مفتوحًا. Production migration NOT RUN; BROWSER-PROVEN NOT PROVEN; PRODUCTION-PROVEN NOT PROVEN.



## 2026-10-19 — مراجعة دلالية لكل مرشح وإغلاق NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001

- أعيدت مطابقة 69 صفًا من `PROVENANCE_MANIFEST.csv` و`READY_TO_REUSE_FILE_AUDIT.csv` صفًا بصف (source path + donor blob SHA)، وأُسند لكل واحد قرارًا محددًا وسببًا وعقدًا واختبار إثبات/حالة اختبار واضحة. لم يُزعم أن كود المانحين الذي رُفض/لم يُدمج قد تم اختباره؛ جميع نتائج تلك الصفوف تذكر بوضوح أن donor code NOT RUN.
- أضيفت قرارات المرشحين الفردية إلى `SOURCE_INTEGRATION_LEDGER.csv` دون حذف السجل التاريخي أو تكرار التكامل القانوني لسجل المصروفات. يحتفظ تنفيذ PDF/import/addresses/company-members/retry/current analytics بواجهاته الموجودة إذا كانت أحدث أو مدمجة بالفعل؛ ترفض شاشات وSQL القديمة عندما تختلف مخططات الجداول/الأدوار أو تتجاوز الخادم، خصوصًا التحليلات المباشرة بلا حدود، وإنشاء أرقام الطلب من العميل وكتابة السعر/الطلب مباشرة.
- `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001` مغلقة؛ التالية الوحيدة `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` للبدء بمطابقة واجهات المواصفة الأصلية وإكمال أول فجوة حقيقية واختبارها.
- current-session archive re-download/extract remains NOT RUN because the two binary requests failed HTTP 400 through GitHub fetch and DNS resolution failed in runner; prior Actions SHA256/CRC/safe-path test remains historical evidence only. Browser proof and production deployment remain NOT PROVEN/NOT RUN.


## 2026-10-19 — تكامل واجهة بيانات Onyx الفعلية (pending CI)

- فجوة مؤكدة بالبحث عن مراجع المستهلك: دوال `fetchOnyxSnapshots` و`fetchOnyxSnapshotAnalytics` و`runInventoryReconciliation` كانت موجودة في API، لكن لوحة الإدارة كانت لا تعرض شاشة مرتبطة بها. أضيفت `src/components/OnyxSnapshotCenter.tsx` وربطت داخل `src/components/AghbariApp.tsx` في مركز البيانات.
- أُضيفت عقود/تحقق typed إلى دوال قراءة اللقطات وصفوفها في `src/lib/api.ts`، ومعاينة 100 صف فقط، ومؤشرات جودة وتوزيع حالات وترتيب أصناف وتحليل تنبؤي بحالة صريحة، ومطابقة مخزون خادمية غير هدّامة مع رقم تشغيل وسجل تدقيق، وطباعة خاصة بالتقرير.
- أُضيف `src/test/OnyxSnapshotCenter.test.tsx` لأربع حالات (عرض مصدر حقيقي، المطابقة، رفض غير الموظف، فشل قاعدة البيانات). أُصلحت كذلك حقول `test_command/test_result` التي كانت فارغة عن طريق نسخ إثبات كل صف من سجل الجرد إلى دفتر الدمج.
- هذه الواجهة لا تنشئ اتصال Onyx خارجيًا ولا تدعي قبول Workbook في Onyx. دوال الخادم الحاليَّة وRLS هي حد المؤسسة؛ تشغيل الإنتاج/المتصفح الخارجي لم ينفذ.


## 2026-10-19 — Onyx UI + طباعة مركز المهام — exact-SHA CI PASS

- HEAD الكود: a38e43f4da656da6cc10abdb476b0023dd029440. CI مطابق: [Actions 39173352654 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39173352654). PASS: frozen lockfile, unit tests, PostgreSQL 17 migrations/RLS/business acceptance, lint, build, production-preview smoke 4173, dev-server smoke 5173.
- Added and mounted OnyxSnapshotCenter within the existing admin data center. It presents stored source snapshots and SHA256 evidence, quality/status metrics, top items, forecast state, the first 100 source rows, server-side inventory reconciliation results and a printable evidence report. No external Onyx connection/round-trip is claimed.
- Snapshot APIs validate required fields and selected snapshot ID; malformed data fails closed. UI tests cover snapshot loading, reconciliation, non-staff denial and service error.
- Task Center printing uses src/lib/task-print.ts to restrict print scope to the authenticated account allowedRoles. All-allowed or one allowed role may be printed while shared status/priority/assignee/date/search filters remain applied; unauthorized or empty scopes return no rows. Unit tests and current task-event/idempotency PostgreSQL acceptance passed.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA a38e43f4da656da6cc10abdb476b0023dd029440; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; PRODUCTION_MIGRATION=NOT RUN. Next task: NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002; all original-spec interfaces are not yet complete.
- Archive fetch caveat unchanged: current-session binary GitHub fetch returned HTTP 400 (connector only supports UTF-8 text); runner fetch returned DNS error [Errno -3] Temporary failure in name resolution. The earlier SHA256/CRC/safe-extraction result is historical Actions 39157355307, not a fresh download in this session.


## 2026-10-19 — إصلاح فشل CI المرصود أثناء الدمج

- فشل تشغيل CI رقم 39174326823 على SHA f4a84e6ac6cf85966a918ca3bfa1cd0f81c28975 في Unit tests فقط؛ المرحلتان PostgreSQL/Lint/Build تم تخطيهما بسبب ذلك الفشل.
- سجل GitHub الحقيقي: الاختباران في src/test/storefront-discovery.test.tsx دخلا ErrorBoundary لأن vi.mock الخاص بـ @/lib/api لا يصدّر fetchStorefrontAnnouncements بعد أن أصبح Storefront يستدعيه.
- أضفت mock صريحًا للدالة، وأرجع useFetch قائمة فارغة للاختبارات التي لا تختبر إعلانات المتجر؛ هذا يزيل الاعتماد العرضي على mock ناقص دون تغيير سلوك الإنتاج.
- إعادة الاختبارات على الرأس النهائي لا تزال PENDING؛ فشل التشغيل السابق ليس نتيجة اختبار للترحيل أو المكوّن الجديد.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-ANNOUNCEMENTS-002: exact-SHA tests passed

- Implemented the active TanStack storefront slider and admin manager; no legacy React Router component copied into the active tree.
- CI 39174470933 passed on exact code SHA 5308c3f917852cf3a2474a0ac0201bee8c8f32be. Success covers unit tests, the isolated PostgreSQL 17 migration/authorization suite, lint, build, preview smoke and dev smoke.
- Failure addressed: CI 39174326823 on f4a84e6ac6cf85966a918ca3bfa1cd0f81c28975 failed two storefront discovery tests because the API mock omitted fetchStorefrontAnnouncements. The test mock and empty-list return were corrected; exact-SHA CI passed afterwards.
- Code status: IMPLEMENTED and INTEGRATED; TESTED=PASS (exact-SHA CI). Browser screenshot/interactive verification=NOT RUN. Production deployment/migration=NOT RUN. No production data was created.
- Source intake: 69 rows appear in both READY_TO_REUSE/PROVENANCE_MANIFEST.csv and READY_TO_REUSE_FILE_AUDIT.csv; the audit records per-file decisions. Source ZIP re-download, refreshed SHA-256/CRC and extraction remain NOT RUN in this environment due raw.githubusercontent.com DNS failure; previously recorded hashes are historical only.
- Overall current task remains NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002. This closes only the storefront announcements gap; remaining specification gaps must not be labeled complete.

## 2026-10-19 — شبكة أسعار التحرير المجمع

- Code SHA: `7e3bdbee89def1e7c4396235a87618c357858fac`.
- Integrated the active admin price grid with explicit, authorized read RPC `get_admin_product_price_grid`, corrected write RPC `save_product_price_grid`, keyboard movement, pre-save diff preview and one-transaction batches.
- The real database model is `products.base_price/wholesale_price/retail_price` plus `product_prices` rows for `vip/wholesale/retail`; the first implementation’s nonexistent columns were corrected by `20261019130000_product_price_grid_actual_price_tables.sql`.
- PostgreSQL acceptance checks cover read model values, tier persistence, admin/manager access, accountant denial, stale-value detection, audit and rollback when a cross-tenant product appears in a batch.
- Exact-SHA CI outcome: FAIL (failure): exact-SHA GitHub Actions 39175623592 for 7e3bdbee89def1e7c4396235a87618c357858fac (https://github.com/Report-Engainall/Nasr1/actions/runs/39175623592); must fix before closure.
- IMPLEMENTED=YES; INTEGRATED=YES; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; production migration=NOT RUN.
- Archive pair re-download, fresh SHA256/CRC and safe extraction remain NOT PROVEN; the direct download blocker previously returned `curl: (6) Could not resolve host: raw.githubusercontent.com`.
- `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` remains open; do not infer full-spec completion from this gap alone.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-PROMOTIONS-003: إدارة الحملات الآمنة

- فحص الرأس المباشر قبل التعديل: `46b957fd3e490f32071f90b0b9e2f76a7712602f`; شُغلت التعديلات على `main` بعمليات fast-forward فقط، بلا force-push.
- أصلحت regressions ظهرت من سجلات CI الفعلية: عند فصل قراءة المتجر العام عن الإدارة، فشل اختبار المتجر لأن mock لم يصدّر `fetchStorefrontPromotions`; أُضيفت الدالة إلى mock. على HEAD النهائي، لا يبقى هذا الفشل.
- أضيفت migration `20261019140000_promotion_management_commands.sql`؛ فصلت RPCs العامة والإدارية، فرضت المؤسسة الحالية والـadmin/manager النشط، سحبت direct table DML/SELECT من أدوار المتصفح، وتحققت من تواريخ الحملة ونوع/قيمة الخصم وانتماء الأصناف والتصنيفات وسجل التدقيق.
- أضيفت `PromotionManager.tsx` وربطها من لوحة الإدارة بدل الزر المعطّل. اختبارات UI: `src/test/PromotionManager.test.tsx`; اختبارات DB: `scripts/test-database-migrations.mjs`. عدد الاختبارات المرئي في سجل CI: 34/34 ملفات و279/279 اختبارًا ناجحًا.
- CI المطابق النهائي: [39185199950 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39185199950), exact code SHA `ddd99501594fca3d622555e3868159e65c987952`. Unit tests, PostgreSQL 17 migration/RLS acceptance, lint, build, preview smoke 4173 and dev smoke 5173: PASS. ثبت سجل قاعدة البيانات `PASS promotion management...`.
- تصنيف الإثبات: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS (exact SHA); BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; PRODUCTION_MIGRATION=NOT RUN.
- حد موثق: سجل الحملة لا يغير إجمالي الطلب؛ ربط النسبة بمحرك التسعير/الفاتورة NOT IMPLEMENTED. إخفاء قيمة الخصم من العرض العام مؤقتًا مقصود لمنع الادعاء بخصم غير مطبق.
- ZIP attempts (fresh): `https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Before_Failure.zip` و`https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Restored_Current.zip`. GitHub Fetch أعاد HTTP 400 `GitHub Fetch supports UTF-8 text files; this file appears to be binary or encoded differently (Response: None)`; Web fetch كان DisabledError؛ تنزيل الحاوية مُنع برسالة URL not viewed in conversation; رابط GitHub raw البديل `github.com/.../raw/refs/heads/main/...` أعاد 404 `No commit found for the ref refs`. fresh download/hash/CRC/safe extraction/content comparison: NOT RUN. لا تخلط ذلك مع SHA/CRC التاريخي في Actions 39157355307.
- فرع recovery وPR #1 تم الاطلاع عليهما؛ PR #1 Draft وغير مدمج، ولا SQL من quarantined/PR تم تفعيله. الـmanifest الدلالي يبقى كما هو؛ قراراته الـ69 لا تثبت تشغيل كود المصدر.
- المهمة النشطة تبقى `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`; تغطية المواصفة الأصلية بالكامل غير مكتملة.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-PRICE-GRID-CSV-001

- Implemented `src/lib/price-grid-csv.ts` and connected both import and export controls inside `src/components/PricingGrid.tsx`.
- Export writes saved server rows only, uses UTF-8 BOM, fixed Arabic headers, quoted cells/escaped quotes, two-decimal price values, and spreadsheet-formula prefixing for untrusted text. No price draft is exported as if committed.
- Import parses the fixed CSV format, resolves exact `item_code` identifiers (leading-zero bytes retained), rejects malformed headers/rows, duplicated/unknown item codes and invalid/negative/>2dp amounts, with a 2MB file cap and 200-row limit. Imported values become drafts only; preview and the existing atomic server save command are still required.
- Added helper coverage in `src/test/price-grid-csv.test.ts` and UI coverage in `src/test/pricing-grid.test.tsx`.
- Exact-SHA CI [39186174524 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39186174524), SHA `b0fedcbec9a445aa2eef96eb2686a59a9ab14768`: 35/35 test files and 285/285 tests; PostgreSQL 17 migration/RLS acceptance; lint; build; production preview smoke 4173; dev smoke 5173 all PASS.
- Corrective iterations are retained honestly in Actions: #287 and #288 caught CSV escaping expectations; #289 caught `no-control-regex` in lint. Assertions and regex were fixed (not waived); #290 on the export-only commit succeeded; #291 on the combined import/export commit succeeded.
- Status: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact-SHA CI; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; XLSX=NOT IMPLEMENTED; INVENTORY QUANTITY COLUMNS=NOT IMPLEMENTED.
- Active task `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` remains open; next step is continued clause-by-clause spec gap closure. Archive binary fresh download / SHA-256 / CRC / safe extraction remains NOT RUN due recorded blockers.


## 2026-10-19 — إثبات أرشيفات Bolt من GitHub Actions، لا من المحاولة المحلية

- شُغّل `scripts/reconcile-bolt-recovery-archives.py` في [Action 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493) على SHA الهدف `d20c1aced5f6595b1b2a81bb017c153a260c5a0d`، مع source commit ثابت `b1ca62ec277ff9f55c8e850e0470d61d81aaa138`.
- `Nasr1_Bolt_Before_Failure.zip`: HTTP 200؛ 1,003,172 bytes؛ SHA-256 `d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365`؛ Git blob SHA-1 `7c35f3ecde19dc5596fd22053be61924ef3d5318`؛ 359 عضوًا؛ CRC/decompression/safe extraction PASS.
- `Nasr1_Bolt_Restored_Current.zip`: HTTP 200؛ 997,589 bytes؛ SHA-256 `9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214`؛ Git blob SHA-1 `f01684a56e093a33a173b0965d1d7239c48f0936`؛ 358 عضوًا؛ CRC/decompression/safe extraction PASS.
- مقارنة الملفين: 340 محتوى مطابقًا، 18 متغيرًا، عنصر واحد موجود في نسخة Before فقط؛ الإجمالي 717 عنصرًا. تدقيق `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` عدد 69 صفًا: 7 مطابقات بالبصمة، 2 اختلاف مسار/محتوى، 60 مسارًا مفقودًا وقت التدقيق. ثمانية أعضاء صنفت أمنيًا للاستبعاد. لم تُشغّل الملفات المستخرجة ولم تُطبّق SQL.
- المحاولات المباشرة في هذه المحادثة بقيت فاشلة (HTTP 400 binary / DisabledError / فشل تنزيل محلي)، ولا تستبدل هذه الأدلة بنتيجة مختلفة. تم تعديل `ARCHIVE_MANIFEST.csv` لعرض النتيجة الناجحة المنفصلة في عمود `fresh_sha256_crc_safe_extraction` مع إبقاء أخطاء المحاولة المباشرة محفوظة.

## 2026-10-19 — إكمال ربط تحليل أونكس في التقارير التنفيذية

- أضيفت `src/components/UnifiedOnyxAnalysisPanel.tsx` وربطت داخل `Reports` في `src/components/AghbariApp.tsx`؛ تعتمد على `fetchOnyxSnapshots` و`fetchOnyxSnapshotAnalytics`، مع tenant/RBAC القائمين، والتحقق من مطابقة معرّف اللقطة والقيم غير السالبة وإغلاق العرض عند خطأ المصدر.
- تعرض أثر المصدر: اسم الملف، نوع التقرير، الفترة إذا كانت مسجلة، تاريخ اللقطة، عدد الصفوف، درجة الجودة، وSHA-256، ثم إحصاءات المصدر المحفوظة. تبقى مؤشرات اللقطة مفصولة عن أرقام المبيعات الحالية للمتجر، ولا تدّعي اتصالًا حيًا بنظام Onyx أو مزامنة تلقائية.
- الاختبار المطابق [Actions 39295541831 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39295541831), SHA `58cd1f8acd627c7cb2a00e81a29b3c46581cd490`: 37/37 ملف اختبار، 300/300 اختبار؛ PostgreSQL 17/RLS، lint، build، preview وdev smoke PASS. الاختبار هنا ليس إثبات متصفح تفاعلي أو إنتاج.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.

## 2026-10-19 — شبكة الأسعار: XLSX وملخصات مخزون حقيقية للقراءة فقط

- ربطت `src/components/PricingGrid.tsx` `price-grid-xlsx.ts` للاستيراد إلى مسودة قبل الاعتماد والتصدير من صفوف الخادم المحفوظة، مع أكواد أصناف نصية للحفاظ على الأصفار البادئة. لم يُضف اعتماد مدفوع.
- يعيد `get_admin_product_price_grid_with_inventory()` مجاميع الرصيد المسجل والمحجوز والمتاح ونقطة إعادة الطلب وعدد المخازن النشطة ضمن المؤسسة المخولة؛ القراءة منفصلة عن مسار كتابة الأسعار. إذا لم توجد أرصدة مسجلة، تبقى الخانات فارغة بدل تحويل UNKNOWN إلى ZERO.
- تغطية اختبارية موجودة في `src/test/price-grid-xlsx.test.ts` و`src/test/pricing-grid.test.tsx` واختبارات PostgreSQL 17 لقبول صلاحيات القراءة/الكتابة ورفض المحاسب والكتابة العابرة للمؤسسات. CI المطابق `39295541831`، 37/37 files و300/300 tests، PASS.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.

## 2026-10-19 — المتجر: مسارات الكتالوج والتصنيفات والعروض

- أضيفت واجهات TanStack نشطة `/store`, `/catalog` (بحث/تصنيف)، `/collections` و`/offers`، مع عناوين عربية خاصة بكل مسار، وربط بياناتها إلى Storefront وتصنيفات المتجر والحملات المنشورة. لا تستخدم mock catalog أو بيانات demo.
- سجل CI قبل الإصلاح فشلًا بسبب محارف استمرار سطر shell مضاعفة حول عقود `/store`, `/catalog`, `/collections`, `/offers`; أصلحت الفواصل في `.github/workflows/commerce-checks.yml` دون حذف عقد المسارات. [Actions 39295541831](https://github.com/Report-Engainall/Nasr1/actions/runs/39295541831) على SHA `58cd1f8acd627c7cb2a00e81a29b3c46581cd490` اجتاز بعدها 37/37 files و300/300 tests وقبول قاعدة البيانات والـlint/build وpreview/dev smoke.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.

## 2026-10-19 — تصحيح سجل خصومات الحملات

- لم يعد صحيحًا اعتبار خصم Checkout غير منفّذ على HEAD الحالي. ترحيل `20261019150000_checkout_promotion_pricing_snapshots.sql` يعرّف `resolve_active_promotion_price`؛ يحدد الحملة الفعالة ضمن المؤسسة، يحسب النسبة/المبلغ، ويحد الخصم إلى الهامش فوق تكلفة الصنف. `place_order` و`preview_order_pricing` و`get_storefront_product_prices` و`review_order_lines` تستخدم السعر الفعال وتحفظ لقطات الحملة/الخصم في بنود الطلب، ويُنسخ snapshot إلى بنود الفاتورة.
- اختبار قبول قاعدة البيانات في `scripts/test-database-migrations.mjs` يتحقق من انخفاض السعر عند حملة فعالة، ثبات السعر الخام في snapshot، مطابقة الخصم والإجمالي وحظر وصول العميل إلى جدول الحملات مباشرة. هذا متحقق ضمن CI المطابق `58cd1f8acd627c7cb2a00e81a29b3c46581cd490`; لا يثبت ترحيل/نشر الإنتاج.


## 2026-10-19 — تسجيل صفحات التصنيف والبحث المتقدم وإصلاح المطابقة

- فشل CI [39297551448](https://github.com/Report-Engainall/Nasr1/actions/runs/39297551448) بعد 36/37 suites لأن اختبارين أثبتا أن شجرة TanStack لا تصل إلى صفحة البحث المتقدم ولا إلى حالة رفض التصنيف الفرعي. لم يتم إسقاط الاختبارين أو تخفيض التوقعات.
- تم تصحيح `src/routeTree.gen.ts`: صفحات التصنيف الفرعي `/category/$slug/subcategory/$subcategorySlug` والبحث المتقدم `/search/advanced` تسجلان الآن كمسارين مباشرين جذريين؛ أُزيل الاعتماد على المطابقة المتداخلة التي كانت تعرض مكوّن المسار الأب.
- رُبط رابط «بحث متقدم» في `src/components/Storefront.tsx`; رُبط المحدد `#advanced-storefront-category` في `AdvancedStorefrontSearchPage.tsx`; أضيفت اختبارات سلوك لفتح تصنيف حقيقي، رفض child لا يتبع parent، وفتح البحث المتقدم ثم تطبيق تصنيف من بيانات الاختبار إلى `/catalog`.
- أضيفت عقود HTTP/العناوين في `.github/workflows/commerce-checks.yml` للـpreview 4173 والـdev 5173؛ تم إصلاح indentation وshell continuations بعد أن فشل تشغيل سابق قبل إنشاء أي job.
- CI النهائي المطابق [39297924768 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39297924768), SHA `5c30bafe9bc5076a3acb6ca3335679462d290eb6`: **37/37 ملفات اختبار و302/302 اختبار**؛ PostgreSQL 17/migrations/RLS؛ lint؛ build؛ preview smoke؛ dev smoke PASS.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS (exact SHA 5c30bafe9bc5076a3acb6ca3335679462d290eb6); BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.
- تبقى المهمة الأشمل `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` مفتوحة. هذا السجل يغلق جزء اكتشاف الكتالوج فقط.



## 2026-10-19 — فلتر المخزون المعروف في البحث المتقدم

- أضيف إلى `src/components/Storefront.tsx` بيان مرئي عند تفعيل `available=1` وإجراء «إظهار كل الأصناف المطابقة» الذي يزيل هذا الشرط مع إبقاء نص البحث والتصنيف المحددين.
- أضيف اختبار تكاملي في `src/test/storefront-discovery.test.tsx`: يضع كمية مخزون غير صالحة/غير معروفة للصنف «Beans»، يفعّل فلتر المتوفر من صفحة البحث المتقدم، يرسل النموذج إلى الكتالوج، ويثبت أن Rice/Sugar/Oil معروضة وأن Beans محجوب؛ ثم يزيل الفلتر ويتحقق من عودة Beans.
- سجل التشغيل [39298563390](https://github.com/Report-Engainall/Nasr1/actions/runs/39298563390) كشف فشل اختبار بسبب محاكاة `change` غير كافية لمربع الاختيار؛ تم تغيير التفاعل إلى نقر checkbox الأصلي. [Actions 39298690000](https://github.com/Report-Engainall/Nasr1/actions/runs/39298690000) اختبر تعديل التسمية، ثم أثبت [Actions 39298789592 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39298789592) الإصلاح الكامل على SHA `2a002fa9062c3f4bd28c6b5c7bfcb35ba80b7926`.
- النتيجة النهائية: 37/37 test files و303/303 tests؛ PostgreSQL 17 migrations/RLS، lint، build، preview 4173 وdev 5173 PASS.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.
- حالة المهمة الأشمل: `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` OPEN.

## 2026-10-19 — NASR1-BOLT-EXEC-ANALYTICS-001 — adapted archive capability, CI PASS

- Target `Report-Engainall/Nasr1/main`; code-bearing commit [55c1d970496c69db36d01197a109a5afd7c6aa04](https://github.com/Report-Engainall/Nasr1/commit/55c1d970496c69db36d01197a109a5afd7c6aa04).
- Archive integrity evidence [Actions 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493): Before_Failure ZIP 1,003,172 bytes, 359 members; SHA-256 `d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365`; Restored_Current ZIP 997,589 bytes, 358 members; SHA-256 `9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214`. Total pair inventory: 717, with 340 identical, 18 changed and 1 Before-only. CRC/decompression/path-safety/extraction PASS; archive code not executed and archived SQL not applied.
- Decision: `fetch_staff_products` and AI-budget RPCs were already present in stronger target-native migrations; Onyx snapshot analytics already existed for import snapshots. The missing legacy store-executive analytics function was adapted to current tenant/order schema as `get_store_executive_analytics()` in `supabase/migrations/20261019210000_store_executive_analytics.sql`, with strict typed parser, route-connected Reports UI and tests. The unsafe legacy migration was not copied; it used old-schema assumptions and `DROP ... CASCADE`.
- Exact code CI [39303848194 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39303848194), SHA `55c1d970496c69db36d01197a109a5afd7c6aa04`: 38/38 test files, 307/307 tests; frozen Bun lock check, unit tests, isolated PostgreSQL 17 migrations/RLS acceptance, lint, build, production preview smoke 4173, dev smoke 5173 all PASS.
- Implemented/integrated/tested = YES. Interactive browser proof = NOT RUN. Production migration and production runtime proof = NOT RUN. No new dependency or paid provider. See `ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md`, `ARCHIVE_MEMBERS.csv` and this ledger for per-member decision.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-PURCHASING-RECEIVING-008 — purchase lifecycle implemented, exact-SHA CI PASS

- Target stayed on `Report-Engainall/Nasr1/main`; code-bearing commit [`2986f59c3350f313eaa53b529a7507da47192773`](https://github.com/Report-Engainall/Nasr1/commit/2986f59c3350f313eaa53b529a7507da47192773).
- Added `supabase/migrations/20261019230000_purchase_orders_and_receiving.sql`: tenant-bound purchase orders/order lines/receipts/receipt lines, RPC-only table access, active supplier/warehouse/product checks, idempotency fingerprint conflict rejection, unknown costs represented as NULL, cancellation reason + audit, atomic partial/full stock posting with inventory movements, and one idempotent warehouse task from the persisted purchase-order state transition.
- Added `src/lib/purchase-orders.ts` strict payload parser and tests; `src/lib/api.ts` create/list/submit/cancel/receive RPC wrappers; `src/components/PurchaseOrdersPage.tsx`; route `/admin/purchase-orders`; admin navigation; smoke route-title contracts; `TaskCenter.tsx` purchasing-entity label; PostgreSQL integration acceptance.
- Real-database assertions proved: repeated create with same payload returns same order; reused key with changed payload rejected; missing cost stays NULL; over-receipt rejected without stock change; partial receipt updates inventory once; replay doesn't duplicate movement/quantity; final receipt completes order and closes one warehouse task; manager access uses the authorized RPC; ordinary customer cannot call the inbox RPC or SELECT purchase tables directly. Regression assertion for later order shipment now accounts for the two physically received units in the same product/warehouse rather than hard-coding the pre-receipt balance.
- CI: [Actions 39309895500 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39309895500), exact SHA `2986f59c3350f313eaa53b529a7507da47192773`: **41/41 test files, 317/317 tests**, frozen Bun lock verification, PostgreSQL 17 migrations/RLS/workflow acceptance, lint, build, production preview smoke on 4173, dev smoke on 5173 all PASS.
- Earlier failures were retained and fixed, not bypassed: outdated UI copy assertion; unauthorized direct-table check accidentally executed under authenticated role after customer-denial test; then stock-shipment expected quantity was updated to account for the newly committed physical receipt. Latest exact SHA is green.
- Evidence levels: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN (no live authenticated browser session; CI smoke only); PRODUCTION-PROVEN=NOT RUN; production migration=NOT RUN. No new dependency or paid service. Details: `ORIGINAL_SPEC_FEATURE_INTEGRATION_2026-10-19.md`.
- Parent task `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` remains OPEN; the purchase workflow is one concrete gap closed, not full project completion.

## 2026-10-19 — NASR1-ORIGINAL-SPEC-ACCOUNTING-GENERAL-LEDGER-003 — CI PASS exact SHA

- Main remained unchanged at `0c089585d27665680dcc4ad2520dd4affc875804`; isolated branch `feature/accounting-general-ledger-20261019`, PR [#4](https://github.com/Report-Engainall/Nasr1/pull/4).
- Code SHA [`190497591d6451ca69d26da41034a3e5558fd58f`](https://github.com/Report-Engainall/Nasr1/commit/190497591d6451ca69d26da41034a3e5558fd58f) passed exact-SHA CI [39314610222](https://github.com/Report-Engainall/Nasr1/actions/runs/39314610222).
- Results: 42/42 test files, 330/330 tests; PostgreSQL 17 migration and acceptance suite; lint; build; production preview smoke (4173); dev smoke (5173). The new DB acceptance printed PASS for chart idempotency, two-decimal money, balanced draft/post, replay safety, manager-only draft cancellation, audit events, trial-balance totals, tenant scoping and role/customer denials.
- Earlier CI failures were diagnosed from their actual logs and fixed: (1) summary counted journal lines, not distinct entries; changed to count distinct entry IDs. (2) missing closing `$$` in the void function, caused by a JS replacement string treating `$$` as `$`; corrected the terminator and re-ran PostgreSQL 17. (3) audit assertion ran under accountant role; test now queries audit events while the manager identity is active, keeping RLS narrow.
- Active implementation comprises `supabase/migrations/20261020010000_accounting_general_ledger.sql`, `src/lib/general-ledger.ts`, `src/components/GeneralLedgerWorkspace.tsx`, the active finance workspace integration, Vitest tests and database acceptance. The unit is target-native; no donor React Router screens or legacy SQL were copied.
- Safety: no historical balances/entries were generated. Automatic ledger posting from future invoices, payments, cash expenses, purchase receipts or Onyx data was not claimed; source-event integration/reconciliation is a follow-up.
- Status: IMPLEMENTED=YES; INTEGRATED=YES on PR branch; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; production migration=NOT RUN. Parent task `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` remains OPEN.



## 2026-10-19 — NASR1-BOLT-ARCHIVE-DELTA-001 — CLOSED

- Reused original ZIP integrity evidence in Action 39294387493; archive bytes were not downloaded, rehashed, CRC-checked, extracted, or re-enumerated again.
- Resolved the 160 pending decision rows (122 changed-content / 64 unique paths and 38 missing-candidate / 19 unique paths). All 717 rows now have target decisions: 548 ALREADY_PRESENT_EXACT, 8 EXCLUDED_SECURITY, 1 prior ADAPT_AND_INTEGRATE, 87 ALREADY_PRESENT_BETTER, 33 KEEP_AS_REFERENCE, 40 INCOMPATIBLE_WITH_EVIDENCE. Pending review count is 0. See ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md and ARCHIVE_MEMBERS.csv.
- Saved the restored master Arabic requirement specification at docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt. Legacy archive tests/execution are NOT RUN; no legacy SQL applied; browser and production proof NOT RUN.

## 2026-10-19 — NASR1-ORIGINAL-SPEC-FINANCIAL-STATEMENTS-003 — PASS exact SHA

- Initial implementation SHA 78cd809a4ce1d6486dfc2ea48219dc435bb3346d failed Action 39319700563: 3 test assertions failed (date error-message regex, duplicate correct amount, brittle access-denial assertion). This failure remains recorded.
- Intermediate commit 436806f9b221f884af859f0c37c6268494e462fe failed Action 39320053536 while those test-only assertion fixes had not yet been added.
- Test corrections landed in 869f0909bda0524275834952f64e1ce1609e79c0. Exact-SHA Action 39320266809 passed: 44/44 files, 336/336 tests; frozen Bun lock verification; PostgreSQL 17 migration/acceptance; lint; build; preview 4173 and dev 5173 smoke.
- Code: src/lib/financial-statements.ts and src/components/GeneralLedgerWorkspace.tsx. Tests: src/test/financial-statements.test.ts and src/test/general-ledger-statements-ui.test.tsx. Tests not run locally; browser/prod checks NOT RUN. main is still 0c089585d27665680dcc4ad2520dd4affc875804; PR #4 only. Next task NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004 — cash expense journals integrated

- Code SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b` passed [Actions 39321543032](https://github.com/Report-Engainall/Nasr1/actions/runs/39321543032): 45/45 Vitest files, 339/339 tests, frozen Bun lock, migration + repo-level DB acceptance on PostgreSQL 17, lint, build, production-preview smoke 4173 and dev smoke 5173.
- This current exact commit adds the target-native migration `20261020020000_accounting_source_posting.sql`, UI component `CashExpenseJournalLinker.tsx`, integration into `GeneralLedgerWorkspace.tsx`, and UI tests. Source amount/date/currency are read from a real source row under tenant/finance-role authorization. Explicit active same-org expense and asset accounts are required. New journal is draft-only until a user explicitly posts; repeats resolve to the existing equivalent source journal or reject mapping conflict. FX currencies are blocked until a documented policy exists.
- Trigger guard rejects posting if the linked source is void/changed or journal lines mismatch. Voiding source with a linked draft voids that draft; voiding source with a posted source journal writes a balanced reversal transaction, preserves history and audits the action. Concurrency patch removes source-row lock from a journal-first posting trigger; it was included in the exact SHA above.
- The first execution SHA `191290f8aaebf60715d1bb42c8b9eda394145b0a` was run as Action 39321342608 — SUCCESS. A test-selector refinement was added at `cfc374eb00c481657ab959df8a3a1097d9036caf`, Action 39321447496 — SUCCESS. The lock-order hardening was added at final tested SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b`, Action 39321543032 — SUCCESS. No prior failure is erased; financial-statement assertion failures on earlier SHAs are separately documented above.
- Important test boundary: new UI path has Vitest coverage; migration applies and overall Postgres 17 acceptance passed. A dedicated database workflow test of the new create/post/reversal triggers has NOT RUN because `scripts/test-database-migrations.mjs` is protected and currently owned by P1's PR #3. Record a coordination request before touching it; do not imply it was covered by generic migration acceptance.
- Browser, production migration/deployment and real authenticated finance-account proof: NOT RUN. Main remains unchanged. Next ID `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006`.


## 2026-10-20 — P2 task 006: invoice/payment source posting and reversal acceptance

- Exact forward-integrated code SHA `dec9026ef5c1f2c894774f8b68933df5e2dfe01b` passed [Action 39336158916](https://github.com/Report-Engainall/Nasr1/actions/runs/39336158916): unit tests, PostgreSQL 17 migrations/acceptance, lint/build, preview 4173 and dev 5173 smoke.
- Pre-forward feature SHA `f7526eeb075ba95fe8cd1455d25b48d76b3cafe7` passed Action 39335571027; that action did not include latest-main forward integration.
- Retained failure: Action 39335294442 / SHA `fc62a8bb0f38e0eb6ec97c3ae878fec69635f17b`, acceptance readback expected `posted` but got `undefined` because it assumed the source was on the first 50-row page. Fixed using bounded pagination for invoice and payment inbox readback.
- Changed code: accounting migration, new source-linker component, General Ledger registration, component tests and PostgreSQL acceptance. No donor or P1-owned ledger/report modified.
- Production migration, live tenant and browser/manual E2E: **NOT RUN**.
- Next: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-VISIBILITY-007`.