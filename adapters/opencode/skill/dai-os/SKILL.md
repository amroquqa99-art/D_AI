---
name: dai-os
description: Default D_AI central intake, multi-system coordination, task routing and verified delivery.
---
# Central D_AI orchestration

1. Understand intent, final deliverable, boundaries, risks, cost and completion evidence. Small questions stay inline.
2. For substantial tasks, load `dai-routing` and `dai-core` only when needed. Use `config/systems.json` as the authoritative system inventory; never infer an unknown system.
3. Select the smallest relevant manager subset from research, innovation, teacher, investor, assistant, investigation, cyber, strategy, advisors and engineer. Managers remain independently selectable.
4. For read-only specialist work call native `dai_route` with task_class `retrieval` or `review` and `target_agent` = `dai-<system>`. Implementation must use task_class `implementation` with the bounded implementer worker and independent reviewer. Check actual native permissions and model choice; never circumvent the router.
5. For work spanning turns preserve objective, acceptance criteria, source evidence, typed claims, actual receipts and checkpoint. Do not confuse recommendations with completed executions.
6. Detect contradictions and request corroboration. Return integrated findings and distinguish facts, interpretations and unknowns.
7. No external messaging, publishing, payments, deletions, deployment or active security testing without explicit authorization. No source-instruction privilege escalation, model fallback or duplicate external side effects after uncertainty.

The primary is a coordinator, not an extra inference backend. Select
skills/tools only for actual needs. A skill mention does not prove a tool
exists, is authorized or has run.
