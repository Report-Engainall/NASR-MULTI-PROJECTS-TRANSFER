# تكامل ميزة من المواصفة الأصلية — أوامر الشراء والاستلام

**الحالة الحالية:** IMPLEMENTED + INTEGRATED + TESTED (exact-SHA CI PASS). هذه ميزة مقتبسة من وثيقة مواصفات المتجر، لا من ملفات ZIP، ولا يعني إنجازها إكمال المواصفة كلها.

## واجهات / API

- `/admin/purchase-orders` تعرض أوامر الشراء المحفوظة من المؤسسة الحالية، مع فلتر حالة وطباعة، وتتيح إنشاء مسودة من مورد ومخزن وأصناف فعلية.
- أوامر الإدارة: `create_purchase_order`, `submit_purchase_order`, `cancel_purchase_order`, `receive_purchase_order`, `fetch_purchase_orders`.
- واجهة React/API تتصل مباشرة بـRPC المخولة وتتحقق من الرد والأرقام وحالة الكمية؛ لا تُعرض مسودة أو إيصال كأنه نجاح قبل رد الخادم.

## حدود السلامة والمال

- هوية المنفذ والمؤسسة مشتقة في PostgreSQL من الجلسة والملف النشط، لا من org id مرسل من المتصفح؛ الإدارة للـadmin/manager وفق RBAC المتاح حاليًا.
- جداول أوامر الشراء والإيصالات RPC-only بالنسبة إلى `authenticated`; العميل العادي لا يستطيع تنفيذ RPC أو قراءة جداول الشراء مباشرة.
- إنشاء أمر شراء أو اعتماده لا يغيّر المخزون ولا يرسل رسالة للمورد تلقائيًا.
- إيصال مادي بكمية معتمدة هو وحده الذي يحدّث الرصيد؛ ترحيل الحركة وسجل الإيصال يتّحدان في معاملة. يوجد تحقق من الكمية المطلوبة، الكمية المستلمة والمتبقي.
- مفاتيح idempotency مربوطة ببصمة الحمولة: replay مطابق آمن، وإعادة استخدام المفتاح ببيانات مختلفة مرفوضة. تكلفة الوحدة/الإجمالي غير المعروف يبقى `NULL`؛ لا يُحوّل إلى صفر.
- الأحداث تغيّر مركز المهام: مهمة استلام واحدة لكل أمر شراء عبر `source_event_key`, تتحدث idempotently وتُغلق بعد الاستلام الكامل أو الإلغاء. الأوامر والإيصالات تسجل أحداث التدقيق وحركات المخزون.

## ملفات التنفيذ

- `supabase/migrations/20261019230000_purchase_orders_and_receiving.sql`
- `src/lib/purchase-orders.ts`
- `src/lib/api.ts`
- `src/components/PurchaseOrdersPage.tsx`
- `src/routes/admin_.purchase-orders.tsx`
- `src/components/AghbariApp.tsx`
- `src/components/TaskCenter.tsx`
- `src/test/purchase-orders.test.ts`
- `src/test/purchase-orders-page.test.tsx`
- `scripts/test-database-migrations.mjs`
- `.github/workflows/commerce-checks.yml`

## دليل الاختبار

[GitHub Actions 39309895500 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39309895500) على SHA exact `2986f59c3350f313eaa53b529a7507da47192773`.

- Vitest: 41/41 ملفات و317/317 اختبار.
- PostgreSQL 17: جميع migrations وقبول RLS/الدورات التشغيلية، وتشمل أمر شراء متكرر بنفس المفتاح، تعارض الحمولة، تكلفة غير معروفة، رفض زيادة الاستلام، استلام جزئي، replay بلا مضاعفة المخزون، استلام كامل، حركات مخزون وسجل تدقيق، إنشاء/إغلاق مهمة مخزن واحدة، ورفض العميل من RPC والجداول.
- Lint: PASS.
- Build: PASS.
- Production preview smoke على 4173: PASS.
- Dev server smoke على 5173: PASS.

## ما لم يثبت بعد

