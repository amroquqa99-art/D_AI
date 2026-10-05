# Baseline المصدر الأساسي

## حقائق مثبتة

- المستودع الرسمي: <https://github.com/deepseek-ai/deepseek-harness>.
- المالك: `deepseek-ai`، والترخيص MIT مع `THIRD_PARTY_NOTICES.md` للمكونات التابعة.
- الفرع الافتراضي: `master`.
- SHA المثبت: `5badb15009ae1756c3afe0ae0cef1faafc290ccc` بتاريخ 2026-10-03.
- إصدار الحزم المرصود: `0.2.1-alpha.1`.
- مستودع D_AI الخاص: <https://github.com/amroquqa99-art/D_AI>، مع حفظ ancestry المصدر الرسمي وعدم وجود مزامنة تلقائية.
- التقنية العليا: TypeScript/Node.js monorepo عبر pnpm، مع Python SDK/runtime ومكونات native.
- الإطلاق المدعوم: profiles عبر أمر `dsh`؛ لا يُنشأ executable جانبي لـD_AI.
- المعمارية: Cordis وكل شيء plugin، مع profiles وbundles وpatch layers.

## حالة المصالحة بتاريخ 2026-10-05

- بدأ فرع M1 من `origin/main` عند `00532363950637ab894eb7386e2374d18d3acfa0`.
- الأساس المنشور يضيف `packages/experimental/d-ai` و`packages/client/d-ai-locale` ووثائق تنفيذية واختبارات مركزة.
- ملف `pnpm-lock.yaml` المنشور كان تالفًا ويحتوي null bytes؛ أعيد توليده من baseline الرسمي وتغييرات workspace عبر `pnpm@11.7.0`.
- fresh install immutable نجح في worktree نظيف، وبناء native addon واختبارات D_AI المركزة نجحت.
- profile `web` الأساسي يركب بنجاح؛ قبول profile ومتصفح D_AI نفسه ما زال بندًا صريحًا في M1.
- GitHub Actions الأصلية ما زالت في المسار الفعّال وتفترض runners وأسرار المصدر الرسمي، ولذلك تحتاج خط أساس مستقل لـD_AI.

## مكونات ذات صلة مباشرة

- `core/agent`, `core/agent-loop`, `core/session`, `core/tools` لتشغيل الوكيل والأحداث والأدوات.
- `experimental/agent-team` لتنسيق فريق صغير دائم داخل process واحد؛ هو مرجع ولا يحقق وحده hierarchy متعددة المستويات أو توزيع workers المطلوب.
- `jobs`, `workflow`, `schedule` للأعمال الخلفية والتدفقات والجدولة الحالية.
- `session-persistence`, `session-projection`, `storage-*` للحالة الدائمة والإسقاطات.
- `authorization`, `user-approval`, `sandbox-*`, `credentials-*` للأمن الحالي الذي يحتاج تدقيق فجوات مقابل ABAC الخاص بـD_AI.
- `workspace`, `attachment`, `deliverables`, `session-query` لمساحات العمل والملفات والاستعلام.
- `web-app` وحزم `client/*` وslots لإضافة واجهة D_AI داخل المسار الأصلي.
- `llm/*`, `mcp/*`, `web/*`, `shell/*`, `subprocess/*` للمزودين والأدوات.

## ما لم يُثبت بعد

- رحلة متصفح كاملة لـD_AI من mission creation إلى مراجعة الأدلة.
- مدى ملاءمة مخازن Harness الحالية لـMission DAG وaudit وevidence وknowledge graph على أحجام التشغيل المستهدفة.
- crash recovery والـleases/fencing والتشغيل متعدد العمليات.
- تكامل حي مصرح به مع مزود نموذج أو web feed؛ الاختبارات الحالية تستخدم fixtures موسومة.
- migration strategy للعقود المستقبلية وأهداف الأداء على الجهاز المرجعي.
- صلاحية defaults الحالية لنشر multi-user أو بيانات حساسة.

## قاعدة التحديث

يبقى هذا SHA ثابتًا حتى ينتهي Reality Check. أي انتقال إلى SHA أحدث يحتاج ADR ومقارنة upgrade وتحديث `docs/HARNESS_DELTA.md` والاختبارات قبل الدمج.
