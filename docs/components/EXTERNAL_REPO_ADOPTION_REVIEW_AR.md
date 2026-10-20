# مراجعة تبنّي المستودعات الخارجية — D_AI 1.0

## الغرض

هذا المستند مراجعة تبنٍّ لـ 22 مستودعاً خارجياً على GitHub، مع فهرس قابل للقراءة آلياً في `external_components.json`. الغرض تسجيل قرار تبنٍّ موثق لكل مستودع وفق قاعدة D_AI: يُمتصّ النمط والتعليمات والعقد وطريقة العمل، ولا يُباعَد المستودع نفسه، ولا تُضاف تبعية runtime، ولا تُنسخ مهاراته أو أوامره حرفياً.

## قاعدة التبني (نمط لا مستودع)

D_AI تمتصّ نمط المستودع وتعليماته وعقوده وطريقة عمله في عقود D_AI الخاصة بها. لا يُباعَد المستودع نفسه، ولا تُضاف تبعية runtime، ولا تُنسخ مهاراته أو أوامره حرفياً. كل مكون يُعرض على السجل (`dai/components.py`) ويُتخذ بشأنه أحد القرارات الأربعة التالية:

- `ADOPT_PATTERN` — يُقبل النمط ويُدمج في عقود D_AI الأصلية بعد التحقق.
- `ADOPT_PATTERN_AFTER_X` — يُؤجل التبني حتى يتحقق شرط (رخصة، قراءة README، اختبار).
- `REFERENCE_ONLY` — يُستشهد بالنمط فقط دون تبنٍّ أو دمج.
- `REJECT` — يُرفض النمط، ويُسجل سبب الرفض.

رخصة `UNKNOWN` أو `CONFLICT` تمنع `ADOPT_PATTERN`؛ يجب على المالك البت في السؤال القانوني أولاً.

## الجدول التلخيصي (جميع 22 مستودعاً)

