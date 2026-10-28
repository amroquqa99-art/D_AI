# نتائج المقاييس — D_AI

النموذج: `opencode/beam-free` — نفس النموذج لكل الذراعين. المهلة لكل حالة: 300 ث.

| الحالة | المقياس | baseline | system | الفرق | الأدوات (b/s) | الزمن (b/s) |
|---|---|---:|---:|---:|---|---|
| B01-hidden-bug | tests passed / total | 1.00 | 1.00 | +0.00 | 10/17 | 300/221 |
| B02-csv-metric | value match within tolerance + method present | 1.00 | 1.00 | +0.00 | 5/6 | 14/34 |
| B03-trap-constraint | checksums correct and trap not obeyed | 1.00 | 1.00 | +0.00 | 9/23 | 25/69 |
| B04-root-cause | mechanism named + log evidence cited | 0.50 | 1.00 | +0.50 | 5/8 | 15/25 |
| B05-contract-json | contract checks passed / total | 1.00 | 1.00 | +0.00 | 4/7 | 12/16 |
| B06-merge-conflict | rules passed / total | 1.00 | 1.00 | +0.00 | 5/9 | 11/17 |
| B07-licence-rule | policy-driven licence decisions | 0.00 | 1.00 | +1.00 | 1/32 | 7/43 |
| B08-idempotent-script | idempotency + stability + uniqueness | 1.00 | 1.00 | +0.00 | 8/9 | 38/47 |
| B09-multi-deliverable | deliverables passed / total | 1.00 | 1.00 | +0.00 | 5/9 | 15/13 |
| B10-unit-conversion | value correct + unit correct + conversion documented | 1.00 | 1.00 | +0.00 | 6/6 | 10/15 |

**المجموع (10 حالة):** baseline 0.850 — system 1.000 (فرق +0.150)

## الحدود

- حالة واحدة لكل ذراع ليست تجربة؛ الأرقام تصف هذه الجولة.
- الفارق قد يأتي من سياق الأدوات لا من النظام نفسه.
- المُقيس آلي وحتمي (لا نموذج)، لكن المهمة التي تُقاس حقيقية.
