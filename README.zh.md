# D_AI — Depth AI

[English](README.md) | 中文

> 最新检查点：[PR #21](https://github.com/amroquqa99-art/D_AI/pull/21)，草稿且未合并。源码仍在开发分支；此次主分支更新仅修改文档。

D_AI 是基于真实 DeepSeek Harness 源码构建的多系统 AI 运行环境。它使用原生 Cordis 插件、独立子 agent（智能体）、持久 Session（会话）事件、明确权限和有界执行。上游变更经过审核后手动集成；应用在运行时不会下载实时上游检出目录。

## 开发状态

当前开发分支为 `dai/container-environment-20261009`，基于尚未合并的调度器所有者公平性检查点。D_AI 尚非完整生产版本。源码变更、fixture（测试前置数据）证据与真实提供方验收分别记录状态。

六个领域切片——调查、科学研究、投资分析、网络安全、行动与情报、创新与发现——已有原生运行时路径。共享基础设施包括任务计划、带 fencing 的执行租约、检查点、证据与控制投影、路由策略以及本地决策建议器。完整 Control Center、真实连接器、分布式调度和受治理训练仍未完成。

使用下列当前报告查看实现与就绪情况：

- [阿拉伯语执行状态](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/D_AI_EXECUTION_STATUS_AR.md)。
- [功能验收矩阵](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/FEATURE_MATRIX.md)。
- [已执行检查与限制](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/TEST_REPORT.md)。

## 容器开发检查

[容器指南](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docker/README.md)说明固定摘要的 Node 镜像、仓库精确 pnpm 版本、冻结依赖、构建与检查服务以及镜像迁移。容器配置与失败传播检查已在本地通过；[验证报告](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/TEST_REPORT.md)另行记录当前完整源码的主机检查。镜像构建及容器内完整原生检查仍待在 Docker 主机执行；拟议命令不代表容器部署已经完成。

使用下列拟议容器命令前，请检出 `dai/container-environment-20261009`；这些命令的 Engine 验收仍待执行。

```sh
docker compose config --quiet
docker compose build check
docker compose run --rm check
```

复制源码的环境避免修改主机检出目录。它不包含模型或用户数据，也不启动产品 Web 应用。修改源码或锁文件后应重新构建。CI 设有独立容器作业；失败或未启动的工作流步骤不计为验证。

<a id="run"></a>
<a id="run-from-source"></a>

## 源码应用

现有源码路径使用受支持的 `dsh` 启动器：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh web
```

该命令启动底层 Harness Web 应用。完善的 D_AI 启动器与 Control Center 仍需构建。[可选本地推理与搜索指南](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/user/d-ai-local.md)连接明确选择的本地提供方；完整真实任务与离线部署还需进一步验收。

## 工程与来源归属

修改共享约定前，请阅读 [AGENTS.md](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/AGENTS.md)、[产品规格](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/PRODUCT_SPEC.md)及[工程协议](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/ENGINEERING_WORKING_AGREEMENT.md)。运行时权限、审批、审计与持久化规则保持执行；打包不会扩大权限。

源码来源为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。保留其 [MIT 许可证](LICENSE)与[第三方声明](THIRD_PARTY_NOTICES.md)。
