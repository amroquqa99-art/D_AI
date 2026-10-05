# خطة تنفيذ D_AI

## 1. قرار البدء

القرار الحالي هو `GO` للتخطيط وتأسيس المستودع، و`GO مشروط` لـReality Check بعد اعتماد المالك، و`NO-GO` لأي تنفيذ شامل أو استخدام حساس قبل اجتياز بوابات الأمن والاستمرارية الخاصة به. لا يبدأ كود D_AI من افتراض معماري غير مثبت؛ تبدأ المرحلة الأولى بتشغيل المصدر المثبت وقياسه.

الهدف الأول القابل للتسليم ليس الأنظمة الستة دفعة واحدة. الهدف هو إصدار داخلي يثبت: D_AI profile أصلي داخل Harness، تسجيل الأنظمة الستة، عمود تشغيل آمن ودائم، ومسار Investigation واحد من إنشاء المهمة حتى تقرير محفوظ ومدعوم بأدلة وواجهة وموافقة واسترداد بعد restart.

## 2. مبادئ التنفيذ

- يظل D_AI fork حقيقيًا، لكن التوسعة تستخدم plugins/profiles/bundles الخاصة بـHarness قبل تعديل core.
- كل milestone ينتهي بسلوك قابل للتشغيل ودليل قبول، لا بعدد ملفات أو شاشات.
- الأمن والهوية وتصنيف البيانات والتدقيق والاستمرارية workstreams تبدأ مبكرًا وتستمر في كل مرحلة.
- تستخدم المعمارية Modular Monolith مع workers معزولة أولًا، ثم تفصل الخدمات عند وجود قياسات تستدعي ذلك.
- المنصة local-first: التحكم والتخزين محليان افتراضيًا، والتكاملات الخارجية optional ومقيدة بالسياسة.
- تنفيذ الأدوات المؤثرة at-least-once مع idempotency وreconciliation؛ لا يُدّعى exactly-once مع الأنظمة الخارجية.
- كل نتيجة AI غير موثوقة بذاتها؛ الادعاءات المهمة تحتاج provenance وحالة تحقق وأدلة مؤيدة ومعارضة.
- الأنظمة الستة تُسجل مبكرًا كـmanifests، لكن حالة التسجيل لا تعني تنفيذ قدراتها.
- لا تدريب تلقائي على بيانات التشغيل. جمع بيانات التدريب opt-in ويعبر governance pipeline منفصلة.

## 3. نطاق الإصدارات

### Release A — Investigation Internal Alpha

يشمل fork مثبتًا، D_AI boot، الهوية ومساحة العمل، System Registry للأنظمة الستة، Mission/DAG/agents، tool/model gateway، سياسة وموافقات وتدقيق، evidence/artifacts، Investigation end-to-end، minimum Command Center، الاسترداد والمراقبة والنسخ الاحتياطي الأساسي. لا يشمل استخدامًا إنتاجيًا حساسًا أو قدرات المجالات الخمسة المكتملة.

### Release B — Multi-domain Beta

يضيف البحث العلمي والمستثمر والأمن السيبراني والعمليات والابتكار كموجات مستقلة، وعقود التعاون بينها، وواجهة أوسع واختبارات مجال يراجعها خبراء. Cyber وOperations يظلان في lab/simulation أو نطاقات مصرح بها حتى بوابة مستقلة.

### Release C — Controlled Pilot

يضيف النواة المحلية التجريبية، hardening شاملًا، restore/migration drills، اختبارات اختراق، مراجعات قانونية ومجالية، وتشغيل pilot ببيانات منخفضة الحساسية قبل قرار إنتاج مستقل لكل مجال.

## 4. المراحل

### M0 — التخطيط والمستودع

**الهدف:** تحويل الحزمة إلى مرجع قابل للاستمرار والمراجعة.

**المخرجات:** مستودع خاص، upstream مثبت، المواصفات الأصلية، خطة ومعمارية مقترحة، قرارات ومخاطر، ملف حالة وبروتوكول checkpoints.

**القبول:** يستطيع طرف جديد معرفة ما تم وما لم يبدأ والخطوة التالية من `PROJECT_STATE.md`؛ لا يوجد ادعاء تنفيذ أو اختبار غير حاصل.

