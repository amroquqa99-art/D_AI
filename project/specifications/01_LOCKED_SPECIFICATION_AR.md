# D_AI — Locked Product Specification v2

## 1. هوية المنتج
D_AI هو بيئة عمل ذكاء اصطناعي متعددة الأنظمة مبنية على fork حقيقي من المصدر الرسمي لـ DeepSeek Harness. ليس Chatbot، وليس مجموعة Prompts، وليس Wrapper خارجيًا رقيقًا. المطلوب تعديل وامتداد بنية Harness نفسها عند الحاجة، مع الاحتفاظ بإمكانية التطوير المستقل باسم D_AI وعدم الاعتماد على تحديثات upstream بشكل تلقائي.

الهدف هو جمع أنظمة تخصصية عميقة داخل Runtime موحد قادر على التخطيط، توزيع العمل، تشغيل وكلاء مستقلين، استخدام الأدوات، إدارة الذاكرة والأدلة، العمل طويل المدى، والتحكم بالصلاحيات والموارد.

## 2. الأنظمة الأساسية الحالية
D_AI يحتوي حاليًا على ستة أنظمة First-Class:
1. التحقيق — Investigation.
2. البحث العلمي — Scientific Research.
3. المستثمر — Investor.
4. الأمن السيبراني — Cybersecurity.
5. العمليات والاستخبارات — Operations & Intelligence.
6. الابتكار والاكتشاف — Innovation & Discovery.

كل نظام يجب أن يمتلك:
- Manifest وإصدار دلالي.
- System Manager Agent رئيسي.
- وكلاء متخصصين قابلين للإنشاء ديناميكيًا.
- Tool Profiles وصلاحيات مستقلة.
- Workflows وقوالب مهام.
- Evidence/Artifact types.
- Evaluation Suite.
- UI registration.
- Memory scopes.
- Cross-system contracts.
- سياسات المخاطر والموافقات.

## 3. النواة الذكية المحلية
النواة المحلية ليست مجرد خيار Model Provider. هي هدف معماري أساسي للمنتج.

تبدأ المنصة بالاعتماد على نماذج محلية وخارجية متعددة، ثم تجمع بيانات التشغيل المصرح بها والمنقاة مثل:
- أنماط المهام.
- الاستراتيجيات الناجحة والفاشلة.
- قرارات الخبراء وتصحيحاتهم.
- مسارات الأدلة.
- نتائج الاختبارات.
- Tool traces المسموح بتخزينها.
- تقييمات الجودة.
- المقارنات بين النماذج والوكلاء.

لا تدخل أي بيانات تلقائيًا إلى التدريب. تمر عبر Data Governance Pipeline يحدد الجودة، الحساسية، الملكية، الصلاحية، نزع البيانات الحساسة، وإذن الاستخدام.

الهدف النهائي هو نموذج محلي متخصص في طريقة عمل D_AI وأنظمته، قادر على التخطيط، تحليل الأدلة، اختيار الأدوات، الاستدلال متعدد الخطوات، التعاون بين الأنظمة، وفهم حالات العمل الداخلية بصورة أفضل من نموذج عام غير متخصص.

## 4. نموذج التشغيل العام
يعمل D_AI وفق طبقات مترابطة:

```text
D_AI Web Workspace
  Mission Director
  System Registry
  Agent Runtime / Agent Manager
  Task DAG + Durable Scheduler
  Model Router
  Tool Gateway
  Evidence & Knowledge Layer
  Memory Layer
  Policy / Approval / Audit Layer
  Artifact & Experiment Store
  Local Intelligence Core
  Domain Systems x6
  DeepSeek Harness native runtime/packages/sessions/tools/jobs
```

يجب عدم الخلط بين:
- Agent hierarchy: من يدير من.
- Task DAG: ما المهمة التي تعتمد على ماذا.
- Knowledge/Evidence Graph: ما الادعاء والدليل والعلاقة والمصدر.

## 5. الوكلاء المتعددون
الوكلاء في D_AI يجب أن يكونوا instances حقيقية مستقلة بالسياق والهوية والحالة، لا مجرد أدوار مكتوبة داخل Prompt واحد.

يدعم النظام:
- System Manager Agents.
- Sub-managers.
- Specialized workers.
- Critics / verifiers.
- Permanent agents.
- Task-scoped agents.
- Independent competing approaches.

ويحفظ لكل وكيل تاريخ أداء واختبارات وموثوقية وتكلفة، ليستفيد Model/Agent Router من الأدلة بدل التخمين.

## 6. الذاكرة والاستمرارية
يدعم النظام ذاكرة متعددة المستويات:
- Global.
- Organization.
- System.
- Project.
- Mission.
- Agent.
- Task.

تُخزن الأحداث والحقائق الخام بصورة قابلة لإعادة البناء، ولا يعتمد النظام على summaries فقط كمصدر للحقيقة.

