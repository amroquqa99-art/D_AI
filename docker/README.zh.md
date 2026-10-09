# D_AI 容器检查

[English](README.md) | 中文

本贡献者教程定义容器构建与检查路径。它需要完整源码检出，以及可运行的 Docker Engine 和 Docker Compose v2 或更高版本。配置与运行器检查已在本地通过；镜像构建、依赖安装和完整容器内验收仍待执行。[验证报告](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/TEST_REPORT.md)负责区分这些证据。

## 1. 构建源码环境

下列拟议 Engine 命令仍需在 Docker 主机上验收。基础镜像为官方 Node 24.19.0 Bookworm 多平台镜像，并固定其镜像仓库索引摘要。pnpm 11.7.0 与根目录声明的包管理器版本一致。镜像使用仓库锁文件及已审核的安装脚本与补丁策略。基础镜像提供原生编译器、Python 和 Node 头文件；构建断言拒绝缺失的工具。不额外安装可变的 apt 软件包。

```sh
docker compose config --quiet
docker compose build check
```

BuildKit 保留带锁的 pnpm 下载缓存；镜像层保留已安装依赖。修改源码或锁文件后需要重新构建。缓存用于加速构建，正确性不依赖缓存。镜像复制源码时排除主机 `node_modules`、生成的包输出、Git 元数据、环境文件和模型权重。仅将已审核的检出目录作为上下文；忽略列表不是通用秘密扫描器。

pnpm 命令执行前的依赖验证设为 `error`：已安装快照不一致时停止检查，而不隐式联网安装。应重新构建镜像以更新依赖；不要在验收过程中修复其锁文件。

## 2. 运行验收检查

```sh
docker compose run --rm check
```

运行器检查自身命令顺序、检查所有者排序、验证已提交的持久化目录而不重新生成、检查 D_AI 严格类型、构建完整工作区，然后运行协调器、提供方与包回归测试。每条命令成功后才执行下一条。仅 HTTP fixture（测试前置数据）的测试调用禁用 Node 环境代理功能，避免将回环 fixture 流量默默发往主机代理。运行器回归测试替换命令，仅验证编排与失败传播。

源码镜像使用现有非特权 `node` 用户。Compose 添加进程回收器。两个服务均不挂载主机检出目录、凭证、Docker 套接字或持久应用主目录。`CI=true` 避免向复制的源码安装 Git 钩子。Node 堆上限为 8 GiB；原生进程与构建工具还需要额外内存。测试最多使用四个 Vitest 工作进程。该环境不是机构级隔离边界。

## 3. 构建或查看快照

```sh
docker compose build build
docker compose run --rm build
docker compose run --rm check bash
```

`build` 服务运行现有完整工作区构建。Shell 查看镜像内固化的源码与依赖，不编辑主机检出目录。在主机修改源码后重新构建。`--rm` 容器中的构建输出与 Shell 修改均为临时内容。两个服务均不启动产品 Web 应用、模型服务、搜索引擎、数据库或 GPU 运行时。应用部署、持久 Session（会话）存储、模型产物和真实提供方验证属于独立工作。

## 4. 迁移已准备的环境

在主机构建成功后，明确保存源码与依赖镜像：

```sh
docker image save dai-source:local -o dai-source-environment.tar
docker image load -i dai-source-environment.tar
docker run --rm --init dai-source:local
```

目标主机应使用匹配的 CPU 架构。迁移镜像可避免重新安装其中固化的依赖；首次构建仍需要镜像仓库与包下载网络。镜像不包含模型、用户数据、可选工具下载，也不代表完整离线部署已通过测试。将镜像归档视为私有项目源码并保存在检出目录之外。Docker 构建失败或测试失败会阻止验收；生成配置不是镜像构建凭据。
