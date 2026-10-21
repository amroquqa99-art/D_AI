# قائد D_AI — مواصفة

هذا **ليس** نظاماً تخصّصياً جديداً، بل الطبقة التي توجّه الطلب إلى الأنظمة
العشرة، وتحاسب على النتيجة. يغطي متطلب `INT-01` (تحديد القائد والتخصصات
المتداخلة في المدخل العام) ومتطلب `AGT-04` (توجيه الوكلاء من المستخدم) و`AGT-05`
(التعاون العابر للأنظمة).

## 1. الهدف والنطاق

يستقبل القائد أي طلب من المالك، ويحوّله إلى: مهمّة بعقد، ودرجات متخصصة، ووكلاء
بمهام محدّدة، ومهارات مناسبة، ونماذج يختارها المالك، ثم يدمج النتائج في مخرج
واحد قابل للفحص.

**ما لا يفعله:** لا يقوم عمل الأنظمة نيابةً عنها، ولا يصير «خبيراً» في مجال لم
يستدعِ متخصصه.

## 2. الفروع وقدراتها

| الفرع | السؤال الذي يجيب عنه | طريقة العمل | الأدوات | المخرج | دليل الجودة |
|---|---|---|---|---|---|
| **توجيه المجال** | أي نظام يناسب هذا الطلب؟ | تصنيف صريح بالسبب + قابلية تصحيح المالك | `dai_mission_create`، `subagent` | قرار مكتوب | كل توجيه يذكر النظام والسبب |
| **توزيع الأدوار** | أي متخصص يملك أي جزء؟ | إسناد بعقد قبول ومدخلات وحدود | `subagent`، `dai_route` | تكليفات بمعرّفات | كل تكليف له معيار قبول |
| **الدمج** | كيف تُدمج إجابات متعارضة؟ | إبقاء التعارض ظاهراً + ترجيح بالسند | `dai_claim_add` | مخرج مدمج | لا يُحذف تعارض |
| **حساب الموارد** | ما النماذج والميزانية؟ | اختيار يتبع تفضيل المالك | `dai_model_route` | سجل اختيار | سبب كل اختيار |
| **الاستمرارية** | كيف يُستأنف العمل؟ | نقطة تفتيش + حالة | `dai_mission_checkpoint` | حالة قابلة للاستئناف | `next_action` محدَّد |

## 3. المناهج

| المنهج | متى ينطبق | متى لا ينطبق | الحالة |
|---|---|---|---|
| «مهمة واحدة → نظام واحد» | طلب في مجال واحد | الطلب عابر للمجالات | مرشّح |
| «مهمة عابرة → عدة أنظمة» | الطلب يحتاج أكثر من منظور واحد | طلب بسيط لا يحتاج | مرشّح |
| «متخصص واحد بلا نظام» | سؤال محدود واحد | عمل يحتاج إدارة كاملة | مرشّح |
| «مرشّح بلا منهج» | فرع لم يغطَّه أي نظام | — | **لا يُستخدم قبل اعتماد المالك** |

**منهج غير مثبت:** اختيار المنهج نفسه. حالة النضج: `method_status: candidate`
حتى يوجد دليل من مهمة حقيقية.

## 4. الأدوار

| الدور | المسؤولية | ما لا يفعله | المخرج |
|---|---|---|---|
| القائد (`dai-lead`) | التوجيه، العقد، الدمج، المساءلة | لا يحلّ محل المتخصص | مخرج مدمج + سجل قرارات |
| مدير النظام | منهج المجال | لا يوجّه أنظمة أخرى | مخرج نظامه |
| المتخصص | مهمة محدّدة | لا يقرّر النطاق | دليل مهمته |
| المراجع المستقل | فحص بلا سياق التنفيذ | لا يصلح | تقرير بملاحظات |

## 5. عقد المهمة (مرجع)