| المستودع | الرخصة | pushed_at | القرار | سبب القرار |
|---|---|---|---|---|
| cursor/plugins | CONFLICT | 2026-10-20T02:25:29Z | ADOPT_PATTERN_AFTER_X | تعارض رخصة (API null، LICENSE 404، README تدّعي MIT) يحتاج حسمًا قانونيًا |
| backnotprop/pstack | MIT | 2026-10-19T18:30:44Z | ADOPT_PATTERN | مقروء، نمط ملموس (skills/ + SKILL.md + principles + playbooks) |
| tester-army/e2e | Apache-2.0 | 2026-10-20T11:25:20Z | ADOPT_PATTERN_AFTER_X | README لم يُقرأ؛ النمط غير مؤكد pending reading |
| open-multi-agent/open-multi-agent | MIT | 2026-10-19T06:24:48Z | REJECT | رنタイム يفترض ملكية حلقة الوكيل |
| ag2ai/ag2 | UNKNOWN | UNVERIFIED | ADOPT_PATTERN_AFTER_X | رخصة غير مؤكدة؛ سؤال قانوني للمالك |
| langchain-ai/langgraph | MIT | 2026-10-20T10:09:29Z | REJECT | رنタイム (graph + checkpointing + interrupts) |
| crewaiinc/crewai | MIT | 2026-10-20T08:10:52Z | REJECT | رنタイム (Crews and Flows) |
| desplega-ai/agent-swarm | MIT | 2026-10-20T12:00:26Z | REJECT | رنタイム ("Company Agentic OS") |
| mvschwarz/openrig | Apache-2.0 | 2026-10-20T12:01:40Z | ADOPT_PATTERN | مقروء، نمط ملموس (rig-spec YAML، seats/pods/teams، bundle-audit.jsonl) |
| gastownhall/gastown | MIT | 2026-10-18T00:11:21Z | ADOPT_PATTERN | مقروء، نمط ملموس (beads ledger، Work/Deacon/Dogs roles، P0-P2 escalation) |
| kienbui1995/magic | CONFLICT | 2026-10-11T17:05:04Z | ADOPT_PATTERN_AFTER_X | تعارض رخصة (API other/NOASSERTION مقابل Apache 2.0 في README) |
| OpenHands/openhands | MIT | 2026-10-20T11:55:14Z | REJECT | رنタイム (software-development agent platform) |
| camel-ai/camel | Apache-2.0 | 2026-10-19T09:33:36Z | REJECT | رنタイム (multi-agent framework) |
| FoundationAgents/MetaGPT | MIT | 2026-01-21T10:12:33Z | REJECT | رنタイム، خامد حوالي 9 أشهر، الرابط البديل لم يُتحقَّق منه |
| 2FastLabs/agent-squad | Apache-2.0 | 2026-10-08T09:03:31Z | REJECT | رنタイム (orchestration على AWS Lambda) |
| dean0x/autobeat | MIT | 2026-06-07T17:14:51Z | ADOPT_PATTERN_AFTER_X | README لم يُقرأ؛ خامد حوالي 4.5 أشهر؛ النمط غير مؤكد |
| microsoft/agent-framework | MIT | 2026-10-20T10:47:19Z | ADOPT_PATTERN_AFTER_X | README لم يُقرأ؛ النمط غير مؤكد |
| bytedance/deer-flow | MIT | 2026-10-20T11:36:04Z | REJECT | رنタイム (sandboxes / memories / subagents / skills / message gateway) |
| AgenticGoKit/AgenticGoKit | Apache-2.0 | 2026-08-01T03:56:57Z | REJECT | رنタイム (event-driven + MCP discovery + observability) |
| TencentCloud/Octop | MIT | 2026-10-20T07:38:33Z | ADOPT_PATTERN_AFTER_X | README لم يُقرأ؛ النمط غير مؤكد |
| yeachan-heo/oh-my-claudecode | MIT | 2026-10-20T10:37:35Z | REFERENCE_ONLY | تشكيل تعليمي (instruction-shaped)، سطح حقن موجهات؛ النمط غير مؤكد |
| obra/superpowers | MIT | 2026-10-20T06:37:50Z | REFERENCE_ONLY | تشكيل تعليمي (instruction-shaped)، سطح حقن موجهات؛ النمط غير مؤكد |

## أقسام تفصيلية لكل مستودع

### 1. cursor/plugins

المشكلة التي يحلها: تخطيط سوق إضافات Cursor عبر `.cursor-plugin/marketplace.json` و `plugin.json` لكل إضافة مع `skills/` و `rules/` و `mcp.json`.

الرخصة والتوافق مع GPL-3.0-or-later: CONFLICT — API ترخيص null، ملف LICENSE يعيد 404، لكن الـ README ينتهي بـ "License: MIT". هناك تعارض يحتاج حلاً قانونياً قبل أي تبنٍّ.

مؤشر الصيانة: README مقروء في 2026-10-20T02:25:29Z.

النمط القابل للنقل: تخطيط سوق إضافات عبر `.cursor-plugin/marketplace.json` + `plugin.json` لكل إضافة + مجلدات `skills/` و `rules/` + ملف `mcp.json`.

عائلات المتطلبات: EXT-01، EXT-04، INV-04.

التكرار مع قدرة D_AI القائمة: يتطابق جزئياً مع `component.registry` في `dai/components.py`؛ يمكن استعارة مفهومielle manifest للمكونات دون نسخ التعليمات.

المخاطر والتعارضات: تعليمات خارجية قد ترفع سلطتها فوق قرارات المالك (INV-04). تعارض الرخصة يمنع ADOPT_PATTERN.

القرار: ADOPT_PATTERN_AFTER_X.

سبب القرار: تعارض رخصة يحتاج حسمًا قانونياً من المالك؛ رخصة UNKNOWN/CONFLICT تمنع ADOPT_PATTERN وفق السجل.

