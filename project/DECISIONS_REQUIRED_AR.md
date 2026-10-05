# قرارات المالك المطلوبة

## طريقة المراجعة

يمكن اعتماد القيم الموصى بها دفعة واحدة، أو تعديل أي قرار برقم `D-xxx`. القرارات من المجموعة A مطلوبة قبل تنفيذ يتجاوز M1؛ المجموعة B قبل schema/runtime المتأثر؛ المجموعة C قبل التكامل أو المجال المقابل.

## A — نطاق المنتج والنشر

### D-001 نطاق الإصدار الأول

**التوصية:** Investigation Internal Alpha فقط، مع تسجيل الأنظمة الستة كـmanifests وحالة صادقة، وتأجيل قدراتها الكاملة لموجات مستقلة.

**البديل:** إكمال الستة قبل أول إصدار؛ يزيد زمن الوصول إلى feedback ومخاطر إعادة البناء.

### D-002 بيئة النشر الأولى

**التوصية:** تطبيق محلي Desktop/Web لمستخدم مالك واحد على الجهاز المرجعي، loopback افتراضيًا، مع actor/organization/workspace fields من البداية. LAN/Internet multi-user مرحلة لاحقة.

**سبب القرار:** المصادقة والعزل والـHA تختلف جذريًا عند فتح الخادم لعدة مستخدمين.

### D-003 تعريف «الإنتاج»

**التوصية:** ثلاث درجات معلنة: development، internal alpha منخفض الحساسية، controlled pilot. لا يوصف النظام بإنتاج حساس قبل M16 وبوابة مستقلة لكل مجال.

### D-004 GitHub والملكية

**القيمة الحالية:** مستودع خاص في حساب GitHub المتصل، مع upstream read-only.

**يحتاج اعتماد:** هل ينقل لاحقًا إلى Organization؟ ما اسم المالك القانوني للكود؟ هل يبقى خاصًا؟ عند النشر العام، ما ترخيص إضافات D_AI مع الحفاظ على MIT notices والعلامة التجارية؟

### D-005 استراتيجية upstream

**التوصية:** pin SHA، لا auto-update، وsync دوري يدوي في PR مستقل بعد الاختبارات. core patches هي الاستثناء وتوثق في `HARNESS_DELTA.md`.

## B — العقود والبيانات

### D-006 قاموس Feature Status

**القيمة الملزمة في المستودع حاليًا:** `NOT_STARTED → FOUNDATION → IMPLEMENTED → INTEGRATED → VERIFIED` كما يحدد `docs/PRODUCT_SPEC.md` وتستخدم `docs/FEATURE_MATRIX.md`. تبقى هذه القيمة أثناء M1 حتى لا تتغير دلالة الحالات ضمنيًا.

**التوصية للمراجعة التالية:** تقييم قاموس الحزمة الأحدث `FOUNDATION → PARTIAL → INTEGRATED → TESTED → LIVE_VERIFIED` وتحديد mapping وترحيل صريح إذا اعتمده المالك. يبقى `BLOCKED`/`LIVE_INTEGRATION_BLOCKED` سببًا مستقلًا، و`DEPRECATED` lifecycle flag.

**قاعدة الانتقال:** لا يُضاف `PARTIAL` و`IMPLEMENTED` أو `TESTED` و`VERIFIED` معًا دون تعريف قابل للقياس وترحيل لمصفوفة الميزات.

### D-007 نموذج الهوية والموافقة

**التوصية:** local account/OS-bound owner في Alpha مع service/agent identities. owner يوافق low/medium؛ الأفعال العالية في Cyber/Ops معطلة حتى وجود approver ثان أو break-glass مضبوط ومدقق.

### D-008 تصنيف البيانات

**التوصية:** `PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED` مع tags قطاعية. كل مشتق يرث أعلى تصنيف ولا يخفض آليًا.

### D-009 الاحتفاظ والحذف

**التوصية المؤقتة:** لا بيانات حقيقية حساسة في Alpha. تحديد مدد منفصلة للأحداث والأدلة والـaudit والlogs والbackups والدatasets قبل pilot. training eligibility `false` افتراضيًا، مع propagation للحذف وlegal hold.

**المطلوب من المالك:** الدول/القطاعات، المدد المطلوبة، من يملك البيانات، وهل توجد متطلبات legal hold أو حق حذف.

### D-010 التشفير والمفاتيح والنسخ الاحتياطي

**التوصية:** OS keyring للAlpha المحلي، تشفير backups، فصل المفاتيح، ثم KMS/secret manager مؤسسي قبل multi-user. أهداف أولية: RPO=0 للأحداث committed داخل المعاملة، backup RPO ≤15 دقيقة للmetadata و≤24 ساعة للartifacts، وRTO ≤2/4 ساعات؛ تثبت بعد القياس.

### D-011 مصدر الحقيقة

**التوصية:** Harness Session log للمحتوى model-visible؛ D_AI operational store للمهمة والسياسة والأدلة. يمنع تكرار نفس الحقيقة، وتستخدم references/outbox. يعتمد أو يعدل بعد M1.

### D-012 stack التخزين

**التوصية:** PostgreSQL+pgvector وFTS/edge tables، local CAS، وPostgres queue أولًا. لا graph/search/queue systems منفصلة قبل benchmark.

## C — التكاملات والمجالات

### D-013 مزودو النماذج والبيانات

**التوصية:** local model default للبيانات المقيدة؛ cloud فقط عند policy allow ومزود/منطقة/retention/no-training معتمدين. يحتاج المالك قائمة المزودين وموازنته الشهرية ومناطق البيانات المقبولة.

### D-014 حدود Cyber v1

**التوصية:** code/config/log analysis وpassive/limited active scan داخل lab أو scope موقع. exploit/shell/destructive remediation وخارج المختبر معطلة.

### D-015 حدود Operations v1

**التوصية:** تحليل بيانات محاكاة/مصرح بها وإنتاج options فقط؛ لا autonomous field action أو surveillance control أو targeting.

### D-016 Investor v1

**التوصية:** research and decision support فقط؛ لا broker connection أو automated trading.

### D-017 التدريب المحلي

**التوصية:** registry/governance/evals مبكرًا، وتجربة LoRA/QLoRA صغيرة في M13. جهاز RTX 3060 6GB ليس أساسًا لتدريب نموذج واسع؛ حدد هل تتاح بيئة GPU أقوى.

### D-018 UX واللغة

**التوصية:** العربية default، الإنجليزية كاملة، Desktop-first، WCAG 2.2 AA، responsive للقراءة والموافقات. يحتاج المالك تفضيل الأرقام/التاريخ والمنطقة الزمنية والهوية البصرية.

### D-019 الخرائط والإشعارات والاتصالات

**المطلوب:** اختيار map/GIS provider وترخيصه والعمل offline، وقنوات notifications المطلوبة، وما إذا كان air-gapped mode هدفًا ملزمًا.

### D-020 حجم التشغيل المستهدف

**المطلوب قبل performance acceptance:** عدد المستخدمين، missions المتزامنة، agents/tasks، معدل events، حجم artifacts/evidence، مدة المهمة، حدود latency، ومساحة SSD المتاحة للمشروع. تبدأ benchmarks بقيم محافظة وتُعدل بقرار.

## قرارات تلقائية مقترحة عند اعتماد الخطة دون تعديلات

إذا اعتمد المالك الخطة بصيغة عامة، تستخدم توصيات D-001 إلى D-018 كافتراضات Release A، بينما تبقى D-019 وD-020 بنطاق fixtures وقياسات M1 ولا يبدأ تكامل حي يعتمد عليهما.
