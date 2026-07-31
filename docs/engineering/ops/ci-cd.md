# CI/CD 与发布契约

本文是 Workspace 合并与生产发布的执行真源。目标是让日常反馈只覆盖本次选择的内容，让正式发布只做一次完整证明，并保留生产切换所需的备份、迁移、健康检查和回滚能力。

## 两种检查，不混用

日常协作由 Agent 选择检查，不再由脚本给文件划风险等级：

1. Agent 先固定 exact staged tree。
2. Agent 明确列出本次选择的文件、需要补充的依赖文件和要运行的命令。
3. `npm run check:agent -- --plan <file>` 只验证 staged evidence 并执行这些命令；它不推导风险，也不追加无关门禁。
4. `check:changed` 是通用轻量兜底，只处理 changed files 与已登记依赖。共享工作区的 unstaged、untracked 和其他人的改动不进入 key，也不进入候选。

生产发布只有一个固定证明：

```text
prepare: freeze Plan / candidate / mode / target / executors
  -> validate: full source CI once, or skipped_by_fast
  -> build: compile the sealed target artifact once
  -> deploy: consume the immutable artifact only
```

`prepare` 创建 append-only Release Plan，并一次封存 source/tree/content digest、租户配置 digest、standard/fast 模式、部署目标以及每个阶段的 local/CNB 执行器。默认全部走 local；可在 prepare 时用 `--cnb-from validate|build` 或逐项 `--executor stage=local|cnb` 选择单调的 local -> CNB 边界。Plan 创建后不得改模式、目标或执行器，也不得从 CNB 回到 local。

每个阶段只有 `pending -> running -> succeeded|failed|cancelled|skipped_by_fast`。终态不得重开：成功证据直接复用，失败或取消也不允许在同一 Plan 内重跑；修复或重新决策后必须显式 `prepare --new-plan`。新 Plan 若 source/tree/content/config 完全相同，可复用旧 Plan 的 prepare 证据，不重新做候选准备。

standard 模式中，`validate` 只运行一次 full source CI，`build` 只编译一次目标 artifact；两者不互相补跑。`deploy` 只消费二者的终态证据。fast 模式必须记录原因，把 `validate` 固定为 `skipped_by_fast`，但仍强制一次 build、artifact identity/digest、生产锁、备份、migration、健康检查、原子切换和回执；它不是绕过生产安全边界的入口。

CNB 配置中的容器准备、依赖准备是 runner 基础设施，不是业务阶段。只有本次 action 对应的发布脚本会产生业务证据，其余固定 stage 明确 no-op。当前支持从 validate 或 build 进入 CNB；`--cnb-from deploy` 预留给未来的跨平台 artifact capsule handoff，在该适配器完成前显式拒绝，避免 CNB 在 deploy 阶段偷偷重建。

`validate` 不读取风险等级、不按文件数升级，也不编译。源码 CI 与编译是两个独立阶段，前置失败不得触发自动全量重跑。Agent 先检查完整失败清单并集中修复，日常诊断只跑针对性命令；新的候选内容在真正部署前必须进入新 Plan。

## 候选隔离

- 发布候选是专用 release worktree 的已提交 tree；共享工作区可以任意 dirty。
- `push`、`prepare`、`validate` 和 `deploy` 不读取共享工作区的 unstaged、staged 或 untracked 内容。
- release worktree 自身仍须干净，因为它是冻结候选而不是协作区。
- commit SHA 只保留为审计来源和迁移历史定位，不再作为源码检查缓存、artifact cache 或 runtime build id 的命中条件。
- 候选 identity 是 `Git tree + SHA-256 content digest`；相同内容即使提交元数据不同，也复用同一验证与 artifact。

## 缓存契约

- 日常检查 key 由 HEAD tree、exact staged diff、受治理环境和任务命令组成；unstaged、untracked、PATH、Node 内存参数以及 base/head commit SHA 不使缓存失效。
- committed scope 只包含 HEAD tree；共享 index 和工作区状态完全忽略。
- artifact cache 以 `target/contentDigest` 寻址，并复验 tree、content digest、artifact digest、lockfile、migration set 和 deploy graph。
- 环境建立失败或缓存 miss 只是需要执行本次工作，不得诱发另一轮相同全量检查。