**الحالة:** مكتمل في checkpoint التخطيط، بانتظار مراجعة المالك.

### M1 — Harness Reality Check | P0

**الهدف:** تثبيت الحقيقة التشغيلية قبل أي تصميم نهائي.

**المهام:**

- تثبيت Node/pnpm والمتطلبات بحسب المصدر، ثم `install`, focused tests, typecheck, build، وتشغيل Web/headless من fresh clone.
- جرد package graph وprofiles/bundles وCordis lifecycle وsession formats وjobs/workflow/storage/agent-team/tools/sandbox/UI slots.
- تشغيل baseline على جهاز التطوير المرجعي وقياس وقت البناء، startup، RAM/CPU/GPU ومساحة القرص.
- فحص install scripts والتبعيات والأسرار والثغرات وSBOM الأولي والتعرض الشبكي.
- تحديد ما يمكن تنفيذه كplugins وما يحتاج core patch، وتحديد مصدر الحقيقة لكل نوع state.
- إنشاء `HARNESS_DELTA.md`, `ARCHITECTURE.md`, `FEATURE_MATRIX.md`, `TEST_REPORT.md` وسجل ADRs.

**بوابة الخروج:** fresh clone يعمل من scripts الرسمية، النتائج قابلة للإعادة، المخالفات معروفة، وقرار GO/REPLAN موثق. فشل baseline غير المفسر يوقف M2.

**الجهد الأولي:** 6–10 أسابيع هندسية؛ يعاد تقدير كل المشروع بعده.

### M2 — Native D_AI Shell and System Registry | P1–P2

**الهدف:** تشغيل D_AI كتركيب أصلي داخل Harness مع حدود هوية ومساحة عمل صحيحة.

**المهام:**

- إنشاء D_AI profile/bundle عبر extension paths المعتمدة، مع branding/config منفصلين وإبقاء upstream remote.
- تأسيس actor/organization/workspace identifiers حتى لو كان الإصدار الأول single-owner.
- إنشاء System Manifest schema وruntime API version وcompatibility validation.
- تسجيل الأنظمة الستة مع manager reference وtools/policies/workflows/evals/UI metadata؛ تبقى capabilities غير المنفذة معلنة بصدق.
- health endpoint/UI، Feature Matrix، boot validation، migrations baseline، secure local defaults.
- App Shell أولي عربي/إنجليزي مع context header وحالة الاتصال وFeature Status.

**اختبارات القبول:** تشغيل Web من أمر DSH الرسمي، health/session/tool paths حقيقية، manifests الستة تمر validation، enable/disable/upgrade لنظام fixture يعمل دون تعديل core واسع، وعزل workspace يُفرض في API/storage skeleton.

**بوابة الأمن:** auth/session model، CSRF/CORS/CSP، actor attribution، secret handling، tenant/workspace scoping، وdeny-by-default للنظام/الأداة.

**الجهد الأولي:** 18–28 أسبوعًا هندسيًا.

### M3 — Safe Durable Platform Spine | P3–P4–P6

**الهدف:** إنشاء عمود تشغيل دائم وآمن قبل استخدام مجال فعلي.

**المهام:**

- Mission lifecycle ونسخ الخطط وTask DAG مع cycle detection.
- scheduler/workers مع leases, heartbeats, retry/backoff, fencing, checkpoints وtransactional outbox.
- agent instances حقيقية بهويات وسياقات وعلاقات parent/child وlimits وhandoff دائم.
- model registry/router وtool gateway منخفض المخاطر، مع sandbox وegress policy.
- budget reservations والاستهلاك وkill switch وsafe pause.
- PDP/PEP للسياسة، grants منتهية، approval مرتبط بـoperation hash، وaudit tamper-evident أولي.
- side-effect journal وidempotency/reconciliation.

**اختبارات القبول:** parent→child→grandchild فعلي، فرعان متوازيان ضمن limit، 1000 logical tasks بconcurrency منخفض، crash قبل/بعد tool result، restart/recovery، وعدم تكرار side effect مسجل؛ حالات WAITING/BLOCKED فعالة؛ revoke يوقف الاستعمال فورًا.

