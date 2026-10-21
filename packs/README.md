# D_AI Capability Packs

A pack is a **bounded, reviewable capability** that D_AI can load: a method, a
checklist, a role definition, or a tool binding. A pack is not a repository
and not a dependency.

## The rules

1. Every pack declares its `SOURCE`, its `VERSION` (a pinned commit or a
   content hash), its `LICENCE`, and its `REVIEW` state.
2. A pack is **inactive** until the owner approves it. A pack sitting in this
   folder does not enter any session context and does not count as a skill.
3. A pack may only bind to a known D_AI contract name:
   `charter`, `workflow.step`, `memory.scope`, `decision`, `task`, `team.agent`,
   `team.message`, `consultation`, `model.routing`, `tool.gateway`,
   `update.check`, `component.registry`, `adapter.opencode`, `adapter.pi`,
   `system.spec`.
4. A pack must state how it is checked. A pack with no verification is not
   accepted, whatever it promises.
5. A pack whose licence is `UNKNOWN` or `CONFLICT` can never reach
   `ADOPT_PATTERN`; it stays `ADOPT_PATTERN_AFTER_X` until the owner resolves
   the licence.

## Layout

```
packs/<pack-id>/
  PACK.md          the pack definition: source, version, licence, review, bindings, verification
  notes.md         optional working notes
```

## Manifest fields

| Field | Meaning |
|---|---|
| `id` | stable identifier, kebab-case |
| `source` | where the pattern came from: a URL, or `internal` |
| `version` | pinned commit, release, or content hash — never `latest` |
| `licence` | SPDX identifier, or `UNKNOWN` / `CONFLICT` |
| `review` | `PENDING` \| `APPROVED` \| `REJECTED` |
| `bindings` | the D_AI contracts this pack touches |
| `verification` | how its effect is checked |
| `capability` | what is actually added, in one sentence |

## Present packs

| Pack | Source | Licence | Review |
|---|---|---|---|
| `playbook-router` | internal | GPL-3.0-or-later | APPROVED |
| `severity-escalation` | gastownhall/gastown (pattern only) | MIT | PENDING |
| `seat-role-spec` | mvschwarz/openrig (pattern only) | Apache-2.0 | PENDING |

The two `PENDING` packs record a **pattern that was read, not code that was
copied**. They are not activated: they wait for the owner's decision.
