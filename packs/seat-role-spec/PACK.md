# seat-role-spec

| Field | Value |
|---|---|
| `id` | `seat-role-spec` |
| `source` | `https://github.com/mvschwarz/openrig` (pattern only) |
| `version` | `2026-10-20T12:01:40Z` (`pushed_at` observed 2026-10-20) |
| `licence` | `Apache-2.0` |
| `review` | `PENDING` |
| `bindings` | `team.agent`, `task` |
| `capability` | Describes a team as a set of seats with declared roles, depth and permissions, so an agent is a seat rather than a free-text participant. |
| `verification` | `src/dai/teams.py` already enforces a three-layer depth limit, exclusive work ownership and a delegate capability; the pack must map each seat onto those existing rules and add no new persistence. Not yet checked — the pack is pending review. |

## What was read, and what is proposed

From the upstream README we took one idea: a team is defined by its seats —
each with a role, a place in the hierarchy, and what it may do — rather than
by an informal list of participants.

The proposed D_AI form:

```
seat:
  agent_id:   the identity that occupies the seat
  role:       what the seat is accountable for
  parent:     the seat it reports to
  depth:      1 = root, 2 = sub, 3 = sub-of-sub
  model:      the model the seat may use
  budget:     the seat's own resource limit
```

## What is deliberately not adopted

- The upstream operator/advisor split, its queue numbering and its bundle
  audit format. D_AI's work ownership and audit already live in the core and
  in the encrypted record, and duplicating them would create two sources of
  truth.

## Status

`PENDING`. The D_AI team tree already implements the seat model. This pack
exists to record that the idea was reviewed and mapped, not to add a second
implementation.
