---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-07-d-ai-schedule-options

English | [中文](2026-10-07-d-ai-schedule-options.zh.md)

## Summary

Extends durable Director v1 schedule inputs with optional parallelism and stagnation settings while preserving the accepted cycle-outcome union.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-07-d-ai-schedule-options
baseline: false
changes:
  - root: "event:d_ai/director-schedule-fact"
    previous: "2026-10-06-d-ai-native-events"
    after: "49c229a42802308e3c91764816c186c3945a1cdfb1184be7bc9d57be3a18dee7"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing v1 schedule records remain readable: input fields are optional, replay defaults parallelism to one and guardrail settings/counters to zero. The existing EXECUTED/IDLE/FAILED outcome union is unchanged; substantive task failure uses FAILED plus the D_AI_TASK_FAILED error marker. All non-schedule root digests remain unchanged. No Session header or envelope change is introduced, and preceding acknowledgement snapshots are preserved.

<a id="verification"></a>
## Verification

All 167 D_AI tests in 43 files passed locally with native AgentLoop, JSONL Session storage and the compiled system addon; external model/source services were scripted fixtures. Coverage includes legacy schedule replay, native restart, concurrent exact-task workers, human-wait preservation, pre-cancellation, flush failure propagation, scheduler shutdown cleanup and deterministic admission over 1000 logical tasks. Catalog freshness passed. Full workspace compilation, CI and live providers remain pending.

<a id="dev-note"></a>
## Dev Note

None.
