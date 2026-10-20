# التكليف التنفيذي الملزم — متجر الأغبري | Aghbari Commerce

هذه الوثيقة تحفظ تعليمات المالك التنفيذية حتى بعد انقطاع الاتصال أو انتهاء الجلسة. الوثيقة الهندسية الكاملة المرجعية هي `AGHBARI-MASTER-PROJECT-SPECIFICATION.md` وتظل المصدر الحاكم للتفاصيل الفنية، كما أن `AGHBARI-REQUIREMENT-REGISTRY.md` هو سجل الفجوات الوحيد الذي يجب تحديثه بدل إعادة الاستكشاف.

## Current remote reconciliation — 2026-10-15

- Latest verified remote state SHA before this correction: `7585fd02e394fe6db464e3aa2f83303c8ed939c8`; exact Actions [38772980004](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38772980004) **SUCCESS**. Latest product code SHA `8e5b706f0f3b17bbef2e5fd62aa96af823bd3b64` passed [38771897585](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771897585). This correction makes a new SHA and must get its own Actions result.
- Exact-SHA CI is verified on `7585fd02e394fe6db464e3aa2f83303c8ed939c8` and product-code SHA `8e5b706f0f3b17bbef2e5fd62aa96af823bd3b64`; do not transfer status to this correction commit. Lovable docs establish that published hosting is snapshot-based and updates require **Publish → Publish changes**. Live site remains stale and cannot be republished from this execution context without a signed-in Lovable session.
- Persistent loader setup is already committed: root `AGENTS.md` for Lovable (official docs explicitly say it is always read) and `.github/copilot-instructions.md` for GitHub Copilot. Project Knowledge/editor synchronization is a separate, currently unverified event; do not spend Lovable credits just to restate saved instructions.
- **Cursor rule:** read the live `next_task_id` only from `ops/AGHBARI-LATEST-EXECUTION-STATE.md`; do not maintain a second current-task pointer in this mandate or the registry. `AGH-SEC-BROWSER-E2E-001` is now next. The source-level API/RPC/export price review is complete for inspected paths; `AGH-PRICE-PRIVACY-001` remains PARTIAL pending authenticated live-browser behavior and production proof. Public `/invoices`, `/statement`, `/manifest.webmanifest` still return 404. The intended production ref `ffxxjaolfntzbapmfbuv` is permission-denied; the listed `aghbari-commerce` ref `mrcyqezbhpncuvaehwgf` is a different project and must not be substituted.
- This host has no checkout. Remote GitHub APIs are the evidence source for this run; local Git status/fetch/HEAD have not been executed.

## بروتوكول الاستئناف الدائم — إلزامي قبل التنفيذ

- نقطة الدخول ليست إعادة التخطيط: افحص الحالة الحية، ثم خذ `next_task_id` من `ops/AGHBARI-LATEST-EXECUTION-STATE.md`، وطابقه مع سجل المتطلبات الوحيد.
- نفّذ `git fetch origin`، وافحص `git status --short --branch` والفرع و`HEAD` المحلي و`origin/main` وآخر commit وCI للـ SHA نفسه. إذا لم توجد بيئة checkout، لا تدّعِ أن أوامر Git المحلية نجحت؛ استخدم الدليل المتاح وسجّل القيد.
- ابدأ من `AGENTS.md` ثم ملفات الذاكرة/الاستئناف/الحالة/السجل، واستعمل `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md` مرجعًا للتفاصيل المطلوبة فقط. لا تطلب من المالك إعادة إرسال المحفوظ ولا تعِد قراءة المشروع كله بلا سبب.
- `DONE_VERIFIED` حالة إغلاق؛ لا تُكررها إلا إذا تغيّر SHA أو الاعتماد/المدخل، أو فشل اختبار، أو ظهر regression/خلل أمني، أو بطل الدليل.
- بعد كل دفعة مترابطة، حدّث السجلات المعتمدة نفسها بمعرّف المتطلب والملفات والأوامر/النتائج وSHA المختبر وCI المطابق والمهمة التالية والعائق بدليله. احفظ commit آمنًا وادفعه إلى `main`، ثم تحقّق من الرأس البعيد والـ CI المطابق قبل إعلان النجاح.
- توثّق وثائق Lovable الرسمية أن `AGENTS.md` في جذر المستودع يُقرأ دائمًا بواسطة وكيل Lovable، مهما طال سياق الجلسة: https://docs.lovable.dev/features/knowledge. لذلك فهو البديل الدائم المجاني لتثبيت قاعدة الاستئناف، ولا حاجة لتكرار المواصفات في Project Knowledge لهذا الغرض. هذا لا يثبت مزامنة SHA جديد داخل المحرر ولا أن حقل Project Knowledge عُدّل مباشرة؛ هذان حدثان منفصلان لا يُدّعى نجاحهما بلا دليل مباشر. تعليمات Copilot الدائمة موجودة في `.github/copilot-instructions.md`.
- معرّف هذا الضابط هو `AGH-OPS-RESUME-001` في سجل المتطلبات الوحيد. لا تنشئ ملف ذاكرة/حالة/سجل تقدم موازياً؛ المؤشر المتغير `next_task_id` مكانه الوحيد `ops/AGHBARI-LATEST-EXECUTION-STATE.md`. لا ترفع حالة الضابط إلى `DONE_VERIFIED` إلا بعد ظهور الملفات على `main` والتحقق من CI الخاص بنفس SHA.

