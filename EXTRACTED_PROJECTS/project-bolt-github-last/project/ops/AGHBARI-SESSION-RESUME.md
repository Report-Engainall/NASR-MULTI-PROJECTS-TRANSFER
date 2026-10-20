# AGHBARI SESSION RESUME — اقرأ هذا أولًا بعد أي انقطاع

هذا ملف الاستئناف التشغيلي المرجعي. عندما يكون وكيل التنفيذ متصلًا بالمستودع، يقرأه ويطبقه مباشرة؛ لا يطلب من المالك نسخه أو إعادة إرسال المواصفات. رسالة الإقلاع المختصرة أدناه هي بديل فقط عندما لا تستطيع المنصة الوصول إلى تعليمات المستودع.

## بروتوكول الاستئناف الإلزامي

1. في بداية الجلسة نفّذ `git fetch origin`، ثم افحص `git status --short --branch` والفرع و`HEAD` المحلي و`origin/main` وآخر commit ونتيجة GitHub Actions المطابقة لـ SHA الحالي.
2. اقرأ هذه الحالة ثم خذ `next_task_id` من `ops/AGHBARI-LATEST-EXECUTION-STATE.md`، وافتح صف المتطلب ذي المعرّف نفسه في سجل المتطلبات. لا تعتمد SHA قديمًا كرأس حالي.
3. لا تكرر الاستكشاف الشامل، ولا تعِد سرد المواصفة، ولا تطلب ملفًا/تعليمات محفوظة. لا تفتح `DONE_VERIFIED` إلا بسبب اختلاف SHA مؤثر، أو تغيّر اعتماد/مدخل، أو regression/ثغرة، أو فشل دليل ذي صلة.
4. نفّذ أصغر دفعة مترابطة، اختبرها فعليًا، أصلح الفشل، ثم حدّث ملفات الحالة وسجل المتطلبات الموجودة نفسها: الملفات المتغيرة، أوامر الاختبار ونتائجها، SHA المختبر، المهمة التالية والعائق بدليله.
5. ادفع بأمان إلى `origin/main` بعد نجاح التحقق، ثم اقرأ HEAD البعيد وCI لذلك الـ SHA نفسه. لا تنقل PASS بين SHAs. توثّق وثائق Lovable الرسمية أن `AGENTS.md` في جذر المستودع يُقرأ دائمًا بواسطة وكيل Lovable: https://docs.lovable.dev/features/knowledge. هذا يوفر تعليمات دائمة مجانًا؛ لكن تحقق من مزامنة SHA الحالي في المحرر بصورة منفصلة، فمجرد push ليس دليل مزامنة.
6. إذا تعذر الـ checkout المحلي، لا تدّعِ أن `git status` أو `git fetch` نجحا؛ استخدم بيانات GitHub المتاحة، وسجّل صراحة ما لم يمكن فحصه ثم تابع بأمان.

المراجع المعتمدة: `PROJECT_MEMORY.md`، هذا الملف، `ops/AGHBARI-LATEST-EXECUTION-STATE.md`، `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`، `docs/canonical/AGHBARI-EXECUTION-MANDATE.md`، و`docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`.


## Current resume checkpoint — remote state reconciled (2026-10-15)