## 软耗时诊断

发布没有“超过 N 分钟即失败”的业务时间预算。计时只用于诊断：

- 单阶段或累计耗时超过软复查阈值时，Agent 检查排队、锁等待、重复全量、重复编译、依赖重装、缓存 miss 和过宽依赖闭包。
- CNB 等待超过软阈值只提示，不终止正在进行的发布。
- 同一候选若重复运行 full source CI 或 compile，诊断报告必须明确标出；成功回执直接复用。
- 网络连接、数据完整性、互斥锁和生产安全仍可因实际错误失败，它们不是时间预算。

## 失败处理

正式 `validate` 必须保存完整的 `passed / failed / blocked` 结果，`build` 保存独立 artifact 结果；任一失败都不生成可部署状态，而且本 Plan 随即终止。

失败后：

1. Agent 读取本轮全部错误与慢阶段诊断。
2. 一次性检查环境、依赖、数据库前置和目标 build 的全部已知问题。
3. 集中修改。
4. 用 Agent 声明的轻量命令验证修改点和依赖。
5. 显式创建新 Plan；不得重开原 Plan 的失败阶段，也不得自动循环全量 CI 或 build。

禁止把正式全量门禁当作逐错发现器，禁止自动“全量 -> 修一个 -> 全量”的循环。

## Migration 与生产安全

每个新增 `prisma/migrations/*/migration.sql` 的第一条非空行必须且只能声明一次：

```sql
-- workspace:migration-mode=expand
-- workspace:migration-mode=maintenance
```

`expand` 只用于旧 writer 与新 schema 可并存的向前兼容变化；其余变更必须使用 `maintenance`。已进入可信历史的 migration 不得修改、重命名或删除。生产入口仍根据 deployed source 到 candidate 的 migration 区间检查策略，这个历史定位是有业务含义的，不参与检查范围或缓存 key。

生产 deploy 继续强制：服务器互斥锁、runtime 与数据库凭据边界、备份、migration inventory、writer fencing、原子 current/Gateway 切换、健康检查、版本内容摘要复验、失败回滚和不可变部署回执。`deploy` 只能消费已经验证的 artifact，禁止现场补跑源码检查或编译。

分模块部署、Gateway generation、Profile、shadow/active 和 control-plane 细节见 `docs/engineering/ops/deploy-units.md`。数据库安全与恢复见 `docs/engineering/ops/database.md`。

## 运维模块与体量治理

`ops/deploy.sh` 是薄组合入口，私有实现位于 `ops/deploy/`：transport、state、artifact、runtime-supply、runtime-safety、atomic-cutover 和 health。发布候选、回执、验证和慢流程诊断位于 `ops/release/`。

依赖方向登记在：

- `scripts/arch/source-code-analysis/operations-module-policy.json`
- `scripts/arch/source-code-analysis/operations-size-policy.json`

`source-code-analysis:check` 同时验证唯一模块归属、单向依赖、无循环和脚本体量。新运维源码默认不得超过 450 行；历史超大文件按精确行数设只减不增基线，缩小后不得再抬高。原子切换的大型 remote transaction 作为深模块保留，但继续受只减不增约束。

## 常用命令

```bash
# exact staged tree 的基础检查
npm run check:precommit

# Agent 提交显式检查计划；脚本不替 Agent 选择命令
npm run check:agent -- --plan /absolute/path/to/check-plan.json

# 通用 changed-files 兜底
npm run check:changed

# 冻结候选，不编译
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh prepare

# 一次正式源码验证
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh validate

# 一次正式构建
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh build

# 只消费已构建 artifact
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh deploy

# 快速发布：明确跳过源码质量门禁，仍须 build + deploy
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh prepare --fast "线上故障紧急恢复"
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh build
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh deploy

# 从 validate 开始全部交给 CNB；未指定时所有阶段默认 local
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh prepare --cnb-from validate

# 查看只增不改的 Plan 进度和证据
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh status

# 失败/取消或改变决策后创建新 Plan
OPS_ENV_FILE=/path/to/ops/.env ops/publish.sh prepare --new-plan

# 运维模块、依赖和体量监管
npm run source-code-analysis:check
```
