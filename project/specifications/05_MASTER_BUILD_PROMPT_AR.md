# D_AI — MASTER AUTONOMOUS BUILD PROMPT v2

## الدور
أنت Principal Software Architect + Lead Engineering Orchestrator مسؤول عن بناء D_AI كمنتج برمجي حقيقي داخل Fork مستقل من DeepSeek Harness.

المطلوب تنفيذ المشروع، لا تلخيصه ولا تحويله إلى مجموعة Prompts أو mock architecture.

اقرأ بالترتيب:
1. `01_LOCKED_SPECIFICATION_AR.md`
2. `02_SYSTEMS_CONTRACTS_AR.md`
3. `03_CORE_PLATFORM_CAPABILITIES_AR.md`
4. `04_ACCEPTANCE_MATRIX_AR.md`

اعتبرها المرجع المعتمد. لا تختصرها إلى تصور سطحي.

## 1. قاعدة البناء
- ابدأ من المصدر الحقيقي لـ DeepSeek Harness.
- Pin upstream SHA.
- افحص البنية الحقيقية قبل تعديلها.
- ابنِ D_AI داخل native package/profile/plugin/runtime paths التي يدعمها الإصدار الفعلي.
- لا تعتمد على Wrapper خارجي باعتباره المنتج.
- أي core patch يجب توثيقه في HARNESS_DELTA.md.
- احتفظ بإمكانية استبدال Harness مستقبلًا عبر interfaces واضحة.

## 2. الأنظمة الإلزامية
سجل منذ البداية الأنظمة الستة كـFirst-Class Systems:
- Investigation.
- Scientific Research.
- Investor.
- Cybersecurity.
- Operations & Intelligence.
- Innovation & Discovery.

كل نظام يحتاج manifest, version, System Manager, tool policy, workflows, memory scope, eval suite, UI registration, cross-system contract.

لا تعتبر مجلدًا فارغًا أو prompt implementation كافيًا.

## 3. النواة المحلية
عامل Local Intelligence Core كهدف أساسي للمنتج.

نفذ foundation حقيقي يشمل:
- model registry.
- dataset governance.
- usage-data eligibility rules.
- opt-in/opt-out.
- dataset builder.
- evaluation harness.
- experiment lineage.
- local inference adapters.
- training/adapter experiment path.
- comparison and rollback.

لا تدرب تلقائيًا على كل شيء. أي بيانات حساسة أو منخفضة الجودة يجب ألا تدخل التدريب دون سياسة صريحة.

## 4. الوكلاء
نفذ وكلاء حقيقيين مستقلين عند دعم runtime/provider لذلك.

يجب أن تتوفر:
- unique agent identity.
- isolated context.
- parent/child relation.
- per-agent model/tool policy.
- persistent state.
- performance history.
- bounded concurrency.
- artifact/evidence handoff.

لا تمثل أدوارًا داخل prompt واحد ثم تسميها Multi-Agent.

## 5. Mission Engine
أي مهمة كبيرة تمر عبر:
1. intake.
2. scope.
3. system selection.
4. planning.
5. task DAG.
6. agent allocation.
7. tool execution.
8. evidence capture.
9. verification.
10. synthesis.
11. human approval عند الحاجة.
12. persistence/report.

المهمة يجب أن تستمر عبر restart وفقد provider.

## 6. Evidence-first Architecture
كل claim مهم يملك provenance. افصل observation عن inference عن hypothesis.

نفذ:
- evidence store.
- claim graph.
- source metadata.
- contradiction links.
- verifier state.
- confidence explanation.

## 7. الصلاحيات
نفذ authorization داخل runtime.

السياسة قادرة على تقييد system/tool/data/target/time/budget/classification/action.

الصلاحيات يمكن أن تكون مؤقتة أو دائمة.

كل إجراء حساس يمكن أن يحتاج approval.

## 8. Tool Gateway
الهدف Tool Gateway موحد وقابل للتوسعة.

ابدأ بالأدوات التي يمكن إثباتها فعليًا، ثم أضف connectors تدريجيًا. لا تدّع وجود GIS أو financial feed أو cyber capability إذا لم يكن هناك implementation حقيقي.

الأدوات الخارجية وweb/document content تعتبر untrusted input ولا تملك حق تعديل policy أو منح نفسها صلاحيات.

## 9. Cross-System Collaboration
يجب أن يستطيع نظام استدعاء نظام آخر عبر contract واضح، لا عبر خلط الذاكرة عشوائيًا.

كل cross-call يسجل:
origin system, destination, agent, permission, evidence, cost, result.

## 10. متطلبات المجالات

### Investigation
Hypothesis tree، multi-source research، entity resolution، temporal/geospatial reasoning، evidence chaining، contradiction detection، alternative explanations، auditable report.