**بوابة الخروج:** لا تُبنى رحلة مجال قبل مرور اختبارات crash/policy/isolation الأساسية. التكامل غير الحي يبقى fixture واضحًا.

**الجهد الأولي:** 40–60 أسبوعًا هندسيًا.

### M4 — Evidence, Memory and Artifacts | P5

**الهدف:** جعل كل نتيجة مهمة قابلة للتتبع وإعادة البناء.

**المهام:**

- raw event log وإسقاطات versioned قابلة لإعادة البناء.
- Source, Claim, Evidence, Observation, Hypothesis, Verification وConfidence schemas.
- supporting/opposing/contradiction links ونسخ immutable بدل overwrite.
- Artifact Store content-addressed مع hashes وmetadata وlineage.
- scoped memory وretrieval مع classification وuntrusted-content envelope.
- relational knowledge graph والبحث النصي/الدلالي في البداية.
- chain of custody، retention/deletion hooks، export/backup baseline.

**اختبارات القبول:** كل claim مادي في fixture مرتبط بدليل أو موسوم unsupported؛ provenance مكتمل؛ projection يُعاد من events؛ artifact tampering مكتشف؛ لا تسرب retrieval بين workspaces؛ محتوى مسترجع يحاول تغيير policy ويفشل.

**الجهد الأولي:** 28–45 أسبوعًا هندسيًا.

### M5 — Investigation Vertical Slice | P7 + جزء من P15

**الهدف:** إثبات المنتج في رحلة واحدة حقيقية ومحدودة.

**المهام:**

- intake ونطاق وتحويله إلى hypothesis tree وDAG.
- manager وworkers وverifier مستقلون، وأداة بحث/وثائق حقيقية منخفضة المخاطر أو تكامل حي مصرح محدود.
- entity resolution، timeline، تناقضات، فجوات، confidence مفسر، وتقرير دائم.
- Mission Control، DAG، Agent view، Evidence Explorer، Approval view، Artifact report.
- dataset تقييم مغلق وfixtures قانونية مع مراجعة خبير تحقيق.

**اختبارات القبول:** مهمة من UI إلى تقرير محفوظ، تعبر Manager→worker→verifier وأداة فعلية، تنجو من restart، وتتيح الانتقال من التقرير إلى claim إلى المصدر. العربية/الإنجليزية والkeyboard flow والحالات blocked/failure/recovery تمر.

**بوابة المجال:** benchmark ومعايير دقة/تغطية/استشهاد قبل الاختبار، ولا توسع إلى مجال آخر إن لم يثبت المسار الكامل.

**الجهد الأولي:** 30–45 أسبوعًا هندسيًا.

### M6 — Resilience, Observability and Operational Baseline | P16 + جزء من P17

**الهدف:** جعل Alpha قابلًا للتشغيل المتكرر والتشخيص والاستعادة.

**المهام:**

- OpenTelemetry metadata-first، health dashboards، queue/provider/tool/model/resource/cost metrics.
- network/provider loss، offline queues، degraded mode، sync reconciliation.
- backup مشفر وrestore إلى بيئة نظيفة، runbooks وRPO/RTO معتمدين.
- rate limits, quotas, circuit breakers، redacted logs، incident response skeleton.
- dependency/SAST/secret/SBOM checks في CI، وrelease artifacts أولية.

**اختبارات القبول:** provider/network/process loss لا يفقد committed state؛ restore يحافظ missions/evidence/audit؛ secrets/content الحساس لا يظهر في telemetry؛ audit failure يوقف الإجراءات الحساسة fail-closed.

**الجهد الأولي:** 20–35 أسبوعًا هندسيًا، ويجري جزء كبير منه بالتوازي مع M3–M5.

### M7 — Scientific Research Slice | P8

**الرحلة:** سؤال→literature graph→gap→تصميم تجربة→WAITING_FOR_HUMAN→إدخال النتيجة→تحقق→تقرير قابل لإعادة الإنتاج.

**متطلبات خاصة:** حقوق المصادر، methodology/versioning، statistical checks، IRB/ethics عند البشر أو الصحة، وفصل البيانات المقيدة عن التقرير القابل للمشاركة.

