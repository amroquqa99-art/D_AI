# سجل مخاطر D_AI

الاحتمال والأثر: منخفض، متوسط، عالٍ، حرج. تُحدّث الحالة في كل milestone checkpoint.

| ID | الخطر | الاحتمال | الأثر | المعالجة/الدليل المطلوب | المالك | بوابة |
|---|---|---|---|---|---|---|
| R-001 | تغيّر Harness Alpha وكسر fork | عالٍ | عالٍ | pin SHA، plugin-first، sync PR، delta واختبارات | Architecture | G0 |
| R-002 | تضخم 48 قدرة وستة مجالات | عالٍ | حرج | Investigation Alpha، موجات Go/No-Go، منع التنفيذ الأفقي | Product | G1 |
| R-003 | ازدواج مصدر الحقيقة بين Session وMission | متوسط | حرج | ADR مبكر، ownership لكل state، outbox/replay tests | Architecture | G2 |
| R-004 | تكرار side effects بعد crash/retry | عالٍ | حرج | idempotency، fencing، journal، reconciliation، fault injection | Runtime | G2 |
| R-005 | فقد/فساد event store أو migrations | متوسط | حرج | checksums، replay، expand-migrate-contract، backup/restore | Data/SRE | G2/G6 |
| R-006 | تسرب بين workspaces/tenants | متوسط | حرج | scoped schema/RLS، negative tests لكل store/cache/search/queue | Security | G2 |
| R-007 | إرسال بيانات حساسة إلى cloud/logs | عالٍ | حرج | classification، DLP/PEP، local default، redaction tests | Security | G2/G3 |
| R-008 | Prompt injection/poisoned RAG | عالٍ | عالٍ | untrusted envelope، schema tools، egress policy، adversarial eval | AI Security | G3 |
| R-009 | Cyber/Ops خارج التفويض | متوسط | حرج | signed scope، lab default، dual approval، kill switch | Security/Domain | G4 |
| R-010 | audit قابل للتعديل أو يسرب payload | متوسط | عالٍ | hash chain/seals، separate access، metadata-first، tamper tests | Security | G2/G6 |
| R-011 | بيانات تدريب غير مصرح بها/ملوثة | متوسط | حرج | opt-in false، license/consent، snapshots، poisoning/privacy eval | ML/Data | G5 |
| R-012 | تلوث holdout وادعاء تحسن زائف | عالٍ | عالٍ | closed holdout، lineage، predefined metrics، independent review | ML/QA | G5 |
| R-013 | عتاد 6GB VRAM/16GB RAM غير كاف | عالٍ | متوسط | small quantized models، GPU queue 1، قياس M1، remote optional | Platform | G0/G5 |
| R-014 | مصادر خارجية غير مرخصة أو متغيرة | عالٍ | عالٍ | connector inventory، licensing، snapshots/hashes/timestamps | Product/Legal | G4 |
| R-015 | عدم حتمية LLM تكسر الاختبارات | عالٍ | متوسط | version pin، repeated runs، statistical thresholds، fixtures/live split | QA/ML | G4/G5 |
| R-016 | graph/search/event volume يبطئ المنصة | متوسط | عالٍ | baseline datasets، indexes، projection lag metrics، scale by evidence | Data | G3/G6 |
| R-017 | واجهة كبيرة قبل ثبات العقود | عالٍ | عالٍ | Investigation reference UI، contracts أولًا، shared components | UX/Architecture | G3 |
| R-018 | RTL/bidi/accessibility مؤجلة | متوسط | متوسط | tokens/logical CSS واختبارات منذ M2 | UX | G4/G6 |
| R-019 | backup موجود لكنه غير قابل للاستعادة | متوسط | حرج | clean-environment restore drills، hashes، key recovery | SRE | G6 |
| R-020 | observability تسرب المحتوى | متوسط | عالٍ | metadata-first، local collector، redaction/retention tests | SRE/Security | G2 |
| R-021 | supply-chain أو tool-builder compromise | متوسط | حرج | lockfiles، scans، sandbox، signing، approval، SBOM | Security | G0/G6 |
| R-022 | موافقة قديمة بعد تغير payload | متوسط | حرج | operation hash+expiry+policy version، TOCTOU re-check | Security/Runtime | G2 |
| R-023 | وكيلان يعدلان الملفات نفسها | متوسط | متوسط | worktrees، task ownership، short PRs، checkpoints | Engineering | كل مرحلة |
| R-024 | Feature Matrix تتقدم بلا دليل | عالٍ | عالٍ | evidence links، CI validation، reviewer gate | QA | كل مرحلة |
| R-025 | غياب خبراء المجالات والbenchmarks | عالٍ | عالٍ | لا يبدأ slice دون expert/benchmark/data rights | Product | G4 |
| R-026 | التزامات قانونية غير معروفة | متوسط | حرج | تحديد الدول/القطاعات، DPIA/legal review قبل الحساسية | Owner/Legal | G1/G6 |
| R-027 | امتلاء SSD بالأدلة والنماذج | متوسط | عالٍ | quotas، retention، external artifact adapter، disk alerts | SRE | G2/G6 |
| R-028 | انقطاع الطاقة/الجهاز لمهام طويلة | عالٍ | عالٍ | durable checkpoints، UPS/host plan، off-device backups، recovery SLO | SRE | G2/G6 |

## أعلى المخاطر الحالية

R-002 وR-003 وR-004 وR-006 وR-007 وR-009 وR-011 وR-026 لا تقبل التأجيل إلى مرحلة التحصين. تخفض عبر قرارات M1–M3 قبل إدخال بيانات حقيقية أو تشغيل مجال حساس.