### Scientific Research
Literature/research graph، gaps، methodology، statistics، experiment design، WAITING_FOR_HUMAN، reproducibility، researcher-provided hypotheses/files/data/resources/budget.

### Investor
financial statements، company/market/event analysis، ownership/influence context، valuation، scenarios، risk، portfolio impact، backtesting safeguards، thesis tracking.

### Cybersecurity
asset/threat/vulnerability analysis، code/config review، hardening، forensics، isolated/authorized testing، reproducible findings، remediation/retest، runtime scope enforcement.

### Operations & Intelligence
case/operation workspace، entity/network/timeline analysis، field+digital evidence integration، tactics/pattern analysis، counter-intelligence context، intelligence gaps، exposure estimate، scenario/options analysis، human command approval for sensitive actions.

### Innovation & Discovery
multi-disciplinary agent teams، first-principles، problem reframing، hypothesis generation، counterexample/critic agents، simulation/math validation، novelty/prior-art checks، failed hypothesis memory، handoff to scientific research.

## 11. Value of Information
نفذ خدمة تقارن قيمة خطوة البحث التالية مقابل التكلفة والوقت والمخاطر، وتستخدمها في ترتيب الأولويات.

## 12. UI
لا تبنِ Chat page فقط.

الحد الأدنى:
- Mission Control.
- Agent Terminal.
- Task DAG.
- Evidence/Knowledge Explorer.
- Timeline.
- System Studio.
- Tool/Model Registry.
- Artifact Vault.
- Budget/Resource Monitor.
- Approvals/Audit.
- Feature status.
- Arabic/English RTL/LTR.

## 13. Observability
أظهر:
- active agents.
- queued/running tasks.
- provider/model route.
- cost.
- tokens.
- tool calls.
- errors.
- retries.
- resource use.
- evidence count.
- mission state.

## 14. Feature Truth
كل feature تحمل status واحدًا:
FOUNDATION / PARTIAL / INTEGRATED / TESTED / LIVE-VERIFIED.

ممنوع استخدام كلمة Done إذا لم تمر بقبولها الفعلي.

## 15. مراحل التنفيذ

### Phase 0 — Reality Check
Inspect repo, upstream docs, packages, scripts, tests, runtime, providers. Build/start baseline. سجل الحقيقة.

### Phase 1 — Native D_AI Shell
D_AI profile/package/web workspace داخل Harness مع System Registry وHealth وFeature Matrix.

### Phase 2 — Mission + Agent + Evidence Vertical Slice
Investigation أولًا: mission -> system manager -> real subagent -> real tool -> evidence -> verification -> persisted report -> UI.

### Phase 3 — Durability
Task DAG, scheduler, queues, leases, retries, restart recovery, WAITING_FOR_HUMAN, budgets.

### Phase 4 — Shared Intelligence
Memory, knowledge/evidence graph, cross-system rooms, permissions, approvals, audit.

### Phase 5 — Six Domain Vertical Slices
نفذ acceptance لكل نظام بالترتيب الذي يخدم الاعتماديات، مع بقاء الأنظمة الستة مسجلة منذ البداية.

### Phase 6 — Local Intelligence Core Foundation
model registry + dataset governance + eval + local inference + controlled training experiment + before/after comparison + rollback.

### Phase 7 — UI/RTL/Offline/Security
اكتمال command center، RTL، observability، hardening، offline behavior.

### Phase 8 — Verification & Delivery
fresh clone، migrations، tests، docs، known limitations، reproducibility، backup/export/import.

## 16. بروتوكول التنفيذ
- نفذ تغييرات حقيقية على الملفات.
- اختبر بعد كل milestone.
- استخدم branches/worktrees عند وجود عدة عمال حقيقيين.
- لا تختلق أدوات أو agent spawns غير موجودة.
- لا تطلب معلومات سبق تثبيتها في المواصفات.
- لا توقف العمل بسبب نقص provider إذا كان بإمكانك تنفيذ بقية البنية؛ فقط وسم live integration كـblocked.
- القرارات الجوهرية فقط ترفع كـADR للمالك.
- التحسينات التنفيذية الروتينية نفذها مباشرة.

## 17. تقرير كل Checkpoint
أخرج:
- Delivered files/commits.
- Exact tests + pass/fail.
- Live integrations proven.
- Mock/fixture-only paths.
- Feature statuses.
- Blockers.
- Security/resource notes.
- Next ready task.

## 18. معيار النجاح
D_AI ناجح عندما يصبح بيئة تشغيل واحدة حقيقية تجمع الأنظمة الستة والنواة المحلية والوكلاء والذاكرة والأدوات والأدلة والصلاحيات داخل runtime متماسك، وليس عندما يصبح لدينا عدد كبير من الملفات أو النصوص الجميلة.

ابدأ الآن من Phase 0، وافحص المستودع الحقيقي ثم نفّذ أول vertical slice فعلي.
