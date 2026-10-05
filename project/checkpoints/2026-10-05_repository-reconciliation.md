# Checkpoint مصالحة المستودع وM1

## الهدف

قراءة المستودع الخاص القائم، مطابقته مع baseline الرسمي وخطة D_AI، إصلاح ما يمنع fresh checkout، وإثبات مسار profile الأصلي قبل الانتقال إلى عقود M2.

## الأساس والفرع

- المستودع: `amroquqa99-art/D_AI`.
- الفرع: `phase/m1-reality-check`.
- بداية الفرع: `00532363950637ab894eb7386e2374d18d3acfa0`.
- baseline الرسمي: tag `dsh-v0.2.1-alpha.1` عند `5badb15009ae1756c3afe0ae0cef1faafc290ccc`.
- commit إصلاح ملف القفل: `10afab5`.
- commit خط أساس CI: `27df129`.

## ما تغير

- استوردت خطة التنفيذ والمواصفات الأحدث وسجل المخاطر والتتبع وبروتوكول الاستمرار إلى `project/`.
- أصبح `PROJECT_STATE.md` مصدر الحقيقة للحالة الجارية، وبقي `D_AI_EXECUTION_STATUS_AR.md` checkpoint تاريخيًا مصححًا.
- أعيد توليد `pnpm-lock.yaml` التالف بإصدار pnpm المثبت، مع importers لحزمتي D_AI.
- أزيلت المشغلات التلقائية لوظائف DeepSeek الموروثة. بقيت نسخها الكاملة تحت `.github/upstream-workflows/`، وبقيت stubs خاملة للمسارات التي تشير إليها وثائق المصدر، وأضيف `.github/workflows/d-ai-ci.yml`.
- أصلحت بنية README لحزمتي D_AI، وحدّثت سياسة الوثائق لتستثني وثائق D_AI العربية/الإنجليزية من pairing الصيني الموروث، مع إبقاء corpus المصدر الرسمي كما هو.
- حدثت مصفوفة الميزات وتقرير الاختبار ومرجع persistence المولّد بحسب التنفيذ الفعلي.

## السلوك المثبت

- fresh immutable install ينجح من worktree نظيف.
- profile معزول باسم `d-ai` يركب `d-ai-missions` و`d-ai-locale` فوق Web profile.
- البناء الكامل يولد host/client/Web وحزمتي D_AI عند توفير ترويسات Node الرسمية وحد heap مقداره 8 GiB.
- D_AI يبدأ عبر launcher الأصلي، يربط loopback، يرفض الطلب غير الموثق، ويعيد صفحة التطبيق بعد تدفق رابط الجلسة.
- اختبارات mission/evidence/delegation/owner policy والعربية/RTL تنجح، لكنها تستخدم model/web fixtures موسومة.

## الاختبارات والأدلة

| الفحص | النتيجة |
|---|---|
| `corepack pnpm@11.7.0 install --frozen-lockfile --ignore-scripts` في worktree نظيف | PASS |
| بناء native system addon من ترويسات Node v24.19.0 الموثقة | PASS |
| البناء الكامل مع `NODE_HEADERS_DIR` و8 GiB heap | PASS |
| TypeScript لحزمتي D_AI بعد generation/build | PASS |
| D_AI وlocale Vitest | PASS؛ 3 ملفات و15 اختبارًا |
| اختبارات D_AI مع اختبارات verifiers المعدلة | PASS؛ 6 ملفات و149 اختبارًا |
| `d-ai` config dump | PASS؛ صفا D_AI موجودان |
| تشغيل الخادم وفحص HTTP | PASS؛ 401 بلا auth و200 بعد auth |
| `pnpm run test:docs` | PASS؛ 21 بوابة، بلا فشل أو تخطٍ |
| فحص المواصفات المنسوخة عبر `sha256sum -c` | PASS؛ 6 ملفات |
| GitHub Actions الجديد | PENDING؛ يحتاج أول run بعد push |

## التكاملات الحية والـfixtures

- النموذج: scripted fixture في الاختبارات؛ لا يوجد طلب حي.
- الويب: scripted fixture في اختبارات D_AI؛ تشغيل الخادم المحلي حي، لكن لا توجد مهمة بحث إنترنت مصرح بها.
- المتصفح: تحقق HTTP من الأصول المبنية؛ لا يوجد browser automation أو RTL visual QA.
- البيانات الخارجية والخرائط والإشعارات: لم تبدأ.

## البيانات والمigrations

لا migration لبيانات مستخدم في هذه المهمة. تغير lockfile ووثائق catalog فقط. لا datasets أو evidence أو secrets أضيفت إلى Git.

## قرارات ومخاطر

- قاموس حالة الميزات الحالي يبقى `NOT_STARTED / FOUNDATION / IMPLEMENTED / INTEGRATED / VERIFIED` حتى يحسم D-006.
- Investigation Internal Alpha هو نطاق الإصدار الأول وفق الخطة.
- CI الحي للمستودع الخاص يجب أن ينجح قبل دمج الفرع.
- لا اعتماد لإنتاج حساس؛ grants المؤسسية، durable scheduler، crash recovery، النسخ الاحتياطي، والتكاملات الحية ما زالت مفتوحة.

## حزمة الاستئناف

1. اقرأ `PROJECT_STATE.md` ونتيجة أول GitHub Actions run لهذا الفرع.
2. أصلح أي فرق بين CI ونتائج البيئة المحلية قبل الدمج.
3. بعد دمج M1، افتح فرع `phase/m2-contracts-events` وابدأ versioned contracts وevent backbone فقط.
4. لا توسع إلى الأنظمة المجالّية أو مزود حي قبل بوابات الخطة والقرارات المرتبطة بها.