### 2. backnotprop/pstack

المشكلة التي يحلها: مرآة لمجموعة pstack من cursor/plugins، بتنسيق `skills/<name>/SKILL.md` مع 24 إدخالاً من tipo "principle-*" و 23 دليل تشغيل (playbook).

الرخصة والتوافق مع GPL-3.0-or-later: MIT — متوافقة مع GPL-3.0-or-later.

مؤشر الصيانة: README مقروء في 2026-10-19T18:30:44Z.

النمط القابل للنقل: هيكل `skills/<name>/SKILL.md` مع مدخلات مبدأ ودلائل تشغيل منظمة.

عائلات المتطلبات: EXT-01، EXT-04.

التكرار مع قدرة D_AI القائمة: يتوافق مع `workflow.step` و `task` في عقود D_AI؛ يمكن استعارة مفهومielle "دليل تشغيل موجه" (playbook router).

المخاطر والتعارضات: keine مخاطر معروفة؛ نمط تعليمي خارجي قد يرفع سلطته فوق قرارات المالك إذا نُقل حرفياً (INV-04).

القرار: ADOPT_PATTERN.

سبب القرار: رخصة MIT واضحة، README مقروء، النمط ملموس وقابل للنقل دون نسخ التعليمات حرفياً.

### 3. tester-army/e2e

المشكلة التي يحلها: إطار اختبار نهاية إلى نهاية (e2e) للويب والجوال.

الرخصة والتوافق مع GPL-3.0-or-later: Apache-2.0 — متوافقة مع GPL-3.0-or-later.

مؤشر الصيانة: 2026-10-20T11:25:20Z.

النمط القابل للنقل: UNVERIFIED — الـ README لم يُقرأ.

عائلات المتطلبات: EXT-01، EXT-06.

التكرار مع قدرة D_AI القائمة: لا يمكن المقارنة قبل قراءة الـ README.

المخاطر والتعارضات: النمط غير مؤكد؛ قد يفترض إطار تشغيل خاص به.

القرار: ADOPT_PATTERN_AFTER_X.

سبب القرار: الرخصة مقبولة ولكن النمط غير مؤكد pending قراءة الـ README.

### 4. open-multi-agent/open-multi-agent

المشكلة التي يحلها: تشغيل ذاتي (self-hosted runtime) يُعني بالموافقات الدائمة والسجلات القابلة للمراجعة لتشغيل الوكلاء.

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-19T06:24:48Z.

النمط القابل للنقل: تشغيل ذاتي مع موافقات دائمة وسجلات تدقيق — لكن هذا يفترض امتلاك حلقة الوكيل (agent loop).

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI مضيف أصلي (host-native) ولا 가진 حلقة نموذج خفية؛ لا يمكن تبنّي الرنタイム.

المخاطر والتعارضات: يفترض المستودع نفسه تشغيل النماذج أو امتلاك حلقة الوكيل، ما يتعارض مع تصميم D_AI.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض؛ يمكن الاستشهاد بنمطه دون تبنّي الرنタイム.

### 5. ag2ai/ag2

المشكلة التي تحلها: إطار عمل للوكلاء (agent framework).

الرخصة والتوافق مع GPL-3.0-or-later: Apache-2.0 يدّعيها صفحة GitHub، لكن حقل الرخصة UNVERIFIED.

مؤشر الصيانة: UNVERIFIED — الـ README جزئياً فقط.

النمط القابل للنقل: UNVERIFIED.

عائلات المتطلبات: EXT-01.

التكرار مع قدرة D_AI القائمة: غير مؤكد قبل التحقق من الرخصة والـ README.

المخاطر والتعارضات: رخصة غير مؤكدة تحتاج حسمًا قانونياً من المالك.

القرار: ADOPT_PATTERN_AFTER_X.

