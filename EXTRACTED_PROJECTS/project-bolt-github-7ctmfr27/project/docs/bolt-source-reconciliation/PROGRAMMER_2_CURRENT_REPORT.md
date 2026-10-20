# تقرير الاستئناف — المبرمج 2 / Bolt archive ثم المواصفة

المستودع الهدف الوحيد: Report-Engainall/Nasr1.  
task الحالي الوحيد: NASR1-BOLT-ARCHIVE-DELTA-001.  
task التالي بعده مباشرة: NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 (الحالة الحية هي المرجع إذا تغير HEAD/المواصفة).

## دليل أرشيف Bolt المثبت — لا يعاد
- المصدر: https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17
- Action التحقق: [39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493). هدف تاريخي SHA d20c1aced5f6595b1b2a81bb017c153a260c5a0d، مصدر مثبت b1ca62ec277ff9f55c8e850e0470d61d81aaa138.
- Before_Failure ZIP: 1,003,172 bytes؛ SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365؛ 359 عضوًا.
- Restored_Current ZIP: 997,589 bytes؛ SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214؛ 358 عضوًا.
- المقارنة: 717 عضوًا مجموعًا، 340 مطابقًا، 18 متغيرًا، عضو واحد Before-only؛ تنزيل/سلامة CRC/فحص المسارات الآمنة/الاستخراج المؤقت اجتازت الاختبار السابق.
- commit ميزة التحليل الناقصة: [55c1d970496c69db36d01197a109a5afd7c6aa04](https://github.com/Report-Engainall/Nasr1/commit/55c1d970496c69db36d01197a109a5afd7c6aa04); CI [39303848194 PASS](https://github.com/Report-Engainall/Nasr1/actions/runs/39303848194) على SHA المطابق. `get_store_executive_analytics` تم تكييفه إلى نموذج Nasr1؛ ثلاث RPCs أخرى كانت موجودة بالفعل بتنفيذ target-native أفضل.

## العمل الحالي
- افتح ARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md واستعمل البصمات/القرارات المسجلة. لا تعِد تنزيل ZIPs أو استخراجها أو إعادة حساب SHA/CRC أو إعادة تعداد جميع الأعضاء.
- راجع فقط rows الموسومة CHANGED / BEFORE_ONLY / PENDING أو التي لا تملك قرارًا مبرهنًا. إذا لم تحمل المصفوفة الدليل الدلالي اللازم، عالج عنصرًا واحدًا محددًا فقط من المادة التي سبق استخراجها؛ لا تعِد عملية الزوج كاملة. قارن كل اختلاف بالكود الحالي، ثم سجّل ALREADY_PRESENT_BETTER أو ADAPT_AND_INTEGRATE أو EXCLUDED_SECURITY أو INCOMPATIBLE_WITH_EVIDENCE مع path/source blob/tests/decision.
- تحقق من current HEAD/PR/CI metadata؛ لا تعتبر نجاحًا على SHA تاريخي نجاحًا للرأس الحالي. لا تحرر كود/مسار في PR يعمل عليه المبرمج 1. اقفل المسار عبر WORK_COORDINATION أو اعمل في ملفات مستقلة.

## الانتقال الإلزامي إلى المواصفة
عند إثبات حسم اختلافات الأرشيف، حدّث سجل الأرشيف، ثم تابع فورًا NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 من CURRENT_EXECUTION_STATE.md، دون توقف أو طلب موافقة. أكمل الواجهات والوظائف غير المنجزة تدريجيًا: كود/خدمة/DB/RLS/route/اختبار؛ لا mock/demo أو زر شكلي، ولا أرصدة وهمية ولا خدمات مدفوعة. لا تدّع Onyx/WhatsApp/production/browser proof دون اختبار مباشر.

## ملكية السجلات
هذا التقرير لك وحدك. أنت وحدك تعدل WORK_COORDINATION.md وCURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md. لا تعدل SOURCE_INTEGRATION_LEDGER.csv أو READY_TO_REUSE_FILE_AUDIT.csv أو تقرير المبرمج 1.

## الاختبار والتسليم
كل تعديل يحتاج unit/integration/DB/security المناسب وCI على SHA نفسه. غير المشغل NOT RUN. لا تحذف الفشل السابق؛ أضف إصلاحًا بدليل. احفظ commit/PR ورابط CI والمسارات والبصمات والنتائج، وحدّث next_task_id واحدًا فقط.


## Latest execution — 2026-10-19

- Archive decision task NASR1-BOLT-ARCHIVE-DELTA-001 is CLOSED. All 717 member rows are decided; 160 former review rows resolved across 83 unique target paths. ZIP files were not re-downloaded/rehashed; original integrity evidence remains Action 39294387493.
- Saved the restored Arabic master specification to docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt.
- Implemented ledger-derived income statement and cumulative balance sheet inside GeneralLedgerWorkspace using the already authorized tenant-scoped RPC. No fabricated opening balances or historical entries.
- Initial tests failed with 3 assertions on SHA 78cd809a4ce1d6486dfc2ea48219dc435bb3346d; failures are retained in EXECUTION_LOG. Test-only corrections passed exact-SHA Action 39320266809 on 869f0909bda0524275834952f64e1ce1609e79c0: 44/44 test files, 336/336 tests, PostgreSQL 17 migrations/acceptance, lint, build, preview/dev smoke PASS.
- Main remains at 0c089585d27665680dcc4ad2520dd4affc875804; PR #4 remains open; P1 PR #3 and owned files untouched. Browser proof and production migration/deployment proof NOT RUN.
- Parent task NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 remains open. Current next_task_id = NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004. Next: create target-native, idempotent cash-expense source journal drafts with explicit expense/settlement account selection and source-void/posting consistency guards.


## Latest task outcome — 2026-10-19

- `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004`: target-native cash-expense source linkage added in P2 PR #4. Code SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b`, Action 39321543032 PASS: 45/45 tests files, 339/339 tests, PostgreSQL 17 migrations/repo-level DB acceptance, lint, build, preview/dev smoke.
- The linker reads real tenant-scoped expenses, demands explicit active expense + asset mapping, derives monetary value/date from source, creates only a draft until explicit posting, rejects unconfigured FX, protects against source modification and atomically handles source void via draft void or reversal journal.
- Exact CI proves migration application and full existing acceptance, but new-flow-specific DB behavior assertions are `NOT RUN`: `scripts/test-database-migrations.mjs` is currently P1-locked. A coordination request is recorded. Browser and production proof `NOT RUN`.
- Branch `feature/accounting-general-ledger-20261019`; PR #4 open. Main has not been modified. Archive task remains closed, original spec parent remains OPEN.
- `next_task_id = NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006` under `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`.


## Latest execution — 2026-10-20 (P2; source-linked customer accounting)

- Closed `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006` in code and acceptance tests.
- Migration: `supabase/migrations/20261020030000_accounting_customer_source_posting.sql`.
- UI: `src/components/CustomerInvoicePaymentJournalLinker.tsx`, registered in `GeneralLedgerWorkspace`; unit tests are in `src/test/customer-invoice-payment-journal-linker.test.tsx`; PostgreSQL acceptance is in `scripts/test-database-migrations.mjs`.
- Safety: invoice totals/tax derive from saved source; payment AR is inherited from the posted invoice journal; FX is rejected until policy exists; source edits/deletes are guarded; manager/admin reversal requires an audit reason, generates exact opposite debit/credit lines, and posts separately. It does not issue a cash refund.
- Feature SHA `f7526eeb075ba95fe8cd1455d25b48d76b3cafe7` passed [Action 39335571027](https://github.com/Report-Engainall/Nasr1/actions/runs/39335571027).
- Forward-merge commit `dec9026ef5c1f2c894774f8b68933df5e2dfe01b` has parents P2 `f7526eeb...` and main `f7cffd41...`; it passed [Action 39336158916](https://github.com/Report-Engainall/Nasr1/actions/runs/39336158916).
- Failures retained: Action 39326813015 (stale error-message expectations) and 39335294442 (inbox page-one assumption). Corrections target the tests/readback only; guards and permission checks were not weakened.
- PR #6 is the delivery route; no direct write to main. Browser/live tenant/production proof: **NOT RUN**.
- `next_task_id = NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-VISIBILITY-007`.