يجب أن تستمر المهمات بعد:
- إغلاق البرنامج.
- إعادة التشغيل.
- فقد الاتصال.
- فشل worker.
- توقف provider.

الحالات الأساسية تشمل:
RUNNING, WAITING_FOR_HUMAN, WAITING_FOR_TOOL, BLOCKED_POLICY, BLOCKED_BUDGET, PAUSED, FAILED, COMPLETED.

## 7. الأدلة والمصادر
كل claim مهم يجب أن يعرف:
- مصدره الأصلي.
- وقت جمعه.
- الأداة التي جمعته.
- النظام/الوكيل الذي أدخله.
- مستوى الثقة.
- هل هو observed أم derived أم inferred.
- هل تم التحقق منه مستقلًا.
- ما الأدلة المؤيدة والمضادة.

المخرجات لا تخلط الحقائق بالفرضيات.

## 8. الرسم البياني المعرفي
يبني D_AI Knowledge Graph مشتركًا يربط الأشخاص والكيانات والشركات والأحداث والأجهزة والمفاهيم العلمية والفرضيات والمصادر والأدلة والمشاريع.

أي مشاركة بين الأنظمة يجب أن تحفظ attribution وpermissions وscope.

## 9. الصلاحيات
الصلاحيات مرنة ومبنية على Attributes وليست Roles جامدة فقط.

يمكن تحديد:
- النظام.
- الأداة.
- نوع البيانات.
- الهدف.
- المشروع.
- المدة.
- مستوى السرية.
- حدود الإنفاق.
- هل يحتاج الإجراء موافقة بشرية.

يدعم النظام صلاحيات مؤقتة ودائمة، وتصعيدًا يحتاج موافقة، وسحبًا فوريًا.

## 10. الموافقات البشرية
كل إجراء حساس أو عالي الأثر يمكن أن يتطلب Human Approval Gate. يجب أن تكون الموافقة جزءًا من runtime وليس checkbox في الواجهة فقط.

## 11. التشغيل المحلي والهجين
Local-first، مع دعم Cloud اختياري.

لا يُرسل محتوى حساس إلى مزود خارجي دون سياسة تسمح بذلك. يدعم النظام Ollama وllama.cpp ومزودي APIs المصرح بهم عبر Provider adapters قابلة للاستبدال.

## 12. القيود المادية الحالية
بيئة التطوير المرجعية الحالية:
- Intel Core i7 12th Gen.
- RTX 3060 6GB VRAM.
- 16GB RAM.
- 1TB SSD.
- Arch Linux.

هذه قيود تشغيلية وليست حدودًا معمارية دائمة.

## 13. التشغيل طويل المدى
D_AI مصمم لمهام تستمر دقائق أو أشهر. لذلك يجب أن يدعم:
- durable checkpoints.
- periodic reports.
- re-planning.
- budget reassessment.
- evidence updates.
- human tasks.
- experiment waits.
- stale hypothesis detection.
- recovery after crash.

## 14. إدارة الموارد
كل مهمة يمكن أن تملك Budget يشمل:
- مال.
- وقت.
- Tokens.
- Compute.
- GPU/CPU/RAM.
- Human attention.
- API usage.

ويستخدم النظام Value of Information لتقدير إن كان البحث أو التجربة التالية تستحق كلفتها.

## 15. الواجهة
لا تُبنى الواجهة كصفحة Chat فقط.

يجب أن تتضمن:
- Mission Control.
- Agent Terminal.
- Task DAG.
- Knowledge/Evidence Explorer.
- System Studio.
- Model Registry.
- Tool Registry.
- Artifact Vault.
- Resource/Cost Monitor.
- Approvals/Audit.
- Timeline.
- Maps/Graphs.
- Arabic/English RTL/LTR حقيقي.

## 16. إضافة أنظمة جديدة
إضافة نظام جديد يجب أن تكون عملية معيارية عبر contracts وmanifests وmigrations وevals وUI registration، دون تعديل واسع في core.

يمكن لاحقًا إضافة System Creation Wizard ينشئ نظامًا داخل sandbox، يختبره، ثم يرفعه للموافقة قبل التفعيل.

## 17. التعلم المؤسسي
المنصة تحفظ المعرفة المتراكمة، failed hypotheses، القرارات، تقييمات الأدوات، نتائج الوكلاء، وأساليب العمل الناجحة، بحيث لا تضيع الخبرة بخروج شخص أو انتهاء مشروع.

## 18. الحقيقة الهندسية
أي شيء غير متصل بالـruntime الفعلي لا يعتبر Feature منفذة.

يجب التمييز دائمًا بين:
- FOUNDATION.
- IMPLEMENTED.
- INTEGRATED.
- TESTED.
- LIVE-VERIFIED.

ولا يسمح بإعلان نتائج اختبار أو قدرات أو Live integrations غير مثبتة.