سبب القرار: رخصة UNKNOWN تجبر ADOPT_PATTERN_AFTER_X بدلاً من ADOPT_PATTERN؛ يحتاج حلاً قانونياً.

### 6. langchain-ai/langgraph

المشكلة التي يحلها: رسم بياني مع نقاط تفتيش (checkpointing) ومقاطعات (interrupts) للوكلاء.

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T10:09:29Z.

النمط القابل للنقل: رسم بياني مع نقاط تفتيش ومقاطعات.

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI مضيف أصلي وليس رنタイム للرسوم البيانية للوكلاء.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل، ما يتعارض مع تصميم D_AI.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض؛ يمكن الاستشهاد بنمط الرسم البياني دون تبنّي الرنタイム.

### 7. crewaiinc/crewai

المشكلة التي يحلها: مجموعات (Crews) وتدفقات (Flows) للوكلاء.

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T08:10:52Z.

النمط القابل للنقل: Crews and Flows.

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI ليست رنタイム للوكلاء.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض.

### 8. desplega-ai/agent-swarm

المشكلة التي يحلها: "نظام وكلي تشغيلي" (Company Agentic OS).

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T12:00:26Z.

النمط القابل للنقل: نظام وكلي تشغيلي.

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI مضيف أصلي ولا يمكن أن يكون فرعياً لنظام وكلي خارجي.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل وتشغيل النماذج.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض.

### 9. mvschwarz/openrig

المشكلة التي يحلها: مواصفات حفر (rig-spec) عبر YAML، مع مقاعد/حالات/فرق، طوابير مرقمة، ملف bundle-audit.jsonl، ومقعد noyau للمشغل والمستشار.

الرخصة والتوافق مع GPL-3.0-or-later: Apache-2.0 — متوافقة مع GPL-3.0-or-later.

مؤشر الصيانة: README مقروء في 2026-10-20T12:01:40Z.

النمط القابل للنقل: rig-spec YAML، seats/pods/teams، طوابير مرقمة، bundle-audit.jsonl، مقعد noyau للمشغل + مقعد المستشار.

عائلات المتطلبات: EXT-01، EXT-04.

التكرار مع قدرة D_AI القائمة: يتوافق مع `team.agent` و `memory.scope` و `component.registry`؛ يمكن استعارة مفهومielle "مقعد المستشار" (advisor seat) وسجل تدقيق الحزم.

المخاطر والتعارضات: keine مخاطر معروفة؛ الرخصة واضحة والـ README مقروء.

القرار: ADOPT_PATTERN.

سبب القرار: رخصة Apache-2.0 واضحة، README مقروء، النمط ملموس وقابل للنقل.

### 10. gastownhall/gastown

المشكلة التي يحلها: سجل حبات (beads ledger)، هوكات (git worktree)، قوافل (convoys)، صيغ في TOML، أدوار Witness/Deacon/Dogs، مصفاة (Refinery)، تصعيد P0-P2، مجدول، جلسة استدعاء (seance).

الرخصة والتوافق مع GPL-3.0-or-later: MIT — متوافقة مع GPL-3.0-or-later.

مؤشر الصيانة: README مقروء في 2026-10-18T00:11:21Z.

النمط القابل للنقل: سجل حبات، هوكات git-worktree، قوافل، صيغ TOML، أدوار Witness/Deacon/Dogs، تصعيد P0-P2، مجدول.

عائلات المتطلبات: EXT-01، EXT-04.

التكرار مع قدرة D_AI القائمة: يتوافق مع `memory.scope` و `decision` و `task`؛ يمكن استعارة مفهومielle "سجل العمل" (work ledger) و"تصعيد الشدة" (severity escalation).

المخاطر والتعارضات: keine مخاطر معروفة؛ الرخصة واضحة والـ README مقروء.

القرار: ADOPT_PATTERN.

سبب القرار: رخصة MIT واضحة، README مقروء، النمط ملموس وقابل للنقل.

