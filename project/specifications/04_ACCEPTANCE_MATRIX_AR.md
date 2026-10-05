# D_AI — Acceptance Matrix v2

## P0 — Repository Reality Check
- Clone/fork المصدر الحقيقي لـ DeepSeek Harness وتثبيت commit SHA.
- قراءة architecture/AGENTS/package graph/launch profiles الفعلية.
- تشغيل baseline build/tests/start وتسجيل النتائج الحقيقية.
- إنشاء HARNESS_DELTA.md وARCHITECTURE.md وFEATURE_MATRIX.md وTEST_REPORT.md.
- لا تعتمد على prototypes قديمة دون audit.

## P1 — Native D_AI Boot
- D_AI profile/package يعمل داخل بنية Harness الأصلية.
- واجهة محلية تفتح من scripts الرسمية للمشروع.
- health/state/session/tool path حقيقي.
- لا يوجد framework وهمي منفصل يمثل نفسه كـD_AI.

## P2 — System Registry
- تسجيل الأنظمة الستة First-Class.
- لكل نظام manifest/version/manager/tools/policies/evals/UI entry.
- enable/disable/version upgrade يعمل بدون تعديل core واسع.

## P3 — Real Multi-Agent Execution
- System Manager -> child -> grandchild instances حقيقية.
- سياقات منفصلة وهويات مستقلة.
- parallel branches بحدود concurrency.
- handoff/artifact sharing قابل للتدقيق.
- عند غياب provider حقيقي: الحالة LIVE_INTEGRATION_BLOCKED لا VERIFIED.

## P4 — Durable Mission Engine
- Task DAG مع cycle detection.
- worker pools/leases/retries/backoff.
- persistence/restart.
- crash recovery دون إعادة side effect مكتمل.
- اختبار 1000 logical queued tasks مع concurrency منخفض.
- WAITING_FOR_HUMAN وBLOCKED_POLICY وBLOCKED_BUDGET فعالة.

## P5 — Evidence & Memory
- claim provenance كامل.
- contradictions/supporting/opposing evidence.
- knowledge graph.
- scoped memory.
- reconstruction from event/state store.
- prompt injection test لا يسمح لمحتوى مسترجع بتغيير policy.

## P6 — Authorization & Audit
- ABAC-style policy enforceable داخل runtime.
- temporary/permanent grants.
- approval workflows.
- audit ledger.
- classification boundaries.
- cross-system grants موثقة.

## P7 — Investigation Vertical Slice
طلب تحقيق عام مسموح -> hypotheses -> مصادر متعددة -> entity links -> contradictory evidence -> independent verification -> persisted report -> UI evidence explorer.

## P8 — Scientific Research Vertical Slice
Research question -> literature graph -> gap -> design -> WAITING_FOR_HUMAN للتجربة/البيانات -> إدخال النتائج -> validation -> reproducible report.

## P9 — Investor Vertical Slice
Company/asset -> sourced financial data -> thesis -> scenarios -> risk -> portfolio effect -> change alert. لا تنفيذ مالي تلقائي غير معتمد.

## P10 — Cybersecurity Vertical Slice
Authorized lab target -> scope manifest -> scan/analysis -> reproducible finding -> remediation -> retest. طلب خارج النطاق يُوقف runtime.

## P11 — Operations & Intelligence Vertical Slice
Case/operation workspace -> ingest أدلة من investigation + cyber + field data -> entity/network map -> timeline -> hypotheses -> intelligence gaps -> options analysis -> audit trail.

لا يتطلب القبول تنفيذ عمليات حساسة على أهداف حقيقية؛ الاختبارات تستخدم بيانات/بيئات مصرح بها أو محاكاة واضحة.

## P12 — Innovation Vertical Slice
Hard problem -> multi-disciplinary independent agents -> candidate hypotheses -> critic/counterexample -> simulation/math test -> novelty check -> status VERIFIED/REFUTED/OPEN/NEEDS_EXPERIMENT -> artifact.

## P13 — Cross-System Collaboration
- Investigation يستدعي Investor في تحقيق مالي.
- Research يستدعي Investigation للتحقق من مصدر.
- Innovation يرسل فرضية إلى Scientific Research.
- Cyber يرسل evidence تقنيًا إلى Operations & Intelligence.
- كل انتقال يحفظ origin/permission/result/cost.

## P14 — Local Intelligence Core Foundation
- training data governance schema.
- opt-in/opt-out by project/source.
- dataset builder.
- evaluation holdout.
- model registry/lineage.
- baseline local model evaluation.
- تحسين تجريبي صغير حقيقي (مثل adapter/SFT مناسب للعتاد أو بيئة أقوى) مع مقارنة قبل/بعد.
- rollback.
- لا يُسمى أي تحسن مثبتًا دون eval مستقل.

## P15 — UI
- Mission Control.
- Agent Terminal.
- DAG viewer.
- Evidence/Knowledge graph.
- Timeline/maps where relevant.
- System Studio.
- Model/Tool registry.
- Budget/resource view.
- Approvals/Audit.
- Arabic/English RTL/LTR QA.

## P16 — Offline/Resilience
- network loss.
- provider loss.
- restart.
- queued sync.
- local fallback where configured.
- لا فقدان للmission state.

## P17 — Security Hardening
- secrets management.
- sandboxing.
- tool privilege separation.
- egress controls.
- SSRF protections where applicable.
- untrusted content handling.
- audit integrity.

## P18 — Final Delivery
- build/lint/typecheck/unit/integration/e2e/security حسب ما يناسب.
- fresh-clone setup على Arch Linux.
- backup/export/import.
- versioned migrations.
- known limitations.
- feature matrix بالحالات الحقيقية.
- لا claim لنتيجة live لم يتم إثباتها.
