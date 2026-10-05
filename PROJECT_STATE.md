# حالة مشروع D_AI

هذا الملف هو نقطة الاستئناف الإلزامية للمشروع. يُحدّث في commit كل مهمة مكتملة، ويجب أن يقرأه أي مطور أو نموذج قبل بدء العمل.

## آخر checkpoint

- التاريخ: 2026-10-05 UTC.
- المرحلة: `M1 — Harness Reality Check`.
- الحالة: تنفيذ M1 المحلي مكتمل على الفرع `phase/m1-reality-check`؛ رفع الفرع وأول GitHub CI هما العمل الجاري.
- المصدر الأساسي: `deepseek-ai/deepseek-harness`، الفرع `master`، والنسخة المثبتة الموسومة محليًا `dsh-v0.2.1-alpha.1`.
- آخر تقرير سابق للمستودع: `D_AI_EXECUTION_STATUS_AR.md` بتاريخ 2026-10-04.
- آخر دليل دائم: `project/checkpoints/2026-10-05_repository-reconciliation.md`.

## ما تم إنجازه

- قراءة محتوى مستودع GitHub الخاص `amroquqa99-art/D_AI` وسجله ومقارنته بالمصدر الرسمي المثبت وبخطة المشروع.
- تثبيت حقيقة أن المستودع يضم أساسًا أصليًا داخل Harness للتحقيق، وحزمة تعريب عربية/RTL، ووثائق معمارية وأمنية واختبارات fixtures.
- استيراد حزمة المواصفات الأحدث كما وردت من المالك إلى `project/specifications/` مع بصمات SHA-256، وإضافة خطة التنفيذ والمعمارية والأمن والبيانات وUX والتتبع والمخاطر وبروتوكول الاستمرار.
- إجراء مراجعات مستقلة لنطاق المنتج، المعمارية، الأمن والبيانات، UX/Frontend، QA/DevOps، والمخاطر.
- اكتشاف تلف ثنائي في `pnpm-lock.yaml` المنشور كان يمنع fresh install، ثم إعادة توليده باستخدام `pnpm@11.7.0` المثبت في المشروع والتحقق منه في worktree نظيف.
- بناء native system addon على Linux x64 من ترويسات Node v24.19.0 الرسمية بعد التحقق من بصمتها.
- تشغيل اختبارات D_AI المركزة بنجاح: 3 ملفات و15 اختبارًا، مع تمييز مزود النموذج والويب فيها كـfixtures صريحة.
- التحقق من تركيب ملف Harness `web` الأساسي عبر `--dump-config`.
- بناء monorepo كاملًا، ثم تشغيل profile `d-ai` عبر launcher الأصلي والتحقق من حماية HTTP وصفحة Web المبنية.
- تصحيح بنية وثائق D_AI وسياسة pairing الخاصة بها، وتمرير بوابات الوثائق واختبارات verifiers.
- استبدال المشغلات التلقائية لـGitHub Actions الموروثة بخط أساس D_AI محدود، مع stubs خاملة للروابط التاريخية.

## ما يجري الآن

- المالك التنفيذي: Codex؛ الفرع: `phase/m1-reality-check`.
- رفع commits إلى GitHub وتشغيل `.github/workflows/d-ai-ci.yml` في بيئة GitHub-hosted.
- فتح PR وربط نتيجته بهذا الملف؛ لا يبدأ M2 قبل معالجة أي فشل في CI.

## ما لم يبدأ

- Mission DAG الدائم، leases/fencing، الاسترداد بعد انهيار العملية، وجدولة عمال موزعة.
- سجل grants مؤسسي مؤقت/دائم، ABAC كامل، وفصل واجبات الموافقات الحساسة.
- واجهة Mission Control المتكاملة ومساحات الأنظمة الستة وSystem Studio.
- provider routing وقياس الميزانية/VRAM والتكامل الحي المصرح به مع نماذج أو feeds أو خرائط.
- مخزن الأدلة/الـCAS النهائي، knowledge graph، البحث الهجين، النسخ الاحتياطي واختبار الاستعادة.
- بقية الأنظمة المجالّية والتدريب المحلي والتقييم الحي.

## المهمة التالية الجاهزة

بعد نجاح GitHub CI ومراجعة PR: دمج M1 ثم تنفيذ `M2 — Contracts & Event Backbone` في فرع مستقل وفق `project/IMPLEMENTATION_PLAN_AR.md`، مع إبقاء Investigation Internal Alpha هو نطاق الإصدار الأول.