- **Latest verified remote state SHA before this correction:** `7585fd02e394fe6db464e3aa2f83303c8ed939c8`, exact Actions [38772980004](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38772980004) **SUCCESS**. Product code SHA `8e5b706f0f3b17bbef2e5fd62aa96af823bd3b64` passed [38771897585](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771897585). This correction is a new SHA; verify its own run. Lovable hosting serves published snapshots; after code/editor sync, the live site must be republished using **Publish → Publish changes**. This remains externally unverified because the available browser profile is not signed in.
- **Exact tested PR heads since the prior saved checkpoint:** PR #41 `81ef31247c434ba2381180e81924e7e8d135d14e`, [CI 38761146295](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38761146295) **SUCCESS**; PR #42 `328c367e3947992b93d1bacc0664f4567844d67f`, [CI 38761721452](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38761721452) **SUCCESS**; PR #43 fix head `a21d138f648c3a50b2bb84e10559bb105c5a162b`, [CI 38763521249](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38763521249) **SUCCESS**. These are PR-head checks, not proof for merge SHA `39d2dec...`.
- **Exact-SHA check:** main code SHA `8e5b706f0f3b17bbef2e5fd62aa96af823bd3b64` has exact Actions run `38771897585` **SUCCESS**. Older unverified merge-sha notes above are historical; do not transfer status between SHAs.
- **Live next task:** read `next_task_id` only from `ops/AGHBARI-LATEST-EXECUTION-STATE.md`; current value is `AGH-SEC-BROWSER-E2E-001`. API/RPC/export price-channel source review is complete for inspected catalog, quote, reorder, barcode, assistant, cache, finance-PDF and Onyx paths; `AGH-PRICE-PRIVACY-001` remains PARTIAL until authenticated live-browser and production proof. Published finance/PWA deep routes still return 404. The default browser profile has no saved sign-in for the app; do not start authenticated automation or sign-in setup without user confirmation.
- **`blocked_task_id = AGH-EXT-SUPABASE-001`.** The intended project ref `ffxxjaolfntzbapmfbuv` was last verified inaccessible; do not use the different `mrcyqezbhpncuvaehwgf` project as a substitute.
- Root `AGENTS.md` and `.github/copilot-instructions.md` are present remotely. Official Lovable docs confirm root `AGENTS.md` is read automatically (https://docs.lovable.dev/features/knowledge, FAQ lines 330–334). This is verified loader behavior only; live editor/deployment synchronization remains **UNVERIFIED**.
- No local checkout is mounted here. Remote GitHub ref/blob/API evidence was used; local `git fetch`, `git status`, local branch and local `HEAD` were **not run**. Never report those local commands as successful.


## الحالة المرجعية المحفوظة
- المشروع الوحيد: متجر الأغبري | Aghbari Commerce.
- المستودع: https://github.com/Aghbari-Technologies/aghbari-commerce-evolved
- الفرع المعتمد: `main`.
- محرر Lovable المكتوب في README: https://lovable.dev/projects/851f6f5c-d23d-45a6-9568-1452d5cfdd73
- المعاينة العامة: https://aghbari-commerce-evolved.lovable.app
- تعليمات التنفيذ: `docs/canonical/AGHBARI-EXECUTION-MANDATE.md`.
- المواصفة الهندسية الكاملة التي أرسلها المالك: `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md` (نص محفوظ كاملًا).
- سجل المتطلبات الوحيد: `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`.
- ذاكرة المشروع: `PROJECT_MEMORY.md`.
- سجل الحالة والتقدم: `ops/AGHBARI-LATEST-EXECUTION-STATE.md` و`ops/AGHBARI-DEVELOPMENT-PROGRESS.md`.

## رسالة الإقلاع الجاهزة

واصل من نقطة التوقف المحفوظة في `ops/AGHBARI-LATEST-EXECUTION-STATE.md`. تحقّق من `origin/main` وHEAD وCI المطابق، اقرأ `AGENTS.md` والمراجع المعتمدة، ثم نفّذ `next_task_id` مباشرة. لا تعِد الاستكشاف أو التقرير السابق ولا تطلب تعليمات محفوظة. نفّذ: INSPECT CURRENT STATE → RESUME NEXT OPEN TASK → IMPLEMENT → TEST → FIX → VERIFY → COMMIT → PUSH MAIN → SYNC LOVABLE. حدّث سجل المتطلبات والحالة بعد الدفعة، ولا تدّعِ نجاحًا بلا دليل exact-SHA.

## آخر حالة مثبتة وقت إنشاء هذا الملف
- `main` عند بدء الدفعة التوثيقية الأولى كان `05fcacbf4ddb6bfd025ab4b1fee7c144a44d4459` ثم دُفعت ملفات الذاكرة برسالة commit `971a49d75b546ccba0a05d8829c8d9c38cae085a`. افحص HEAD الحي؛ لا تعتبر أي SHA في هذا الملف هو HEAD الحالي تلقائيًا.
- CI على `f75dcb7fd3f4a598b2acf6db6d649e0f54c92fac` نجح: https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38687301037
- CI على `05fcacbf4ddb6bfd025ab4b1fee7c144a44d4459` اكتمل بنجاح: https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38687685412. كان CI على `971a49d75b546ccba0a05d8829c8d9c38cae085a` قيد التنفيذ عند آخر فحص: https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38687897943 — تحقق من CI المطابق لأحدث HEAD.
- في الفحص الحي العام، الصفحة الرئيسية و`/login` و`/admin` و`/orders` أعادت محتوى الأغبري، بينما عناوين `/admin/operations` و`/admin/products` و`/admin/orders` و`/admin/finance` و`/assistant` و`/barcode` و`/offline` و`/manifest.webmanifest` رجعت أخطاء 404 من أداة الفحص الخارجي. هذا مؤشر يحتاج إعادة تحقق من المتصفح/الخادم، وليس وحده حكمًا نهائيًا على كل جلسات التطبيق.
- طلب محرر Lovable الخاص رجع 403 للفحص الخارجي؛ المزامنة الدقيقة مع المحرر غير مثبتة. ادعم الاستنتاج بالأدلة ولا تنشئ نجاحًا مفترضًا.
- Supabase المرجعي في إعداد الكود هو `ffxxjaolfntzbapmfbuv`؛ اتصال Supabase الحالي لم يثبت إمكانية الوصول إليه. لا تلمس مشروع Supabase مختلفًا.

## عند الاستئناف
1. افحص HEAD والـ CI الحاليين فقط، واحتفظ بأي commits أحدث من الحالة المسجلة.
2. افتح سجل الفجوات وخذ أعلى بوابة قابلة للإغلاق دون اعتماد خارجي.
3. أصلح المصدر واختبره قبل push؛ لا تدفع تغييرات غير مختبرة إن كان بالإمكان إجراء CI أولًا، ولا تجبر main.
4. بعد الدفع انتظر نتيجة CI عبر فحص مباشر، ثم سجّل الـ SHA والنتيجة.
5. افحص مزامنة Lovable بشكل مستقل. إذا بقيت محجوبة بـ 403، سجّلها BLOCKED ولا تستهلك نقطة بلا فائدة.


## Newest verified implementation checkpoint — 2026-10-15
- Code SHA tested: `6112b24c2807fbb013b9fcd2d38c889631286a7c`.
- CI [38688167670](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38688167670) completed **SUCCESS**: unit tests, isolated PostgreSQL acceptance, lint, build, and expanded route/PWA smoke.
- An XLSX draft exporter was added to approved order details. Keep it classified PARTIAL until the actual Onyx import profile is tested and a central export audit event is recorded.
- Production Supabase and Lovable runtime remain blocked/unverified; do not apply migrations to a different Supabase project and do not spend Lovable points on speculative prompts. The public deep-route/PWA 404 and Lovable editor 403 are documented in latest state/progress.
- Always verify current HEAD after any documentation follow-up commit; the code-proof SHA above is not automatically the current HEAD.

## Latest security checkpoint — 2026-10-15 (supersedes earlier fixed-ID status)

- Current code merge recorded before this documentation update: `fe22af0424947b56ae80e0679621cf0df333e284`; PR #26 is merged: https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/26
- Exact tested PR head `c117b0eee5b19411c1fa3bf5162dbef1e939455f`: CI [38689077672](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38689077672) **PASS**. Exact merge SHA `fe22af0424947b56ae80e0679621cf0df333e284`: CI [38689238295](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38689238295) **PASS**.
- Files changed: `src/lib/supabase.ts`, `src/lib/api.ts`, `src/components/CustomerWorkflows.tsx`, `src/components/AdminPages.tsx`, `supabase/migrations/20261015090000_server_derived_tenant_context.sql`, `scripts/test-database-migrations.mjs`.
- Source evidence: client fixed tenant ID exports were removed; active profile, organization and default warehouse now come from `get_current_tenant_context()`; restrictive authenticated-user RLS boundaries and cross-tenant SELECT/INSERT negative checks pass on isolated PostgreSQL 17.
- Do not overstate closure: expected production Supabase project ref `ffxxjaolfntzbapmfbuv` is not accessible. No production migration was applied. Authenticated browser E2E, full pricing-tier privacy and anonymous storefront domain-to-tenant scoping remain open. Lovable sync remains unverified and points remain unused.
- At any resumption, read this checkpoint and the latest state/registry/progress, then re-check live `main` and latest exact-SHA CI before changing files.

## Latest verified protocol implementation checkpoint — 2026-10-15

- Protocol implementation is present on remote `main` at exact SHA `90602f6deeba79a5d80efad38d83efec64be5173`: https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/commit/90602f6deeba79a5d80efad38d83efec64be5173.
- Exact-SHA GitHub Actions run [38692264543](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38692264543) completed **SUCCESS**. Unit tests, isolated PostgreSQL 17 migration/workflow tests, lint, build and the port 5173 smoke test passed on this SHA. Do not transfer that result to later SHAs.
- Stable protocol task `AGH-OPS-RESUME-001` is closed as `DONE_VERIFIED` for the committed repository instructions and this exact-SHA CI. This older protocol checkpoint predates the current invoice/PDF work; the live cursor is maintained only in `ops/AGHBARI-LATEST-EXECUTION-STATE.md` and currently remains `AGH-FINANCE-DOCS-001` until that parent requirement closes.
- This host did not have a local checkout, so local `git fetch`/`git status`/local `HEAD` were not run. Remote metadata and CI were checked through GitHub API. GitHub reports `main` branch protection disabled; direct ref updates require expected-SHA lease and no force push.
- Root `AGENTS.md` and `.github/copilot-instructions.md` are present on `main`. Lovable's official documentation explicitly confirms that root-level `AGENTS.md` is always read by its agent (see https://docs.lovable.dev/features/knowledge); this is the free persistent-instruction fallback. The separate Project Knowledge field was not edited directly, and live editor sync of the latest SHA remains **UNVERIFIED**.
- External blocker to recheck before any production database action: `AGH-EXT-SUPABASE-001`, intended Supabase ref `ffxxjaolfntzbapmfbuv`. Never apply migration to a different project.