### 11. kienbui1995/magic

المشكلة التي يحلها: بوابة نماذج لغوية (LLM gateway) مع سجل موجهات (prompt registry) وذاكرة وكيل ورسم بياني موجه (DAG).

الرخصة والتوافق مع GPL-3.0-or-later: CONFLICT — API يدّعي other/NOASSERTION، لكن الـ README يدّعي Apache 2.0.

مؤشر الصيانة: README مقروء في 2026-10-11T17:05:04Z؛ 0 نجوم، 0 شوكات.

النمط القابل للنقل: بوابة نماذج لغوية + سجل موجهات + ذاكرة وكيل + DAG.

عائلات المتطلبات: EXT-01.

التكرار مع قدرة D_AI القائمة: غير مؤكد قبل حسم الرخصة.

المخاطر والتعارضات: تعارض رخصة يحتاج حلاً قانونياً.

القرار: ADOPT_PATTERN_AFTER_X.

سبب القرار: رخصة CONFLICT تجبر ADOPT_PATTERN_AFTER_X؛ يحتاج حسمًا قانونياً من المالك.

### 12. OpenHands/openhands

المشكلة التي يحلها: منصة وكيل لتطوير البرمجيات (software-development agent platform).

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T11:55:14Z.

النمط القابل للنقل: منصة وكيل لتطوير البرمجيات.

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI مضيف أصلي وليس منصة وكيل خارجية.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض.

### 13. camel-ai/camel

المشكلة التي يحلها: إطار عمل متعدد الوكلاء (multi-agent framework).

الرخصة والتوافق مع GPL-3.0-or-later: Apache-2.0.

مؤشر الصيانة: 2026-10-19T09:33:36Z.

النمط القابل للنقل: إطار عمل متعدد الوكلاء.

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI ليست إطار عمل متعدد الوكلاء خارجياً.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض.

### 14. FoundationAgents/MetaGPT

المشكلة التي يحلها: إطار عمل متعدد الوكلاء، خامد حوالي 9 أشهر.

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-01-21T10:12:33Z؛ خامد حوالي 9 أشهر.

النمط القابل للنقل: UNVERIFIED — الـ README لم يُقرأ.

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI ليست رنタイム للوكلاء.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل؛ الرابط https://github.com/foundationagents/metagpt لم يُتحقَّق منه — تم استخدام Canonical FoundationAgents/MetaGPT.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض، بالإضافة إلى الخمول وعدم التحقق من الرابط البديل.

### 15. 2FastLabs/agent-squad

المشكلة التي يحلها: تنسيق متعدد الوكلاء على AWS Lambda.

الرخصة والتوافق مع GPL-3.0-or-later: Apache-2.0.

مؤشر الصيانة: 2026-10-08T09:03:31Z.

النمط القابل للنقل: تنسيق متعدد الوكلاء على AWS Lambda.

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI محلية في V1 ولا تعتمد على AWS Lambda.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل وتشغيل سحابي.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض.

### 16. dean0x/autobeat

المشكلة التي يحلها: رسم بياني موجه مع حلقات تقييم واستمرارية مقاومة للأعطال (crash-proof persistence).

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-06-07T17:14:51Z؛ خامد حوالي 4.5 أشهر؛ 6 نجوم.

النمط القابل للنقل: UNVERIFIED — الـ README لم يُقرأ.

عائلات المتطلبات: EXT-01.

التكرار مع قدرة D_AI القائمة: غير مؤكد قبل قراءة الـ README.

المخاطر والتعارضات: النمط غير مؤكد؛ المشروع خامد.

القرار: ADOPT_PATTERN_AFTER_X.

سبب القرار: الـ README لم يُقرأ؛ النمط غير مؤكد pending القراءة.

### 17. microsoft/agent-framework

المشكلة التي يحلها: إطار عمل للوكلاء (agent framework).

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T10:47:19Z.

