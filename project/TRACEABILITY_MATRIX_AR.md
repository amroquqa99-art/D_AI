# مصفوفة التتبع من القبول إلى التنفيذ

حالة backlog الحالية لكل البنود هي `NOT_STARTED` لأن ملفات التخطيط لا تنفذ المنتج. يحدّث كل بند برابط commit/test/checkpoint عند التقدم.

| القبول | milestone | المخرج الرئيسي | دليل الاختبار المطلوب | بوابة |
|---|---|---|---|---|
| P0 Repository Reality | M1 | baseline وarchitecture/delta/matrix/report | fresh clone install/build/typecheck/test/start وقياسات | G0 |
| P1 Native Boot | M2 | D_AI profile/bundle وhealth | إطلاق عبر `dsh` الرسمي ومسارات session/tool/state | G0 |
| P2 System Registry | M2 | manifests الستة وإصداراتها | schema، enable/disable/upgrade، compatibility failures | G1 |
| P3 Multi-Agent | M3 | instances/hierarchy/handoff | parent-child-grandchild، parallel limits، durable identity | G2 |
| P4 Durable Mission | M3 | DAG/scheduler/workers | cycle، 1000 tasks، crash/retry/fencing/no duplicate effect | G2 |
| P5 Evidence & Memory | M4 | events/projections/claim graph/retrieval | replay، provenance، contradiction، isolation، injection | G3 |
| P6 Authorization & Audit | M3–M4 | ABAC/grants/approval/audit | deny/allow/expiry/revoke/TOCTOU/tamper/cross-workspace | G2 |
| P7 Investigation | M5 | end-to-end case/report/UI | closed benchmark، expert review، restart، evidence trace | G4 |
| P8 Scientific Research | M7 | reproducible research flow | WAITING_FOR_HUMAN، artifacts/calculation replay، expert | G4 |
| P9 Investor | M8 | thesis/scenarios/risk/alerts | time-pinned sources، no leakage، no trading | G4 |
| P10 Cybersecurity | M9 | scoped finding/remediation/retest | lab target، scope escape rejection، kill switch | G4 |
| P11 Operations | M10 | operational picture/options | simulated/authorized data، chain of command/audit | G4 |
| P12 Innovation | M11 | hypotheses/critics/tests/handoff | counterexamples، typed verification، prior art | G4 |
| P13 Cross-System | M12 | calls/rooms/grants | المسارات الأربعة ورفض نقل التصنيف غير المسموح | G3/G4 |
| P14 Local Core | M13 | governance/registry/eval/experiment | opt-out، lineage، holdout، privacy، before/after/rollback | G5 |
| P15 UI | M2/M5/M14 | Command Center and domain extensions | contract/E2E/a11y/visual RTL-LTR/performance | G4/G6 |
| P16 Offline/Resilience | M3/M6 | queues/recovery/fallback | network/provider/process loss، no state loss | G2/G6 |
| P17 Security Hardening | مستمر + M15 | security controls verified | SAST/SCA/DAST/fuzz/pentest/sandbox/egress/rotation | G6 |
| P18 Final Delivery | M15–M16 | release/restore/migrations/docs | fresh Arch clone، signed artifacts، restore/rollback/pilot | G6 |

## التبعيات الحرجة

- P7 يعتمد على P1–P6 بحد أدنى حقيقي، حتى لو تعمق P4–P6 لاحقًا.
- P8–P12 تعتمد على platform/evidence/policy المشتركة وعلى benchmark وحقوق بيانات وخبير مستقل لكل مجال.
- P13 يعتمد على classification/grants/audit لا على attribution فقط.
- P14 يعتمد على governance/telemetry/evals مستقرة، وليس على توفر كل المجالات.
- P15 يبدأ مبكرًا كApp Shell ومسار Investigation، ويكتمل بعد استقرار العقود.
- P17 workstream مستمر؛ M15 يثبت hardening النهائي ولا يبدأه.

## قالب دليل القبول

لكل صف عند التنفيذ تسجل: scenario ID، input dataset/version، environment، commit، Harness SHA، model/tool/policy versions، الأمر، expected result، actual result، pass/fail/blocked، links إلى logs/artifacts بعد redaction، واسم المراجع. لا يرتفع status دون هذا الدليل.
