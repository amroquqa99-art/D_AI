# Disciplined development — native D_AI workflow

Directory discovery: https://agenticskills.io/workflows/disciplined-development
Selected principles: diagnosis, test-first checks, verification and worktree isolation from pinned obra/superpowers. Not the directory's bulk clone/auto-activation recipe.

| Stage | Input | Output / completion evidence | Failure path |
|---|---|---|---|
| Inspect | owner goal, current state | bounded objective, exclusions, acceptance, relevant source refs | ask only for consequential missing inputs |
| Diagnose/design | smallest reproduction or requirement | cause/alternatives with a falsifying check | collect data or revise one hypothesis |
| Implement | explicit contract + base revision | one writer, changed paths, regression + actual checks | retain diff and failed receipt; no blind retry |
| Review | diff + original acceptance + receipts | independent read-only findings with path/line | executor repairs and reruns relevant checks |
| Deliver/checkpoint | verified artifacts + unresolved gates | outcome, limits, next action, durable references | PARTIAL/WAITING, not false completion |

Use `dai_route` for bounded implementation/review. The selected owner models stay unchanged. For context, search resource metadata, read one necessary page, pass artifact references instead of conversation history, and checkpoint before native compaction. Do not install another runner, publish, deploy, sign, send or spend from this workflow alone.

Upstream principles: obra/superpowers commit `22f0b463e7a5e579904dd6211a520321035526f7`, MIT (`LICENSE-superpowers.txt`). Domain acceptance remains task-specific.
