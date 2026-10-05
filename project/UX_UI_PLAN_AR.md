# خطة تجربة المستخدم والواجهة

## النموذج الذهني

D_AI مساحة عمليات معرفية وليست صفحة محادثة. التسلسل الرئيسي هو Organization → Workspace/Project → Mission → Plan/Tasks/Agents/Evidence/Artifacts/Budgets/Approvals/Audit. يجب أن يعرف المستخدم من كل شاشة أين يعمل، حالة المهمة وسبب توقفها، ما يفعله الوكلاء، الأدلة وراء النتيجة، والعائق التالي.

## هيكل المعلومات

التنقل العام المقترح: مركز القيادة، المهمات، الأنظمة، المعرفة والأدلة، Artifact Vault، المختبر والتجارب، النماذج والأدوات، الموافقات والتدقيق، الصحة والموارد، والإعدادات.

داخل المهمة: overview، plan/DAG، agents، claims/evidence، timeline، map عند الحاجة، artifacts، budgets، approvals، activity/audit، scope/policy. تستخدم الصفحات deep links وتحفظ المرشحات في URL عندما لا تحتوي معلومات حساسة.

## الشاشات المشتركة

1. الإعداد الأول وفحص البيئة والمزودين.
2. Mission Control وقائمة المهمات.
3. معالج إنشاء مهمة ومعاينة الخطة والموافقات المتوقعة.
4. صفحة المهمة وTask DAG.
5. Agent tree/terminal.
6. Evidence and Claim Explorer.
7. Knowledge graph وtimeline وmap.
8. Artifact Vault والملفات والتقارير.
9. Human Tasks وApprovals.
10. Audit وBudget/Resource Monitor.
11. Tool وModel Registry.
12. System Registry وSystem Studio المقيد.
13. Cross-system rooms.
14. Global Search وNotifications.
15. System Health وFeature Status.
16. Lab/Experiments/Lineage.
17. Data classification/retention/training settings.
18. Backup/Export/Import.

الشاشات التخصصية تبنى كامتدادات لنمط مهمة مشترك عبر manifest/slots: فرضيات وكيانات للتحقيق، literature/experiment للبحث، thesis/scenarios للمستثمر، scope/findings للأمن، operational picture للعمليات، وcandidate paths/critics/simulations للابتكار.

## التدفقات المرجعية

### إنشاء مهمة

هدف أو template → اختيار الأنظمة → scope والتصنيف والأهداف المسموحة → مصادر/ملفات → local/cloud policy → tools/permissions → budgets → معاينة plan/DAG/approvals → إطلاق → مراقبة وإيقاف آمن.

### موافقة بشرية

تعرض action والسبب والهدف والبيانات المغادرة والخطر والكلفة والمدة والبدائل. يستطيع المخول approve once أو grant مؤقتًا أو reject/modify. تؤكد الواجهة القرار بعد قبول runtime فقط، والضغط المتكرر لا يكرر العملية.

### مراجعة الأدلة

يختار المستخدم claim فيرى النوع والمصدر والوقت والجامع والثقة والتحقق والأدلة المؤيدة والمعارضة، ثم ينتقل إلى المصدر الأصلي ويعود دون فقد السياق. تفصل الواجهة observation/inference/hypothesis بصريًا ونصيًا.

### WAITING_FOR_HUMAN

يعرض المطلوب والمنهجية والصيغ والموعد وتأثيره على DAG. يفحص الإدخال ويعرض ما سيستأنف، ويحفظ نتيجة الإنسان كحدث مميز عن مخرجات الوكلاء.

### Offline/Recovery

توضح الواجهة ما يعمل محليًا وما توقف وما ينتظر sync وآخر وقت تحديث. تحل conflicts على مستوى record/artifact، ولا توحي بأن cloud tool يعمل أثناء انقطاع provider.

### Safe Pause/Kill

يختار المستخدم mission/agent/tool/provider، يرى العمليات الجارية وقابلية الإلغاء والآثار الجانبية، ثم يحفظ checkpoint ويسجل السبب والفاعل.

## حالات الواجهة

حالات runtime تعرض كما هي، مع حالات presentation مشتقة مثل Draft, Planning, Queued, Recovering, Pausing, Degraded, Sync Pending, Stale Data, Permission Revoked وProvider Unavailable. لكل شاشة loading, empty, partial, retryable error, permission error, stale/offline وsuccess.

سبب الحظر والإجراء التالي يبقيان ظاهرين في سياق المهمة؛ لا يعتمد العطل على toast عابرة.

## Design System