النمط القابل للنقل: UNVERIFIED — الـ README لم يُقرأ.

عائلات المتطلبات: EXT-01.

التكرار مع قدرة D_AI القائمة: غير مؤكد قبل قراءة الـ README.

المخاطر والتعارضات: النمط غير مؤكد.

القرار: ADOPT_PATTERN_AFTER_X.

سبب القرار: الـ README لم يُقرأ؛ النمط غير مؤكد pending القراءة.

### 18. bytedance/deer-flow

المشكلة التي يحلها: بيئات تجريبية (sandboxes) / ذكريات / وكلاء فرعيون / مهارات / بوابة رسائل.

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T11:36:04Z.

النمط القابل للنقل: بيئات تجريبية / ذكريات / وكلاء فرعيون / مهارات / بوابة رسائل.

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI مضيف أصلي وليس رنタイム للوكلاء الفرعيين.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض.

### 19. AgenticGoKit/AgenticGoKit

المشكلة التي يحلها: نظام مدفوع بالأحداث مع اكتشاف MCP وقابلية للملاحظة (observability) بلغة Go.

الرخصة والتوافق مع GPL-3.0-or-later: Apache-2.0.

مؤشر الصيانة: 2026-08-01T03:56:57Z.

النمط القابل للنقل: حدثية + اكتشاف MCP + ملاحظة (Go).

عائلات المتطلبات: EXT-04.

التكرار مع قدرة D_AI القائمة: D_AI مضيف أصلي؛ لا يمكن تبنّي رنタイム خارجي.

المخاطر والتعارضات: يفترض امتلاك حلقة الوكيل.

القرار: REJECT.

سبب القرار: مصنف كرنタイム مرفوض.

### 20. TencentCloud/Octop

المشكلة التي يحلها: مواضيع تشمل المحلية أولاً (local-first) والذاكرة طويلة الأمد.

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T07:38:33Z.

النمط القابل للنقل: UNVERIFIED — الـ README لم يُقرأ.

عائلات المتطلبات: EXT-01.

التكرار مع قدرة D_AI القائمة: غير مؤكد قبل قراءة الـ README.

المخاطر والتعارضات: النمط غير مؤكد.

القرار: ADOPT_PATTERN_AFTER_X.

سبب القرار: الـ README لم يُقرأ؛ النمط غير مؤكد pending القراءة.

### 21. yeachan-heo/oh-my-claudecode

المشكلة التي يحلها: تنسيق متعدد الوكلاء يركز على الفرق ("Teams-first multi-agent orchestration").

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T10:37:35Z.

النمط القابل للنقل: UNVERIFIED — الـ README لم يُقرأ.

عائلات المتطلبات: EXT-04، INV-04.

التكرار مع قدرة D_AI القائمة: تشكيل تعليمي (instruction-shaped) — سطح حقن موجهات؛ تعليمات خارجية لا ترفع سلطتها فوق قرارات المالك.

المخاطر والتعارضات: تعليمات خارجية قد تدّعي تمثيل المالك وت Änder النطاق أو الصلاحية (INV-04).

القرار: REFERENCE_ONLY.

سبب القرار: تشكيل تعليمي خارجي يُستشهد به فقط دون تبنٍّ؛ سطح حقن موجهات يحتاج حماية من INV-04.

### 22. obra/superpowers

المشكلة التي تحلها: إطار عمل مهارات وكلي ومنهجية تطوير برمجيات ("agentic skills framework & software development methodology").

الرخصة والتوافق مع GPL-3.0-or-later: MIT.

مؤشر الصيانة: 2026-10-20T06:37:50Z.

النمط القابل للنقل: UNVERIFIED — الـ README لم يُقرأ.

عائلات المتطلبات: EXT-04، INV-04.

التكرار مع قدرة D_AI القائمة: تشكيل تعليمي خارجي — سطح حقن موجهات.

