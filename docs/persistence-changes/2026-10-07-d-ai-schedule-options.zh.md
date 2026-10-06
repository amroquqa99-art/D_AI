---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-07-d-ai-schedule-options

[English](2026-10-07-d-ai-schedule-options.md) | 中文

## 概述

为持久化 Director v1 调度输入增加可选的并行和停滞设置，并保留已接受的周期结果联合类型。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

现有 v1 调度记录仍可读取：新输入字段均可选，重放将并行度默认为一，限制设置及计数默认为零。EXECUTED、IDLE、FAILED 结果联合类型保持不变；任务失败使用 FAILED 和 D_AI_TASK_FAILED 错误标记。其他根摘要保持不变。Session 头和信封未改变，前序确认快照保留。

<a id="verification"></a>
## 验证

本地通过全部 43 个文件中的 167 个 D_AI 测试，使用原生 AgentLoop、JSONL Session 存储和已编译系统组件；外部模型和来源使用脚本测试替身。测试覆盖旧调度重放、原生重启、并行指定任务、人工等待边界、预先取消、保存失败传播、调度关闭清理及 1000 个逻辑任务的确定性调度。目录最新性检查通过。完整工作区编译、CI 和真实提供方验证仍待完成。

<a id="dev-note"></a>
## 开发备注

无。
