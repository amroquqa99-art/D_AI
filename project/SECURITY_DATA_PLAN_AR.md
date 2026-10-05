# خطة الأمن والخصوصية وحوكمة البيانات

## المبدأ

الأمن جزء من التصميم منذ M1 وليس مرحلة أخيرة. كل قرار نموذج أو أداة أو retrieval أو نقل بين الأنظمة أو export يمر بنقطة إنفاذ تعيد تقييم السياسة لحظة التنفيذ. تعليمات النموذج أو الوثيقة لا تمنح صلاحية.

هذه الخطة لا تدعي امتثالًا قانونيًا. الولاية والقطاع والاستخدام يحددان تطبيق GDPR/قوانين محلية وCJIS أو الصحة والأسواق والتصدير والدفاع وغيرها، وتحتاج مراجعة قانونية قبل الاستخدام الحساس.

## الأصول والخصوم وحدود الثقة

الأصول الأعلى حساسية هي الأدلة وسلسلة حيازتها، بيانات الأشخاص والمواقع والأجهزة، أسرار connectors، السياسات والموافقات، ذاكرة الوكلاء والفهارس، datasets/checkpoints، التقارير التشغيلية، audit والنسخ الاحتياطية.

الخصوم المحتملون: مهاجم خارجي، مستخدم أو مسؤول داخلي مسيء، workspace/tenant آخر، ملف أو صفحة خبيثة، connector/provider مخترق، وكيل خرج عن النطاق، أو dependency/release مسموم.

حدود الثقة التي يجب رسمها واختبارها في M1: browser↔BFF/API، API↔scheduler/workers، worker↔Tool Gateway، sandbox↔host/network، relational/object/vector/graph stores، local↔cloud model، cross-system room، import/export/backup، وCI↔release.

## المخاطر المهيمنة

- prompt injection أو poisoned retrieval يؤدي إلى تسريب أو أداة غير مصرح بها.
- confused deputy يرفع صلاحية وكيل أو cross-system call.
- تسرب بين workspaces في API أو search أو embeddings أو cache أو queue.
- RCE/SSRF/path traversal/archive bombs عبر shell/web/parsers/uploads.
- تنفيذ Cyber/Ops خارج scope أو بعد انتهاء الموافقة.
- تسميم evidence أو training dataset أو eval holdout.
- تعديل/حذف audit أو كسر chain of custody.
- ظهور secrets/PII في prompts أو logs أو traces أو screenshots/exports.
- تكرار side effect بعد crash/retry أو استنزاف ميزانية/موارد.
- تسرب من backup أو export أو model memorization.

## الهوية والصلاحيات

RBAC الأساسي المقترح: owner، organization-admin، security-admin، auditor read-only، project-manager، operator، analyst/researcher، approver، data/ML steward، وservice/agent identity. يفصل auditor عن admin وتكون break-glass مؤقتة ومدققة.

ABAC يضيف organization/workspace/project/mission/system/action/tool/target/data classification/purpose/legal authority/risk/budget/time/provider/region/approval state. الوكيل يرث أقل subset من صلاحيات منشئه ولا يفوض ما لا يملكه.

لكل إنسان وخدمة ووكيل `actor_id` ثابت. Tool/model/cross-system operations تستخدم capability tokens قصيرة العمر مرتبطة بالمهمة والهدف والأداة وقابلة للسحب. كل retry/resume/dequeue يعيد التحقق من الصلاحية والنطاق.

كل جدول وobject key وvector namespace وgraph edge وcache وqueue event وartifact/audit يحمل organization/workspace scope. يُفضل DB row-level security أو عزل أقوى بحسب الحساسية، وتنفذ اختبارات IDOR وcross-workspace retrieval.

## الموافقات

الـapproval receipt يرتبط بـaction وargs وtarget وdata set وcost ceiling وpolicy version وexpiry. تغيير أي عنصر جوهري يبطل الموافقة. تعرض الواجهة السبب والأثر والبيانات المغادرة والبدائل والمدة، ولا تعتبر القرار نافذًا قبل تأكيد runtime.

الأفعال العالية في Cyber/Ops تحتاج approver مستقلًا أو تبقى disabled في single-owner mode. يُحسم two-person rule وbreak-glass في قرار المالك قبل بناء تلك المجالات.

## تصنيف البيانات والاحتفاظ