المخاطر والتعارضات: تعليمات خارجية قد ترفع سلطتها فوق قرارات المالك (INV-04).

القرار: REFERENCE_ONLY.

سبب القرار: تشكيل تعليمي خارجي يُستشهد به فقط دون تبنٍّ.

## التركيب (Synthesis): الأنماط القابلة للنقل والتجريدات المقترحة لـ D_AI

الأنماط المميزة التي تنهار إلى عدد من التجريدات قابلة لإعادة الاستخدام في D_AI:

1. **component manifest** — يسهم فيه cursor/plugins. يرتبط بعقد `component.registry`.
2. **playbook router** — يسهم فيه backnotprop/pstack. يرتبط بعقد `workflow.step` و `task`.
3. **advisor seat** — يسهم فيه mvschwarz/openrig. يرتبط بعقد `team.agent`.
4. **work ledger** — يسهم فيه gastownhall/gastown. يرتبط بعقد `memory.scope`.
5. **bundle audit log** — يسهم فيه mvschwarz/openrig. يرتبط بعقد `decision`.
6. **severity escalation** — يسهم فيه gastownhall/gastown. يرتبط بعقد `consultation`.
7. **session handoff** — يسهم فيه gastownhall/gastown. يرتبط بعقد `team.message`.

لا أحد من هذه التجريدات ينسخ شفرة المستودع الخارجي؛ كل منها يُعاد تطبيقه في ملفات D_AI الأصلية ويُربط بعقد معروفة.

## أنماط مرفوضة

الأنماط التالية تُرفض لأنها تفترض أن المستودع نفسه يشغل النماذج أو يملك حلقة الوكيل (D_AI مضيف أصلي بدون حلقة نموذج خفية): langgraph، crewai، camel، metagpt، openhands، deer-flow، agent-squad، open-multi-agent، AgenticGoKit. أنماطها قد تُستشهد بها؛ الرنタイム لا يُباعَد.

أيضاً، أسطح حقن الموجهات (prompt-injection surface) للمستودعات التشكيلية التعليمية (cursor/plugins، pstack، superpowers، oh-my-claudecode): التعليمات من مصدر خارجي لا ترفع سلطتها فوق قرارات المالك أو سياسة المشروع (INV-04).

## أسئلة الرخصة التي تحتاج حسم المالك القانوني

1. **cursor/plugins**: API ترخيص null، ملف LICENSE يعيد 404، لكن الـ README ينتهي بـ "License: MIT". تعارض يحتاج حلاً قانونياً.
2. **kienbui1995/magic**: API يدّعي other/NOASSERTION، لكن الـ README يدّعي Apache 2.0. تعارض يحتاج حلاً قانونياً.
3. **ag2ai/ag2**: Apache-2.0 يُدعى على صفحة GitHub، لكن حقل الرخصة UNVERIFIED والـ README جزئياً. يحتاج تحقق وحسماً قانونياً.

رخصة UNKNOWN تُجبر ADOPT_PATTERN_AFTER_X بدلاً من ADOPT_PATTERN؛ لا يمكن افتراض توافق الرخصة قبل حسم المالك.

## الحالة غير المؤكدة والخطوة التالية

ما يزال غير مؤكد (UNVERIFIED): النمط القابل للنقل لـ tester-army/e2e، dean0x/autobeat، microsoft/agent-framework، TencentCloud/Octop، yeachan-heo/oh-my-claudecode، obra/superpowers؛ وحقل الرخصة وتاريخ النشاط لـ ag2ai/ag2؛ والرابط https://github.com/foundationagents/metagpt لم يُتحقَّق منه. الخطوة التالية: قراءة ملفات README للمستودعات التي تحمل UNVERIFIED وتحديث القرارات من ADOPT_PATTERN_AFTER_X إلى ADOPT_PATTERN أو REFERENCE_ONLY حسب ما يُثبته القراءة.
