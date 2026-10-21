# severity-escalation

| Field | Value |
|---|---|
| `id` | `severity-escalation` |
| `source` | `https://github.com/gastownhall/gastown` (pattern only) |
| `version` | `2026-10-18T00:11:21Z` (`pushed_at` observed 2026-10-20) |
| `licence` | `MIT` |
| `review` | `PENDING` |
| `bindings` | `task`, `decision`, `consultation` |
| `capability` | Escalates a task by declared severity levels, each with its own response and its own human notification point. |
| `verification` | `src/dai/tasks.py` already carries the waiting states `WAITING_FOR_HUMAN`, `WAITING_FOR_DATA`, `WAITING_FOR_RESOURCES`; the pack must map each severity onto exactly one of them and must not introduce a new state. Not yet checked — the pack is pending review. |

## What was read, and what is proposed

From the upstream README we took one idea: a problem is not handled the same
way at every severity, and the highest severities must reach a human.

The proposed D_AI form is not a copy. It is a mapping:

| Severity | Response | Human point |
|---|---|---|
| `LOW` | continue under the current charter | none |
| `MEDIUM` | switch to a declared alternative step in the charter | none |
| `HIGH` | park the task in `WAITING_FOR_HUMAN` with a reason | the owner decides |
| `CRITICAL` | park in `WAITING_FOR_HUMAN` and refuse any external action | the owner decides, and the task cannot resume on its own |

## What is deliberately not adopted

- The upstream runtime, its scheduling daemon and its own agent loop.
- Its escalation policy as a policy source: D_AI's severity levels come from
  the owner's charter, not from an external rule set.

## Status

`PENDING`. Nothing here is active. Activating it requires the owner's
decision, a licence confirmation, and a check that each severity maps to
exactly one existing waiting state.