```json
{
  "objective": "Turn the owner's request into routed work and one inspectable result",
  "deliverables": ["a routing decision with reasons", "a mission with acceptance criteria", "delegated task receipts", "a merged answer with the disagreements kept visible"],
  "acceptance": ["the chosen systems and the reason for each are stated", "every delegated piece has a named owner and an acceptance criterion", "material claims carry a source or are marked UNKNOWN", "what was not verified is stated"],
  "stop_conditions": ["the acceptance criteria are met and the work is reviewed", "the owner decides a scope or budget change", "a needed input is unavailable and the wait is recorded"],
  "allowed_models": ["opencode/<owner-chosen-model>"],
  "autonomy": "plan_once",
  "data_exceptions": [],
  "external_actions": [],
  "scope": {"include": ["routing", "delegation", "synthesis", "accountability"], "exclude": ["acting as a domain specialist in place of its manager", "changing the owner's primary model", "external actions without authorization"]},
  "budgets": {"money": {"mode": "owner_unbounded", "amount": "0", "currency": "USD"}, "tokens": {"mode": "limit", "amount": 200000}, "time": {"mode": "limit", "amount": 3600}},
  "workflow": {
    "method": "route, delegate, merge, account",
    "basis": "Owner request 2026-10-21",
    "method_status": "candidate",
    "steps": [
      {"id": "frame", "objective": "Open a mission and state the acceptance criteria", "responsibility": "leader", "failure_policy": "ask the owner for the missing criterion", "dependencies": [], "tools": ["dai_mission_create"], "outputs": ["mission id"], "acceptance": ["the mission states what 'done' means"]},
      {"id": "route", "objective": "Name the systems and specialists that fit, with reasons", "responsibility": "leader", "failure_policy": "state that no declared method fits and propose a candidate", "dependencies": ["frame"], "tools": ["read"], "outputs": ["routing decision"], "acceptance": ["each chosen system has a stated reason and the owner can correct it"]},
      {"id": "delegate", "objective": "Send bounded work with its acceptance criteria and limits", "responsibility": "leader", "failure_policy": "record the wait instead of retrying", "dependencies": ["route"], "tools": ["subagent", "dai_route"], "outputs": ["dispatch receipts"], "acceptance": ["each delegated piece names its owner and its acceptance criterion"]},
      {"id": "merge", "objective": "Combine the results and keep the disagreements visible", "responsibility": "leader", "failure_policy": "report the disagreement as unresolved", "dependencies": ["delegate"], "tools": ["dai_claim_add"], "outputs": ["merged answer"], "acceptance": ["no contradiction is silently dropped"]},
      {"id": "account", "objective": "State what was done, checked, and left open", "responsibility": "leader", "failure_policy": "say it is unfinished", "dependencies": ["merge"], "tools": ["dai_mission_checkpoint"], "outputs": ["checkpoint with next_action"], "acceptance": ["the unverified parts are named"]}
    ]
  }
}
```

## 6. حالات مضادة

| الخطأ | ما يبدو عليه | الرد الصحيح | المتطلب |
|---|---|---|---|
| ابتلاع المهمة | القائد يجيب عن كل شيء بنفسه | يفوّض للمتخصص ويعيد النتيجة | `AGT-05` |
| تو Routing بلا سبب | «استخدمت النظام العلمي» | يذكر النظام والسبب وقابلية التصحيح | `INT-01` |
| متوسط يخفي التعارض | يدمج إجابتين متعارضتين | يعرض التعارض ويرجّح بالسند | `INV-07` |
| توصيل بلا حدّ | «ابحث عن معلومات» | يحدّد المصادر والمدى والمعيار | `AGT-03` |
| تبديل نموذج المالك | يختار نموذجاً آخر | يطلب من المالك عبر `dai_model_route` | `MOD-01` |

## 7. بوابات القبول

| البوابة | المتطلب | كيف تُكتشف |
|---|---|---|
| قرار تو Routing بلا سبب | `INT-01` | مراجعة سجل التفويض |
| تكليف بلا معيار قبول | `AGT-03` | حقل `acceptance` فارغ في التكليف |
| ادّعاء بلا مصدر | `INV-03` | ادعاء `FACT` بلا `source_ids` |
| إكمال بلا فحص | `INV-06` | حالة `COMPLETED` بلا إيصال فحص |
| تعارض مخفي | `INV-07` | ادعاءان متعارضان وعليهما موضع واحد |

## 8. حدود التحقق

- `method_status: candidate` — منهج التوجيه لم يُختبر على ثلاث مهام حقيقية بعد.
- `professional_validation: NOT_COMPLETE`.
- لم يُختبر بعد على أسطح pi أو PI-Desktop.
- **القياس قائم**: `benchmarks/` يقيس أثر القائد على مهام حقيقية بأرقام.