**القبول:** fixture ودراسة مرخصة، تقرير يعيد إنشاء الحسابات من artifacts مثبتة، ومراجعة باحث مجال.

### M8 — Investor Slice | P9

**الرحلة:** بيانات مالية مؤرخة ومصدرها واضح→thesis→valuation/scenarios→risk→portfolio effect→change alert.

**متطلبات خاصة:** منع leakage في backtesting، فصل MNPI، license لبيانات السوق، ولا تداول تلقائي.

**القبول:** dataset تاريخية مثبتة، مقارنة benchmark، وكل رقم في التقرير قابل للتتبع إلى مصدر/تحويل.

### M9 — Cybersecurity Slice | P10

**الرحلة:** signed scope manifest لمختبر مصرح→asset/scan/analysis→finding قابل للإعادة→remediation→retest.

**متطلبات خاصة:** lab افتراضي، passive/active/destructive taxonomy، egress/target enforcement، dual approval للأفعال العالية، kill switch.

**القبول:** محاولة target خارج scope تُرفض في runtime؛ الاختبارات على lab فقط؛ الأدلة والcleanup وسجل الأداة مكتملة.

### M10 — Operations & Intelligence Slice | P11

**الرحلة:** workspace قضية/عملية→ingest أدلة مصرح بها من Investigation/Cyber/field fixtures→network/timeline→hypotheses/gaps→scenarios/options→audit.

**متطلبات خاصة:** need-to-know، purpose/authority، حماية المصادر، chain of command، two-person approval، ولا autonomous field action.

**القبول:** بيانات محاكاة أو منخفضة الحساسية فقط حتى مراجعة قانونية وأمنية مستقلة.

### M11 — Innovation & Discovery Slice | P12

**الرحلة:** مشكلة→مسارات تخصصية مستقلة→فرضيات→critic/counterexample→simulation/math/prior-art→VERIFIED/REFUTED/OPEN/NEEDS_EXPERIMENT→artifact→handoff للبحث.

**متطلبات خاصة:** تعريف نوع التحقق بدل حكم LLM، IP/license، وسلامة التجارب المادية/الحيوية.

**القبول:** benchmark يتضمن مسائل مع counterexamples وفشل متوقع، مع فصل نتائج المحاكاة عن التحقق التجريبي.

**جهد M7–M11 المجمع:** 140–220 أسبوعًا هندسيًا؛ تنفذ كموجات بقرارات Go/No-Go مستقلة، ولا يبدأ المجال التالي تلقائيًا.

### M12 — Cross-System Collaboration | P13

**الهدف:** وصل الأنظمة دون خلط الذاكرة أو تجاوز التصنيف.

**المهام:** cross-system envelope، scoped artifact/claim references، grant مع purpose/expiry/classification، budget attribution، collaboration rooms.

**القبول:** المسارات الأربعة المطلوبة تعمل مع origin/destination/agent/permission/evidence/cost/result، ومحاولة نقل غير مصرح تُرفض وتدقق.

### M13 — Local Intelligence Core Foundation | P14

**الهدف:** تأسيس مسار تحسين محلي قابل للقياس، لا وعد تدريب واسع.

**المهام:** eligibility/consent، de-identification، dataset snapshots، train/eval split، model registry/cards، lineage، local inference adapters، تجربة LoRA/SFT صغيرة، promotion approval وrollback.

**القبول:** opt-out لا يدخل dataset؛ holdout مغلق وغير ملوث؛ before/after منشور حتى لو لم يتحسن المرشح؛ اختبار memorization/privacy؛ rollback مثبت.

**الجهد الأولي:** 30–50 أسبوعًا هندسيًا.

### M14 — Command Center Completion | P15

**الهدف:** إكمال الواجهات المشتركة والتخصصية بعد ثبات العقود.

**المهام:** registries، System Studio محدود، graphs/maps/timelines، global search، notifications، budgets/resources، audit، experiments، backup/import/export، feature truth، responsive approval views.

**القبول:** البيانات تأتي من runtime حقيقي؛ deep links وحالات stale/offline/error؛ WCAG 2.2 AA؛ visual regression عربي/إنجليزي وLight/Dark؛ بديل جدولي لكل رسم.

### M15 — Security and Release Hardening | P17–P18