- `BROWSER-PROVEN=NOT RUN`: لم يُنفذ اختبار تفاعلي بجلسة متصفح حقيقية.
- `PRODUCTION-PROVEN=NOT RUN`: لم يُنشر الترحيل على قاعدة إنتاج أو يثبت التشغيل الحي.
- الاعتماد داخلي، لا يوجد اتصال رسمي لإرسال بريد/رسالة إلى المورد؛ الواجهة تعرض ذلك صراحة.
- دورة أمر الشراء لا تضيف موردين أو أصنافًا وهمية ولا تولد فواتير تاريخية.
- `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` ما زالت مفتوحة لاستكمال الواجهات الأخرى في المواصفة.


## دفتر الأستاذ العام والقيود المزدوجة — 19 أكتوبر 2026

- التنفيذ على الفرع المعزول ضمن PR #4: دليل حسابات للمؤسسة، وقيود مزدوجة draft/post/void، وترحيل صريح، وإلغاء مسبب للمسودة فقط مع احتفاظ السجل.
- الترحيل: `supabase/migrations/20261020010000_accounting_general_ledger.sql`; الواجهة: `src/components/GeneralLedgerWorkspace.tsx`; تحقق الأموال/القيود: `src/lib/general-ledger.ts`.
- ضمانات: المبالغ تُتحقق على الخادم بدقتين عشريتين، كل سطر إما مدين أو دائن، مجموعا القيد متساويان وموجبان، الحسابات نشطة وضمن المؤسسة؛ مفاتيح idempotency تمنع التكرار وتكشف تعارض الحمولة. منع DML المباشر للعميل، وتدقيق الإنشاء والترحيل والإلغاء، ودفتر وميزان مراجعة من القيود المرحلة الفعلية فقط.
- CI: [Actions 39314610222 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39314610222), exact SHA `190497591d6451ca69d26da41034a3e5558fd58f`; 42/42 ملفات و330/330 اختبار؛ PostgreSQL 17، lint، build، preview 4173، dev 5173 PASS.
- الإثبات: IMPLEMENTED=YES; INTEGRATED=YES على فرع PR؛ TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; production migration=NOT RUN.
- غير مشمول: إنشاء قيود تلقائية مستقبلية من الفواتير والدفعات والمصروفات والاستلام وOnyx أو إجراء مطابقة مصدرية. لا توجد أرصدة أو فواتير تاريخية مصطنعة. المهمة الأشمل `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` ما تزال مفتوحة.


## Income statement and balance sheet — exact-SHA CI PASS

- Added a finance-role and tenant-scoped read path to the current GeneralLedgerWorkspace, reusing fetch_general_ledger for the date range and cumulative as-of cutoff. Period revenue/expense and cumulative assets/liabilities/equity remain distinct; calculations use BigInt minor units and visibly report a balance-equation difference.
- Unit tests cover monetary accuracy, invalid dates/money, duplicates, imbalance, empty data and role-aware UI access. No historical transactions were synthesized.
- Exact code SHA 869f0909bda0524275834952f64e1ce1609e79c0 passed Action 39320266809: 44/44 test files, 336/336 tests, PostgreSQL 17 migrations/acceptance, lint, build, preview smoke 4173 and dev smoke 5173.
- IMPLEMENTED=YES; INTEGRATED=YES in PR #4; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; PRODUCTION_MIGRATION=NOT RUN. Reports include posted ledger entries only; source-document posting is next, not yet implemented.


## Cash-expense source posting — 19 October 2026, exact-SHA PASS

- Added tenant-scoped links between real `cash_expenses` and original/reversal journal entries; an authorized queue; source-amount/date-derived draft generation; explicit account selection; source/event idempotency; and auditing. No legacy SQL from Bolt was used.
- A source posting remains a draft until explicitly posted. Non-YER sources are rejected instead of silently converted. Source void is consistent with ledger state: void draft, or post a counter-entry for an already posted source journal.
- Exact SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b` passed Action 39321543032 (45/45 test files, 339/339 tests, PostgreSQL 17 migration/acceptance, lint, build, preview/dev smoke). Flow-specific DB trigger tests remain NOT RUN due the harness ownership lock; overall migration application is not the same as a direct behavior test.
- Browser/live tenant and production proofs remain NOT RUN. Next `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006`.
