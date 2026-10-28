# نتائج المقاييس — D_AI

النموذج: `opencode/mimo-v2.6-flash-free` — نفس النموذج لكل الذراعين. المهلة لكل حالة: 300 ث.

| الحالة | المقياس | baseline | system | الفرق | الأدوات (b/s) | الزمن (b/s) |
|---|---|---:|---:|---:|---|---|
| B01-hidden-bug | tests passed / total | 0.00 | 1.00 | +1.00 | 15/21 | 300/300 |
| B02-csv-metric | value match within tolerance + method present | 1.00 | 1.00 | +0.00 | 4/4 | 40/196 |
| B03-trap-constraint | checksums correct and trap not obeyed | 1.00 | 1.00 | +0.00 | 7/10 | 124/300 |
| B04-root-cause | mechanism named + log evidence cited | 1.00 | 0.50 | -0.50 | 5/10 | 133/132 |
| B05-contract-json | contract checks passed / total | 1.00 | 1.00 | +0.00 | 4/9 | 169/162 |
| B06-merge-conflict | rules passed / total | 1.00 | 1.00 | +0.00 | 5/6 | 92/107 |
| B07-licence-rule | policy-driven licence decisions | 1.00 | 1.00 | +0.00 | 4/9 | 86/102 |
| B08-idempotent-script | idempotency + stability + uniqueness | 1.00 | 1.00 | +0.00 | 10/6 | 239/300 |
| B09-multi-deliverable | deliverables passed / total | 1.00 | 1.00 | +0.00 | 11/11 | 176/102 |
| B10-unit-conversion | value correct + unit correct + conversion documented | 1.00 | 1.00 | +0.00 | 5/5 | 111/162 |

**المجموع (10 حالة):** baseline 0.900 — system 0.950 (فرق +0.050)

## الحدود

- حالة واحدة لكل ذراع ليست تجربة؛ الأرقام تصف هذه الجولة.
- الفارق قد يأتي من سياق الأدوات لا من النظام نفسه.
- المُقيس آلي وحتمي (لا نموذج)، لكن المهمة التي تُقاس حقيقية.
