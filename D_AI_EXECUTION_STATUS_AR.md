# D_AI — تقرير فحص المصدر وبيئة التنفيذ
تاريخ الفحص: 2026-10-04

## الحالة
تم استنساخ المصدر الرسمي وتثبيت اعتمادياته وفحصه بواسطة المدير وستة وكلاء مستقلين. لم يبدأ تنفيذ مكونات D_AI بعد؛ حزمة المواصفات الإلزامية لم تصل، ولم تُقرأ ملفاتها. هذا تقرير فحص فعلي وليس إعلان اكتمال المشروع.

- المصدر: https://github.com/deepseek-ai/deepseek-harness
- Commit: `5badb15009ae1756c3afe0ae0cef1faafc290ccc`
- Node: v24.19.0
- pnpm المستخدم للتثبيت: 11.25.0؛ النسخة المعلنة في المصدر: 11.7.0
- المستودع المستهدف: amroquqa99-art/D_AI، خاص، ومستقل (`fork: false`)، يحتوي README فقط قبل هذا التقرير.
- جميع ملفات المصدر الأصلية محليًا دون تغييرات: 14208 ملفات متتبعة.

## الفريق الحقيقي
المدير تولى الدمج، وست جلسات مستقلة تولت Runtime، Orchestration/AI-ML، Evidence/Tooling، Frontend، QA، Security. اقتصر عمل هذه المرحلة على الفحص والاختبار، لذلك لم تحدث كتابات متوازية تتطلب Worktrees. فحص QA والأمن مستقلان عن كتابة المكونات.

## ما شُغّل فعلًا
1. git clone للمصدر الرسمي، وتسجيل Commit SHA.
2. pnpm install --frozen-lockfile: ناجح، 342 workspace projects.
3. pnpm dsh --profile web --dump-config: ناجح.
4. pnpm run build: فشل بسبب EPERM على مقبس IPC الخاص بـtsx.
5. محاولة تشغيل Web قبل اكتمال البناء: فشلت بسبب غياب ملفات lib/typert.host.js وحزم client.js. لم تُثبت جاهزية واجهة Web.
6. بناء native addon: فشل أمر البناء الأصلي بسبب IPC؛ تشغيل السكربت عبر node --import tsx كشف غياب Node-API headers. تم تنزيل ترويسات Node v24.19.0 والتحقق من SHA256 مقابل SHASUMS256 الرسمي، ثم بناء flock.c الأصلي بواسطة cc مع خيارات المصدر نفسها. لم يتغير المصدر.
7. اختبارات Vitest مباشرة: 9 ملفات، 220 اختبارًا مختلفًا ناجحًا. فشلت 31 أولًا بسبب addon المفقود؛ أعيد ملف resume وحده بعد البناء فنجحت اختباراته الـ47.

أوامر الاختبارات:
```bash
node node_modules/vitest/vitest.mjs run \
  packages/core/agent-loop/tests/resume.spec.ts \
  packages/core/agent-loop/tests/contract-regressions.spec.ts \
  packages/subagent/subagent-in-process-driver/tests/subagent-in-process-driver.spec.ts \
  packages/storage/storage/tests/registry.spec.ts \
  packages/jobs/jobs-local/tests/loader-composition.spec.ts

node node_modules/vitest/vitest.mjs run \
  packages/session/session-projection/tests/registry.spec.ts \
  packages/guard/timeout-policy/tests/timeout-policy.spec.ts \
  packages/subagent/subagent/tests/service.spec.ts \
  packages/subagent/subagent/tests/control.spec.ts

node node_modules/vitest/vitest.mjs run packages/core/agent-loop/tests/resume.spec.ts
```

هذه اختبارات مختارة للمصدر الأصلي؛ ليست كامل مجموعة الاختبارات، ولا تختبر ميزات D_AI أو استدلالًا بمزود فعلي.

## نقاط الدمج المثبتة من الكود
- Manager: ctx.agents.create/resume، مع AgentHandle وجلسة مستقلة.
- شجرة الوكلاء: ctx.subagents.startContinuable/sendMessage/listDescendants؛ استئناف بارد ودائم.
- النموذج والأدوات: خيارات provider/model/reasoningEffort، scoped composition وtoolFilter.
- الأدلة والمهام: SessionEventMap وسجل دائم، مع sessionProjections لإعادة البناء. يجب توليد known-event-types وعدم تعديل الملفات المولدة يدويًا.
- البحث: ctx.web مع مزودات البحث والجلب الأصلية.
- الميزانيات: maxTokens وoutputSchema لا يستمران تلقائيًا ضمن descriptor الطفل؛ يلزم حفظ سياسة D_AI وإعادة تطبيقها عند الاستئناف.
- Web: امتدادات React/Cordis ضمن التطبيق الأصلي، لا واجهة منفصلة.
- العربية: language pack وقواميس مكتوبة؛ RTL غير منفذ في المصدر ويحتاج معالجة CSS والتفاعلات.

## قيود الأدلة والأمن
- web.fetch يعيد النص المفكوك والروابط والحالة والتقطيع؛ لا يعيد هوية المزود الفعلية أو البايتات الأصلية. أي SHA256 للنص يجب وصفه بأنه بصمة النص المفكوك المحفوظ، لا الملف الأصلي.
- KV قابل للتعديل ولا يوفر معاملات متعددة الجداول؛ سجل الأدلة والتدقيق يحتاج أحداثًا دائمة، مع نشر الحالة المشتقة بعد نجاح الحفظ.
- الأطفال يحملون approvalPolicy=never عند وجود خدمة الموافقات؛ Manager يطلب الموافقات الحساسة. لا يُعاد تفعيلها داخل العامل.
- استخدام Connection الأصلي للمصادقة وHost/Origin؛ webserver وحده لا يوفرها.
- المصدر يعمل بمشغل واحد؛ credential authorization ليست RBAC أو عزل مستخدمين ومؤسسات.
- المحتوى المسترجع غير موثوق ولا يغير صلاحيات الأدوات أو سياسة التنفيذ.

## العوائق الحالية
- D_AI_Build_Pack.zip فشل إرفاقه. الملفات الأربعة الإلزامية لم تُقرأ؛ لا توجد مطابقة Acceptance Matrix بعد.
- أدوات إضافة GitHub المتاحة تدعم تعديل الملفات لكنها لا تشمل إنشاء Fork أو استيراد سجل Git.
- git push المباشر فشل: could not read Username. لم تُنقل ملفات المصدر إلى المستودع.
- محاولة إنشاء فرع من SHA المصدر في المستودع المستقل رُفضت 422 Object does not exist؛ لم يُستبدل main ولم يُحذف شيء.
- يحتاج Fork حقيقي إلى عملية GitHub مدعومة خارج قدرات الإضافة الحالية، أو موافقة مالك المشروع على طريقة استيراد تحفظ المصدر والسجل داخل المستودع الخاص.
- لا توجد مفاتيح نموذج مستخدمة في هذا الفحص؛ لم تتحقق قدرات LLM حية.

## الخطوة التالية
استعادة الملفات المرجعية وقراءتها بالترتيب، وإتاحة Fork/استيراد موثق للسجل الأصلي. بعد ذلك تُنفذ أول شريحة تحقيق أصلية مع اختبارات الاستئناف والأدلة والتفويض والمراجعة المستقلة، وتُرفع كل مرحلة متحققة إلى GitHub ويُتحقق من SHA البعيد.