## القرارات والحواجز

- القرارات ذات الأولوية موثقة في `project/DECISIONS_REQUIRED_AR.md`.
- قاموس حالة الميزات الملزم حاليًا هو الموجود في `docs/PRODUCT_SPEC.md`: `NOT_STARTED / FOUNDATION / IMPLEMENTED / INTEGRATED / VERIFIED`. اختلافه عن حزمة المواصفات الأحدث مسجل تحت D-006 ولا يُحل ضمنيًا.
- لا توجد بيانات اعتماد لمزود نموذج أو feed أو خدمة خرائط في البيئة. هذا يمنع `LIVE_VERIFIED` فقط ولا يمنع تنفيذ المسارات المعتمدة على fixtures الموسومة.
- فحص TypeScript المركّز اصطدم بغياب عقود `remote` المولّدة في checkout نظيف؛ يعاد بعد بوابة generation/build ولا يُسجل كفشل لسلوك D_AI.
- CI الموروث يفترض runners وأسرارًا خاصة بالمصدر الرسمي. لا يعتمد كخط أساس لـD_AI حتى تُغلق مهمة المصالحة الحالية.

## نتائج التحقق الحالية

| التحقق | النتيجة | الدليل |
|---|---|---|
| lineage للمصدر الرسمي | PASS | merge-base يطابق tag `dsh-v0.2.1-alpha.1` وسجل المصدر محفوظ |
| ملف القفل في fresh worktree | PASS | `corepack pnpm@11.7.0 install --frozen-lockfile --ignore-scripts` |
| سلامة نص ملف القفل | PASS | ASCII، بلا null bytes، ويحتوي importers لحزمتي D_AI |
| بناء native addon | PASS | Node v24.19.0 headers موثقة؛ إنتاج `system.node` لـLinux x64/glibc |
| اختبارات D_AI المركزة | PASS | 3 ملفات، 15 اختبارًا |
| تركيب profile الأساسي `web` | PASS | `corepack pnpm@11.7.0 dsh --profile web --dump-config` |
| البناء الكامل | PASS | ترويسات Node v24.19.0 الرسمية و8 GiB heap؛ host/client/Web وحزمتا D_AI بُنيت |
| فحص TypeScript لحزمتي D_AI | PASS | نجح بعد generation/build الكامل |
| تكامل نموذج/ويب حي | NOT VERIFIED | الاختبارات الحالية تستخدم scripted fixtures ولا توجد credentials |
| profile وخادم D_AI | PASS | تركيب overlay، تشغيل loopback، 401 بلا auth وHTTP 200 بعد auth |
| بوابات الوثائق | PASS | `test:docs`: 21 بوابة نجحت، بلا فشل أو تخطٍ |
| GitHub CI للفرع | PENDING | يبدأ بعد push |

## حالة الأمن والخصوصية

- نسخة threat model: مسودة v0.1 في `project/SECURITY_DATA_PLAN_AR.md`، مع وثيقة التنفيذ الحالية في `docs/SECURITY.md`.
- الأساس الحالي يفرض هوية المالك الحية، موافقة fail-closed عند إنشاء مهمة غير مطابقة لطلب بشري مباشر، وحدودًا لأدوات الوكلاء الأبناء.
- هذه الضوابط مثبتة باختبارات fixtures فقط؛ لا يوجد اعتماد لإنتاج حساس أو multi-user.
- لا أسرار أو بيانات حقيقية حساسة أضيفت إلى Git، ولا توجد rotation أو backup restore مثبتة.
- المخاطر المفتوحة موثقة في `project/RISK_REGISTER_AR.md`؛ مخاطر prompt injection والتفويض والـaudit والعزل تبقى بوابات مستمرة.

## طريقة الاستئناف

1. اقرأ هذا الملف ثم `project/README.md`.
2. راجع `git status` وآخر commit والـcheckpoint المشار إليه أعلاه.
3. اقرأ `AGENTS.md` الأقرب للمسارات التي ستعدلها.
4. راجع نتائج `docs/TEST_REPORT.md` ولا تحول fixture إلى ادعاء live.
5. أكمل المهمة المسجلة في «ما يجري الآن» أو حدّث هذا الملف قبل اختيار مهمة أخرى.
6. عند الإغلاق، حدّث هذا الملف والاختبارات وحقيقة التكاملات وأنشئ checkpoint وفق `project/WORK_PROTOCOL_AR.md`.
