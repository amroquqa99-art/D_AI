---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-06-d-ai-native-events

[English](2026-10-06-d-ai-native-events.md) | 中文

## 概述

确认十七种原生 D_AI 领域及平台事件类型，并更新 Session 回放使用的生成事件集合。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

在已接受格式中添加仅日志事件根，不改变任何既有事件、头部或信封摘要。旧版本仍会拒绝这些必需的 D_AI 记录。执行事实保留旧版 v1 与带围栏的 v2 载荷声明；运行时投影确定性迁移 v1，并拒绝无法明确关联检查点的历史。

<a id="verification"></a>
## 验证

原生 AgentLoop、JSONL 与原生 flock 测试验证 Director、执行及副作用 Session 重启。完整 D_AI 脚本模型测试和持久化目录检查记录于 docs/TEST_REPORT.md；真实模型提供方与进程崩溃验收仍未验证。 已批准的调度在原生重启后保留，并使用既有 Harness 调度来源契约唤醒一个有界任务。

<a id="dev-note"></a>
## 开发备注

无。