التصنيف الافتراضي المقترح: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`، مع tags مثل PII، biometrics، health، financial، location، law-enforcement، classified، secrets، export-controlled. الاشتقاق يرث أعلى تصنيف من مصادره ولا يخفضه آليًا.

لكل مصدر تسجل الملكية/التحكم والغرض والأساس/التفويض وconsent/license والجغرافيا وretention وsharing constraints وlegal hold و`training_eligible=false` افتراضيًا.

يُعتمد جدول retention منفصل للأحداث الخام، محتوى المهمة، embeddings، caches، logs/traces، approvals/audit، exports، backups، datasets/models. الحذف ينتشر إلى indexes والمشتقات مع tombstones وbackup expiry وتقارير الاستثناء. الأدلة الخاضعة legal hold تتبع مسارًا منفصلًا. حذف بيانات دخلت نموذجًا يحتاج سياسة deletion/unlearning معلنة قبل M13.

## التشفير والأسرار

- TLS للاتصالات، وتشفير database/object/backups حسب deployment.
- envelope encryption ومفاتيح منفصلة للبيئات أو الجهات عالية الحساسية.
- secret manager أو OS keyring؛ لا يُعرض secret للوكيل، بل يستخدم Tool Gateway credential handle.
- rotation/revocation/recovery وcrypto-shredding موثقة ومجربة.
- لا secrets في Git أو `.env` examples أو prompts/logs/fixtures.

اختيار KMS ومالك المفاتيح وحيازة backup قرارات blocking قبل production، ويمكن لـlocal alpha استخدام keyring محليًا مع backup يدوي محمي بعد توثيق الخطر.

## الأدوات والعزل والشبكة

تعمل sandboxes بعمر محدود، filesystem محدود، دون host socket، ومع CPU/RAM/time/output quotas. الشبكة deny-by-default مع allowlists وDNS/IP validation ومنع metadata/private ranges وDNS rebinding وإعادة التحقق بعد redirect.

يمر الرفع عبر MIME/size/extension validation، malware scan، archive bomb/path traversal defense، parser isolation وquarantine. الأدوات المبنية آليًا تحتاج locked dependencies، scan/tests، signing وموافقة قبل التفعيل العام.

Cyber scope manifest يكون immutable وموقعًا ويحدد targets/CIDRs/domains، methods، rate، expiry، owner والموافقات. كل tool call يقارن الهدف بالنطاق تقنيًا.

## الأدلة والتدقيق

عند ingestion يحسب hash ويسجل المصدر وطريقة الجمع والوقت والأداة/الإصدار والوكيل والنظام والتصنيف. transformations تنشئ مشتقات ولا تستبدل الأصل، ويحفظ access/export history.

audit يسجل actor/action/resource، policy version والقرار/السبب، approval/grant، target scope، input/output hashes، timestamp، cost/result. لا يسجل payload حساسًا افتراضيًا. يستخدم hash chaining/signing وseals دورية وتخزين منفصل/WORM عند الحاجة، مع اختبار كشف العبث وتصدير SIEM اختياري.

## سلامة الذكاء الاصطناعي

- المحتوى الخارجي يدخل untrusted data envelope ولا يدخل system/developer instructions.
- tool calls لها schemas صارمة وargument validation وoutput encoding، مع TOCTOU re-check.
- DLP قبل model/tool egress يفحص secrets/PII/classification/provider/region/retention/no-training terms.
- model output لا يملك صلاحية؛ policy deterministic مستقلة للأفعال المؤثرة.
- evals هجومية تشمل direct/indirect injection، exfiltration، escalation، poisoned RAG، malicious files/URLs، cross-workspace retrieval، hallucinated citations وevidence tampering.
- تحفظ نتائج eval حسب model/tool/prompt/policy versions وتمنع الترقية عند regression متفق عليه.

## حوكمة التدريب

يكون opt-in صريحًا لكل source/project، مع entitlement/license check وde-identification ومراجعة، dedup وpoisoning/outlier detection، dataset snapshots موقعة، holdout منفصل، model/data cards، approval قبل promotion، canary وrollback.

لا يُسمى التحسن مثبتًا دون benchmark مسبق التعريف ومقارنة مستقلة. تجرى اختبارات memorization/extraction وmembership inference المناسبة. لا يوجد continuous learning من الإنتاج.

## ضوابط المجالات

- Investigation/Ops: purpose، authority، need-to-know، حماية المصادر، ضوابط location/biometric، approval/watermark للتصدير.
- Scientific: حقوق datasets، ethics/IRB عند البشر أو الصحة، de-identification وإعادة إنتاج دون تسريب restricted data.
- Investor: فصل MNPI، توثيق source time، منع trade execution افتراضيًا.
- Cyber: lab افتراضي، scope enforcement، passive/active/destructive classes، dual approval وkill switch.
- Operations: chain of command، two-person approval، لا autonomous field action، أعلى عزل للتصدير.
- Innovation: prior-art/IP/license، منع تسريب trade secrets، ومراجعة سلامة التجارب.

## بوابات الأمن حسب المرحلة

| المرحلة | الحد الأدنى قبل الخروج |
|---|---|
| M1 | threat/data-flow diagrams، asset inventory، supply-chain baseline، security ADRs، SECURITY.md وincident skeleton |
| M2 | auth/session hardening، actor identity، workspace scoping، secure headers/config، manifest integrity |
| M3 | capability tokens، sandbox/egress، ABAC negative tests، approval binding، idempotency/anti-replay |
| M4 | classification، chain of custody، retrieval isolation، injection tests، retention/deletion hooks |
| M5 | domain purpose/scope، independent verifier، export policy، expert review |
| M6 | encrypted backup/restore، redacted observability، incident/kill-switch drills |
| M7–M12 | domain-specific authority، data rights، refusal/scope-escape tests، cross-system grant revocation |
| M13 | consent/license/lineage، holdout contamination، privacy evals، promotion/rollback/deletion policy |
| M14–M15 | XSS/IDOR/clickjacking/SSRF/RCE/DoS tests، pentest، SBOM/signing، restore/migration/secret rotation drills |
| M16 | production threat review، legal/domain approval، no Critical/High accepted without explicit owner decision |

## Security Definition of Done

أي مهمة تمس بيانات أو صلاحية أو أداة أو model egress يجب أن توضح threat scenario، enforcement point، negative tests، audit event، failure behavior، redaction/retention، وrollback/revocation. لا تكفي إضافة API للسياسة دون اختبار رفض وعزل وسحب فوري.

## قرارات يجب تثبيتها

نموذج النشر والمستخدمين، الدول والقطاعات، التصنيف والاحتفاظ، KMS/secret manager، مزودو cloud ومناطقهم وشروطهم، الأدوار والموافقات، حدود Cyber/Ops، RPO/RTO، telemetry، air-gap/SSO/MFA/SIEM. توجد التوصيات والأسئلة في `DECISIONS_REQUIRED_AR.md`.
