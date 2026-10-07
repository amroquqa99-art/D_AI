# D_AI 本地推理与搜索

[English](d-ai-local.md) | 中文

本源码教程将自托管模型连接到原生 Harness Web profile，启用有限资源的调查 preset 和独立决策顾问，不提供规划中的完整 D_AI Control Center。先安装仓库支持的 Node/pnpm 版本并构建，再启动 Web 应用。模型服务是独立进程，Harness 不会自动下载模型。

## 1. 选择并启动推理

使用 [llama.cpp](https://github.com/ggml-org/llama.cpp) 或 [Ollama 的 OpenAI 兼容 API](https://docs.ollama.com/api/openai-compatibility)。从量化小模型、4096-token 服务上下文和一个推理槽开始。文件大小不等于运行时 RAM/VRAM 用量。增加上下文或并发前测量内存、延迟、有效工具调用和领域质量。标为修改版或不受限的模型仍需可追溯的基础模型、许可证、文件哈希和通过的评估；标签不是质量指标。

[Qwen3.5 系列](https://huggingface.co/Qwen)含 0.8B、2B、4B 候选。小顾问只能建议有限的下一步，不能确立科学事实或替代领域验证。测量资源后再选更强的 worker。在 6 GB GPU 同时加载多个模型前测量权重、缓存和运行时总开销。初始 profile 一次只允许一个顾问调用；D_AI 尚未实现 GPU 预留或自动模型切换。

使用 llama.cpp 时，下载经过审核的 GGUF，核对发布方 SHA256，再启动服务。以下别名对应 profile 的决策路由：

```sh
llama-server -m /absolute/path/reviewed-model.gguf \
  --alias dai-decision --host 127.0.0.1 --port 8081 \
  --ctx-size 4096 --parallel 1 --jinja --reasoning off
```

可以在 8080 端口单独启动别名为 `dai-worker` 的 worker，也可让两个角色共享服务和模型，避免两个模型同时驻留。CPU 测试使用 `--n-gpu-layers 0`；CUDA 卸载需要支持 CUDA 的构建及实测余量。查阅所固定版本的上游参数，不要假定所有版本接受同样参数。

Ollama 用户可启动服务并显式选择已发布标签，如 `qwen3.5:2b`。通过配置或带 `PARAMETER num_ctx 4096` 的 Modelfile 设置上下文 4096。两个角色变量使用实际创建的模型名。标签会变化；记录解析后的模型摘要以复现评估。

```sh
# Set both provider baseURL fields in the local overlay or Models page to:
# http://127.0.0.1:11434/v1

export D_AI_WORKER_MODEL=qwen3.5:2b
export D_AI_DECISION_MODEL=qwen3.5:2b
```

## 2. 启动显式启用的 profile

OpenAI 兼容 SDK 即使连接无密钥回环服务也需要凭据值。仅为此类服务设置 `D_AI_LOCAL_API_KEY=local-only`；认证端点必须使用真实密钥。不要把真实秘密写入 overlay 或提交。改为云端点会将所提供的上下文发送到该主机；自托管不等于设备本地。

```sh
export D_AI_LOCAL_API_KEY=local-only
pnpm dsh web \
  --patch packages/experimental/d-ai/cordis.source.patch.yml \
  --patch apps/cli/config/examples/d-ai/local.cordis.patch.yml \
  --no-open
```

该 profile 禁用内置 DeepSeek 适配器和搜索，使用明确的决策/worker 路由，禁用无人值守调度及模型自动标题，并选择 `dai-local` preset。已保存设置可覆盖组合默认值；处理私有数据前检查实际 Models 页和路由。不会自动退回付费提供方。推理不可用会报错，不会转为成功建议。

`d_ai_local_advise` 启动一个无工具、不继承父对话的独立原生子 agent。提供简短的已批准目标、当前情况及已有证据引用。严格 JSON 校验允许 `EXPLORE`、`VERIFY`、`ASK_HUMAN`、`WAIT`、`STOP`、`ESCALATE` 六种建议。格式错误、编造引用或置信度低于配置阈值会返回 `ESCALATE`。置信度由模型自行报告且未校准。建议不会授予权限、验证声明、改变任务状态或隐式激活模型。

此 preset 为初始调查路径暴露八个工具，避免向小模型发送完整的 78-tool 注册表。部署拥有的 `rootTools` 由原生作用域工具注册表强制执行。用于其他领域时明确扩展，再评估上下文压力和工具准确率。工具的独立审批要求仍适用。原生 token meter 和 compaction 服务仍拥有上下文；摘要上限为 512 token，并保留有限原文尾部。原始 Session/证据记录仍是权威事实。

## 3. 在线时连接搜索

运行 [SearXNG](https://github.com/searxng/searxng) 实例，并在设置的 `search.formats` 启用 `json`。[搜索 API](https://docs.searxng.org/dev/search_api.html) 在禁用此格式时返回 HTTP 403。适配器使用固定部署端点、拒绝重定向、限制响应/查询字节及来源数量，支持取消，保留 URL/标题/片段，不编造发布日期或权威性。公共引擎搜索仍需互联网；推理和已有记录可离线运行。

```sh
# Set the search overlay baseURL to the deployment-owned SearXNG URL.
pnpm dsh web \
  --patch packages/experimental/d-ai/cordis.source.patch.yml \
  --patch apps/cli/config/examples/d-ai/local.cordis.patch.yml \
  --patch apps/cli/config/examples/d-ai/search.cordis.patch.yml \
  --no-open
```

搜索 overlay 选择原生 `dai-searxng` 提供方。需要自主搜索时，通过已批准的工具 profile 向相应 worker 暴露 `web_search`；初始本地 profile 的领域 worker 设置为 `allowedTools: []`。API 兼容测试使用真实本地 HTTP fixture。实际 SearXNG 引擎实例的成功集成仍需独立验收。

## 4. 准备云端运行

在长期运行的 Linux 主机使用同一原生 profile，并在提供方 profile 或 Models 页显式配置私有推理端点。将 `DSH_HOME` 和模型/证据存储放到持久卷，提供认证 TLS 入口、限制推理/搜索端口、备份 Session 并测试重启恢复。在 D_AI 模型注册表把远程推理标为云端；路由名本身不能强制本地性。当前调度器是进程本地且基于活动 owner；冷 Session 激活和分布式多主机恢复仍需实现与验收。

本教程不会创建云部署。实际部署需要目标主机、访问方法、存储和支出限制。容器或 VM 可通过迁移推理降低桌面消耗，但不会消除计算成本。

## 5. 采用模型前验证

显式启用的验收测试启动并拥有真实 llama.cpp 子进程，核对 GGUF 哈希，再通过原生 pi-ai 适配器调用决策工具。父模型是确定性 fixture；一个案例通过只证明本地子推理和校验，不证明完整实机任务或广泛模型质量。测试后等待并终止服务。

```sh
D_AI_LLAMA_SERVER=/absolute/path/llama-server \
D_AI_GGUF=/absolute/path/reviewed-model.gguf \
D_AI_GGUF_SHA256=publisher_verified_sha256 \
pnpm exec vitest run packages/experimental/d-ai/tests/local-intelligence.live.spec.ts
```

晋升前加入保留的中英文案例，覆盖矛盾证据、缺失工具、审批、提示注入和不确定性。使用相同上下文及量化比较质量、有效 JSON/工具率、延迟、token 用量与峰值内存。保留失败候选作为评估证据，不要放宽校验以接纳它们。
