# playbook-router

| Field | Value |
|---|---|
| `id` | `playbook-router` |
| `source` | `internal` |
| `version` | `dai-1.0.0` |
| `licence` | `GPL-3.0-or-later` |
| `review` | `APPROVED` |
| `bindings` | `workflow.step`, `charter`, `task` |
| `capability` | Routes a task to a named playbook of ordered steps instead of to a free-form plan. |
| `verification` | `src/dai/charters.py::gaps` rejects a step without an objective, a responsibility, a failure policy, its dependencies and its acceptance; `tests/test_charters.py` covers the rejection and the dependency-cycle check. |

## What it is

A charter's workflow is a list of steps. Each step declares its objective, the
role responsible for it, the tools it may use, the inputs it needs, its
dependencies, the artefacts it produces, and the condition that ends it.

The router picks the step whose objective matches the task, and refuses to
start a step whose dependencies are unfinished. It does not invent steps.

## The pattern

```
step:
  id:            stable within the workflow
  objective:     what this step must achieve
  responsibility: the role accountable for it
  failure_policy: what to do when it cannot be completed
  dependencies:  other step ids that must be finished first
  tools:         the tools this step may use
  outputs:       the artefacts it produces
  acceptance:    the condition that ends it
```

## Why it is in D_AI

It replaces "the model decided what to do next" with "the declared plan says
what runs next, and the plan is checked before it runs". A step whose
acceptance cannot be stated is rejected at approval time, not discovered at
the end.

## Limits

- A playbook is a **candidate method** until a real task proves it. Its
  `workflow.method_status` stays `candidate` until an evidence record exists.
- The router does not choose the method for the user; it routes within a
  method the owner already approved in the charter.