- semantic tokens للألوان والمسافات والخطوط والحدود والحركة والطبقات.
- Light/Dark/High Contrast، وكثافة comfortable/compact.
- خط عربي محلي متناسق مع اللاتيني وmonospace للكود والمعرفات.
- الحالة لا تعتمد على اللون؛ يرافقها نص ورمز.
- classification label ثابت في المساحات والمواد الحساسة.
- المكونات الأساسية: App Shell، Context Header، tables، status/confidence/classification، DAG/graph/map containers، evidence/claim/source cards، approval/policy panels، agent terminal، budgets، file/artifact preview، diff، forms، blocked/offline/error states.
- كل DAG/graph/chart له بديل جدولي أو شجري قابل للبحث والتصدير.

## العربية والإنجليزية

- `dir` على مستوى الوثيقة مع `bdi`/LTR isolation للdomains/hashes/paths/code/math.
- CSS logical properties، وعكس directional icons فقط.
- ICU MessageFormat، ومعرفات runtime ثابتة تعرض بتسميات مترجمة.
- Glossary عربي/إنجليزي لمصطلحات Mission, Claim, Evidence, Artifact, Grant, Scope, Checkpoint, Lineage.
- اختبارات نص مختلط وأرقام وتواريخ ومناطق زمنية وتشكيل ونسخ/لصق وبحث.
- العربية هي default المقترح، والواجهة Desktop-first مع responsive للقراءة والموافقات؛ يحتاج المالك اعتماد القرار.

## الوصولية

الهدف WCAG 2.2 AA: keyboard كامل، focus واضح، skip links/landmarks/headings، focus management، live regions للأحداث المهمة فقط، target sizes، contrast، zoom/reflow، reduced motion، tables معنونة، بدائل للرسوم، ورسائل أخطاء مرتبطة بالحقول. يختبر قارئ شاشة فعلي بالعربية والإنجليزية.

## Frontend Architecture

يُحسم framework بعد M1؛ المصدر الحالي TypeScript ويملك client plugin system. التنظيم المنطقي: app shell وcore UI، features للمهمات والوكلاء والمهام والأدلة والمعرفة والموافقات والتدقيق والميزانيات والنماذج والأدوات والصحة، system extensions، visualizations، i18n، API client، event stream، offline وtesting.

الواجهة تفصل server state عن UI state والمسودات. البيانات الأساسية تأتي من durable snapshots/endpoints والبث للتحديث فقط، مع event IDs وcatch-up. الصلاحيات يفرضها runtime. registration للأنظمة/الأدوات/evidence/workflows ديناميكي. cache المحلي يعتمد التصنيف. Feature Status يأتي من backend evidence ولا ترفعه الواجهة.

## خطة التصميم والتنفيذ

1. في M1: تدقيق واجهة Harness وslots/routes/state/i18n والقيود.
2. في M2: low-fidelity App Shell وMission wizard وpage states وDesign Tokens.
3. في M3–M4: prototypes للحظر/الموافقة/recovery والأدلة/DAG والـagent tree.
4. في M5: Investigation vertical UI مكتملة success/blocked/failure/recovery.
5. في M7–M11: templates تخصصية فوق المكونات المشتركة.
6. في M12–M14: collaboration/registries/experiments/search/maps/global views.
7. في كل مرحلة: RTL/accessibility/offline tests، لا ترحّل إلى النهاية.

## استراتيجية الاختبار

- Unit للformatters/state reducers والعقود.
- Component للforms/tables/approvals/states.
- Contract بين UI وruntime schemas.
- E2E للتدفقات الحرجة وrestart/offline/revocation/budget expiry.
- axe + keyboard + screen reader manual.
- visual regression عربي/إنجليزي وLight/Dark/High Contrast.
- pseudo-localization ونص طويل وmixed bidi.
- performance datasets للجداول والرسوم مع virtualization/progressive loading.

## معايير قبول مشتركة

- يعرف المستخدم workspace/mission/system/state من أي شاشة.
- لا تعرض الواجهة نجاحًا قبل تأكيد runtime.
- كل توقف يشرح السبب والخطوة التالية.
- كل نتيجة مهمة قابلة للتتبع حتى المصدر.
- كل إجراء حساس يعرض نطاقه وأثره قبل التنفيذ.
- لا معلومة مهمة تعتمد على hover وحده.
- refresh/restart لا يفقد state committed أو draft المعلن حفظها.
- التدفقات الحرجة قابلة للإنجاز بالkeyboard بالعربية والإنجليزية.
- DAG والرسوم لا تجمد الواجهة على أحجام benchmark المعتمدة ولها بدائل غير رسومية.

## قرارات UX المفتوحة

الهوية البصرية، personas، mobile scope، الأرقام والتاريخ والمنطقة الزمنية، المتصفحات المدعومة، أحجام DAG/graph/files/event rate، upload limits، offline conflict policy، notification channels، map provider/licensing، privacy في screenshots/exports، وحالات Agent/Tool/Provider التفصيلية. تثبت قبل التصميم عالي الدقة للجزء المتأثر.
