---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-06-d-ai-native-events

English | [中文](2026-10-06-d-ai-native-events.zh.md)

## Summary

Records the seventeen native D_AI domain and platform event types and refreshes the generated vocabulary used by Session replay.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-06-d-ai-native-events
baseline: false
changes:
  - root: "event:d_ai/budget-fact"
    previous: null
    after: "feb3beb8bed3789b4b0cf2975958f0995513d63844f85805d1f726ff73b8dfdf"
    decision: same-version
  - root: "event:d_ai/control-plane-fact"
    previous: null
    after: "5b06f40e2aa825d51a0490941644f513bebfa5723d54b96c3cc5548d22b962c7"
    decision: same-version
  - root: "event:d_ai/cyber-fact"
    previous: null
    after: "db4bbe69d3b98ce030a3d621a086600880dcae11373c4282a74f310ad23b5511"
    decision: same-version
  - root: "event:d_ai/director-fact"
    previous: null
    after: "3d32810370c869b79b1d25732e81ef7784c42b7ef90ff429deead6872dd2ffc7"
    decision: same-version
  - root: "event:d_ai/director-schedule-fact"
    previous: null
    after: "3914e36f9a7d629637973b83fcc17c12d1c387517d16d188a8b534910490002f"
    decision: same-version
  - root: "event:d_ai/evidence-store-fact"
    previous: null
    after: "db4beca988455d9f93ceb85610eaa8c65d43bcf15db533a1462e0acc6101b4a8"
    decision: same-version
  - root: "event:d_ai/execution-fact"
    previous: null
    after: "5b1f490724b4a3909c91fa77209a56f86ffe1281672263b8510e26210d4f1cb9"
    decision: same-version
  - root: "event:d_ai/fact"
    previous: null
    after: "fc0e119f85ebcc12d7ed14fe895b7b471c069f7c31aab6a9bef90ca765f5ed67"
    decision: same-version
  - root: "event:d_ai/innovation-fact"
    previous: null
    after: "29fda5c31bbb19c26792020bd8929ccc94d1394674088638eb84a0fed2bf5681"
    decision: same-version
  - root: "event:d_ai/investor-fact"
    previous: null
    after: "76e6d775ce1c281adfa3be99fd607a2dd1ec731b72b3bb9bbb2e6da1f3e74fb9"
    decision: same-version
  - root: "event:d_ai/model-lifecycle-fact"
    previous: null
    after: "e03e5af7ee2e507b1eabecb9f8bc34fa409cdb82544796bce72b92c7ec7e7e80"
    decision: same-version
  - root: "event:d_ai/model-registry-fact"
    previous: null
    after: "1a27247a4fa0a40b72cec06fb5124e62f907d8e48766039bd89fb21d3a63d0c4"
    decision: same-version
  - root: "event:d_ai/operations-fact"
    previous: null
    after: "0fd8bb87a1f519f2174d94a827c0144ee5b2fa068dd17c910152b98e34b025dd"
    decision: same-version
  - root: "event:d_ai/scientific-fact"
    previous: null
    after: "afcdb4c7e70ad64a9bdc787f2b7c85532d2c484ae972c551f415b60fd235f892"
    decision: same-version
  - root: "event:d_ai/side-effect-fact"
    previous: null
    after: "7f81f2c4d30d89ab07fe9198274a96c284e8267b76a74720d82f93d308ab509c"
    decision: same-version
  - root: "event:d_ai/task-ledger-fact"
    previous: null
    after: "6b9e3438ab660de0f81f12997ee8c71d236b2a224c6d634c9d22bfd1463c5f0e"
    decision: same-version
  - root: "event:d_ai/training-fact"
    previous: null
    after: "41d9c5e635e6547412b71a2a480783c3adb34a12a4ec1b5fc23493a4668b7f63"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Adds log-only event roots to the accepted format without changing any existing event, header or envelope digest. Older builds still refuse these required D_AI records. Execution facts retain both the legacy v1 and fenced v2 payload declarations; runtime projections migrate v1 deterministically and reject ambiguous checkpoint lineage.

<a id="verification"></a>
## Verification

Native AgentLoop, JSONL and native flock tests verify Director, execution and side-effect Session restart. Full D_AI fixture-model tests and persistence inventory checks are recorded in docs/TEST_REPORT.md; real-provider and process-crash acceptance remain unverified. An approved schedule survives native restart and wakes one bounded task using the existing Harness schedule source contract.

<a id="dev-note"></a>
## Dev Note

None.