**الهدف:** تجهيز release candidate قابل للتدقيق.

**المهام:** pentest مستقل، SAST/SCA/DAST/secret scans، fuzz parsers/policy inputs، sandbox/egress drills، signed release+SBOM+provenance، migration rehearsal، restore drill، incident tabletop، fresh Arch setup، known limitations.

**بوابة الخروج:** لا Critical/High مفتوح للاستخدام المستهدف؛ restore وrollback مثبتان؛ feature matrix دقيقة؛ كل Live Verified له دليل محفوظ.

**الجهد الأولي:** 50–80 أسبوعًا هندسيًا.

### M16 — Controlled Pilot

**الهدف:** قياس الجودة والتكلفة والاعتمادية على نطاق منخفض الحساسية قبل الإنتاج.

**المدة:** 12–24 أسبوعًا تقويميًا بعد release candidate.

**القبول:** SLOs وتكلفة وجودة مجال ومراجعة قانونية وأمنية وخبير مجال. قرار الإنتاج يصدر لكل مجال على حدة.

## 5. المسار الحرج والعمل المتوازي

المسار الحرج هو: `M1 → M2 → M3 → M4 → M5 → M6 → M15 → M16`. لا يمكن تعويض فشل الاستمرارية أو السياسة بعمل واجهة أو مجال إضافي.

بعد M1 يمكن تنفيذ مسارات متوازية مضبوطة:

- UX/design system وRTL فوق عقود App Shell، دون اختراع API نهائي.
- manifests/eval fixtures للأنظمة الستة دون إعلان capabilities منفذة.
- security threat model وpolicy ontology وdata governance بالتوازي مع schemas.
- CI, observability, backup harness وfailure fixtures بالتوازي مع runtime.
- خبراء المجالات يجهزون benchmarks وحقوق البيانات قبل بدء كل slice.

## 6. التقدير والطاقم

هذه الرؤية أكبر من تطبيق واحد. قبل M1، التقدير الأنسب نطاقي:

- Investigation Internal Alpha: نحو 100–170 أسبوعًا هندسيًا، أو 5–8 أشهر تقويمية لفريق 5–7 أشخاص ذوي خبرة مع تداخل الأعمال.
- Multi-domain Beta: إجمالي 280–470 أسبوعًا هندسيًا، أو 12–20 شهرًا حسب الخبراء والتكاملات.
- Controlled sensitive production: إجمالي تقريبي 380–600 أسبوع هندسي و18–30 شهرًا مع pilot وتدقيق مستقل.

فريق النواة المقترح: قائد معماري/تقني، 2–3 backend/runtime، frontend/UX، security/platform، QA/SRE، وML/data جزئي يتحول إلى كامل قبل M13، مع خبراء مجال حسب الموجة. فريق من 2–3 أشخاص يجب أن يثبت Investigation Alpha فقط ويؤجل بقية المجالات.

## 7. بوابات Go/No-Go

- `G0 Source`: baseline يعمل، SHA والترخيص وسياسة fork مثبتة.
- `G1 Scope`: MVP والمستخدمون والنشر والبيانات والحدود الحساسة معتمدة.
- `G2 Durable Safety`: crash/retry/isolation/policy/audit tests تمر قبل أي مجال حي.
- `G3 Evidence`: provenance وunsupported claims وprompt-injection tests تمر.
- `G4 Domain`: benchmark وحقوق بيانات وخبير ومعايير فشل قبل كل slice.
- `G5 Training`: consent/lineage/holdout/privacy وrollback قبل أي model promotion.
- `G6 Pilot`: security review وrestore/release/SLO/domain sign-off قبل استخدام حساس.

## 8. ما يُؤجل عمدًا حتى تثبت الحاجة

لا يبدأ المشروع بـKubernetes أو Kafka أو Redis أو Neo4j أو OpenSearch أو Temporal أو microservices كاملة. تُحفظ منافذ الاستبدال، ويُعتمد الفصل عندما تثبت queue depth أو graph latency أو search volume أو deployment topology الحاجة. كذلك لا يبدأ System Creation Wizard المفتوح ولا auto-training ولا trading ولا active cyber خارج المختبر في Release A.
