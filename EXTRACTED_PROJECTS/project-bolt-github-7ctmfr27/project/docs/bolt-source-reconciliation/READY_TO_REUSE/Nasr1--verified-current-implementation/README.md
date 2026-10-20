# Nasr1 — مرآة الكود الحالي المُدمج والمختبر

**مستودع التطبيق:** `Report-Engainall/Nasr1` / `main`  
**Commit المصدر المختبر:** [`618e3d3c019ecd7d05ca0462ca954f908178b814`](https://github.com/Report-Engainall/Nasr1/commit/618e3d3c019ecd7d05ca0462ca954f908178b814)  
**CI المطابق:** [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395)  
**Manifest:** `CURRENT_NASR1_IMPLEMENTED_FILES.csv`

## محتويات المجموعة
مرآة من 10 ملفات فعلية من التطبيق: مركز المهام وفلاتره، شاشة أعمار الذمم واختبار الواجهة، مولد PDF المالي واختباراته، CSS الطباعة، مهاجرتا أعمار الذمم وملخص كشف العميل الكامل، اختبارات قبول PostgreSQL 17، وقاعدة الإنجاز في كل انطلاقة.

## إثبات الحدّ 200/500 واستبعاد الملغاة
- اختبار PostgreSQL 17 ينشئ 205 فواتير و505 دفعات للعميل؛ قوائم التفاصيل تبقى محدودة بـ200 فاتورة و500 دفعة.
- ملخص دفتر العميل الكامل يحافظ على مبالغ جميع الفواتير والدفعات، حتى عندما لا تظهر بعض السجلات في قوائم التفاصيل.
- الفاتورة الملغاة مع دفعتها مضافة إلى fixture عمداً؛ مجاميع الفواتير والمدفوع والمتبقي والمتأخر لا تتغير بسببها.
- مقارنة المال في الاختبار تتم بوحدات النقد الصغرى `BigInt`، لا بطرح `Number` عائم.
- [CI 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395) اجتاز unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview/dev smoke.

## إثبات التطابق
- Git blob SHA لكل مسار فعلي في `main` يساوي بصمة نسخة المرآة؛ كل الصفوف `git_blob_identical=YES`.
- Git blob SHA ليست SHA-256 لأرشيف ZIP/RAR.
- ملفات `docs/` مرآة لتسريع التسليم والاستئناف، وليست نسخ runtime إضافية.
- `PROVENANCE_MANIFEST.csv` للمصادر المانحة بقي كما هو، منفصلًا عن provenance كود Nasr1.

## الاستئناف
ابدأ من `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`. لا تُعد فحص ميزة مغلقة إلا إذا تغير مصدرها أو ظهر فشل جديد.
