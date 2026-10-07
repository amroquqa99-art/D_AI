# D_AI 开源集成决策

[English](OPEN_SOURCE_INTEGRATIONS.md) | 中文

参考日期：2026-10-07。实现功能前，按具体需求比较有维护的项目，检查一手文档/源码、许可证和依赖开销，再测试最小真实集成。优先复用以减少自有代码；适配器保持简单，保留原生 Session/策略语义，拒绝降低质量或运行成本失衡的依赖。候选工具在连接并验收前不可用。

| 需求 | 决策 / 候选 | 理由与验收限制 |
|---|---|---|
| 提供方传输 | 复用原生 `dsh-llm-pi-ai` | 已有适配器；本地角色使用其 OpenAI 兼容协议，不另造客户端。 |
| 本地推理 | [llama.cpp](https://github.com/ggml-org/llama.cpp) / [Ollama](https://github.com/ollama/ollama) 外部运行时，均为 MIT | 已实现量化推理和服务；显式 profile 支持端点，每个模型文件仍需评估质量。 |
| 上下文和 token 压力 | 复用原生 token meter、有限 fresh subagent 和 compaction | 持久证据不放在有损摘要内。SDK 余量最多为小模型容量的八分之一，上限为既有 4096 token；估算不是精确分词计数。 |
| 决策辅助 | 原生显式启用的独立顾问 | 一次有限模型请求、严格 JSON 与证据引用校验；无工具、无权限、无隐式提供方回退。 |
| Web 搜索 | [SearXNG](https://github.com/searxng/searxng) 原生适配器，AGPL-3.0-or-later | 复用成熟元搜索，需要配置服务。独立运行不会自动解决修改/分发的 AGPL 义务。真实引擎验收待完成。 |
| Office 摄取 | 评估 [MarkItDown](https://github.com/microsoft/markitdown)，MIT | 普通文档转换候选；隔离转换并保留原始文件/位置引用。尚未连接。 |
| 复杂 PDF/布局/OCR | 评估 [Docling](https://github.com/docling-project/docling)，代码 MIT | 简单转换丢失结构时的候选；权重许可证和内存成本独立于代码许可证。尚未连接。 |
| 学术结构/引用 | 评估 [GROBID](https://github.com/kermitt2/grobid)，代码 Apache-2.0 | 多引用学术 PDF 候选；提取改善需证明 Java 服务/资源成本合理。尚未连接。 |
| 已授权安全模板 | 评估 [Nuclei](https://github.com/projectdiscovery/nuclei)，MIT | 授权实验室候选，固定并审核模板，使用已有权限/副作用网关。尚未连接。 |
| Web 安全实验室 | 评估 [ZAP](https://github.com/zaproxy/zaproxy)，Apache-2.0 | 广泛防御流程候选；服务更重且需要目标授权。尚未连接。 |
| 嵌入/向量检索 | 评估 [Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference) 与 [Qdrant](https://github.com/qdrant/qdrant)，均为 Apache-2.0 | 实测检索质量要求时再采用；索引必须能从权限限定记录重建。未安装新的向量依赖。 |

组合沿用原生 Harness 服务：摄取生成不可变源文件，搜索产出可引用来源，作用域检索提供任务上下文，独立 worker 生成评估，确定性/运行时验证控制状态变更。连接多个项目的理由应是经过测试的信息路径，而非项目数量。

[本地指南](user/d-ai-local.zh.md)拥有启动/配置说明，`TEST_REPORT.md`拥有执行证据，`FEATURE_MATRIX.md`拥有成熟度。标为修改版、不受限或极轻的模型，在精确文件、许可证及保留评估通过前仍是候选。支持自定义别名/端点，不以营销声明作为验收证据。