## الهدف والنتيجة
أكمل التطبيق التجاري الحالي برمجيًا إلى منتج موحد قابل للتشغيل والإثبات، لا مجرد تقارير أو واجهات. حافظ على الأعمال الصحيحة، اربط الواجهة بالخدمات والعقود الخلفية والصلاحيات والبيانات الحقيقية، اختبر، ثم ادفع إلى `main` واثبت حالة مزامنة Lovable. الاسم المرئي الوحيد: **متجر الأغبري | Aghbari Commerce**.

## ترتيب التنفيذ الذي لا يجوز تخطيه
`INSPECT → CLASSIFY GAPS → IMPLEMENT → CONNECT → TEST → FIX → VERIFY → COMMIT → PUSH MAIN → SYNC LOVABLE`.

1. اقرأ ملف الإقلاع والحالة وسجل المتطلبات أولًا، ثم تحقق من HEAD/الفرع/status/آخر commits ونتائج CI الحالية فقط؛ لا تُعد مسح المستودع كله إذا كانت الأدلة محفوظة.
2. تتبع المتطلب من الشاشة إلى الحالة والخدمة وAPI/RPC وقاعدة البيانات وRLS/RBAC والاختبار. لا تعتبر الصفحة أو الجدول وحده مكتملًا.
3. نفّذ دفعات مترابطة بأقل تغيير ممكن، ولا تحذف أو تعيد بناء أجزاء صحيحة.
4. اختبر كل دفعة على SHA محدد. أصلح كل فشل واعد الاختبار. سجّل اسم الأمر والنتيجة والـ SHA.
5. أنشئ commit واضحًا، ادفع إلى `main` باستخدام تحديث غير قسري/حماية lease، ثم تحقق من HEAD وسجل CI.
6. بعد ذلك فقط تحقق من مزامنة Lovable والمعاينة. لا تستهلك نقطة إن أمكن حل العائق في المصدر ثم إعادة المزامنة.

## ميزانية Lovable: خمس نقاط فقط
ممنوع استخدامها لإعادة اكتشاف المشروع أو إنشاء خطط أو إعادة توليد الشاشات أو التجارب الشكلية. تعطى الأولوية لمشكلة حقيقية مثبتة: (1) sync/commit، (2) build/runtime، (3) واجهة العميل والإدارة، (4) الطلب والتكاملات الحرجة، (5) تحقق نهائي. اذكر أي عائق خارجي بدل استهلاك النقاط عشوائيًا. لا تقل إن Lovable تزامن إلا بدليل مباشر على الـ SHA/المعاينة.

## نطاق الإكمال
- واجهة B2B عربية RTL متجاوبة، كتالوج وبحث وفلترة ووحدات وSKU/Barcode ومفضلة وسلة وطلبات وعروض قابلة للإدارة وملف عميل.
- تسجيل وموافقة العملاء، الفئات الثلاث للأسعار، أعضاء الشركة والعناوين والأدوار والصلاحيات.
- فرض الأسعار والصلاحيات ومصدر المؤسسة على الخادم وقاعدة البيانات؛ لا ثقة في معرّفات أو أسعار أو إجماليات من المتصفح، ولا كشف أسعار فئات أخرى.
- مخزون وحركات وحجز وحدود نفاد وتحديث أسعار فردي/مجمع واستيراد وتصدير CSV/XLSX مع معاينة وتحقق وتراجع آمن.
- طلب ذري ورقم فريد وسجل حالات ولقطات سعر/فاتورة وidempotency؛ التحقق من التعارضات وسباقات المخزون والائتمان خادميًا.
- PDF/Excel عربي رسمي، وقالب Onyx بالأعمدة وترتيبها المحددين في القسم 21 من المواصفة الكاملة. لا تغيّر الترتيب دون سبب موثق واختبار توافق فعلي.
- Onyx مدمج في التطبيق: المصدر والمعرّف الخارجي والبصمة ووقت المزامنة وحالة المطابقة؛ منع تكرار الأرصدة. إذا لم يوجد API مثبت، أنجز موصل الملفات وسجل ما يلزم لتفعيله ولا تدّع اتصالًا حيًا.
- AI Gateway بمزودين قابلين للتبديل، حدود حصص/ميزانية، privacy gates وprompt-injection sanitization، حسابات حتمية، توصيات بالأسباب والمصادر والفترة والثقة والأثر، وfallback قائم على قواعد دون اختلاق تنبؤ.
- إشعارات داخلية وسجل تدقيق وطوابير/إعادة محاولات آمنة وصحة النظام ونسخ احتياطي واستعادة موثقة وPWA للقراءة دون اتصال فقط.
- WhatsApp لا يعد مرسلًا دون مزود Business رسمي ومعرف رسالة/حالة من المزود.
- إعدادات التشغيل المعتادة قابلة للإدارة من لوحة التحكم حسب الصلاحية؛ الأسرار تبقى في مخزن أسرار خادمي ولا تظهر كاملة للمستخدم.

## بوابات الأمان والاختبارات
- تثبيت الاعتماديات، Unit, isolated PostgreSQL migrations/acceptance, lint, build, smoke test على المنفذ 5173، ثم E2E/Regression المتاحة.
- اختبار RLS سلبي: العميل A لا يصل إلى العميل B، ولا يستخرج سعرًا من فئة أخرى أو يتجاوز صلاحية الدور. المؤسسة والمستخدم والفئة تؤخذ من جلسة موثقة خادميًا.
- اختبار: تسجيل → انتظار موافقة → اعتماد → السعر الصحيح → سلة متعددة الأصناف → إعادة إرسال متكرر → طلب واحد → تغييرات الحالة → تصدير Excel والتحقق من الأعمدة.
- اختبار استيراد صالح/خاطئ/مكرر، ومنع تعديل البيانات الحية قبل المعاينة والاعتماد.
- اختبار مزامنة Onyx مرتين بلا ازدواج، ووسم المصدر، ومطابقة الفروقات دون تعديل مخزون تلقائي.
- اختبار لوحة العميل والإدارة RTL/جوال/كمبيوتر، وانقطاع الشبكة، والتحديث، وحالات تحميل/خطأ/فراغ/عدم صلاحية.
- لا تُجرِ ترحيلات على الإنتاج حتى يثبت معرّف مشروع Supabase المقصود وصلاحيات الوصول وتوافق المخطط. لا تخلط مشروعًا آخر بالاسم المتشابه.

## تعريف الإنجاز والتوثيق
كل بند إما PASS بدليل على SHA نفسه، أو PARTIAL، أو BLOCKED بسبب خارجي محدد، أو NOT DONE. لا تخلط نجاح CI مع إثبات الإنتاج. لا تخلط push مع مزامنة Lovable. لا تخلط واجهة تكامل مع اتصال حقيقي. لا تدخل بيانات العرض في تقارير حقيقية ولا تحذف سجلًا سابقًا صحيحًا.

بعد كل دفعة حدّث:
- `ops/AGHBARI-LATEST-EXECUTION-STATE.md`
- `ops/AGHBARI-DEVELOPMENT-PROGRESS.md`
- `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`
- `PROJECT_MEMORY.md` عند تغير قرار معماري أو المسار المرجعي.
