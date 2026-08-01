# CI/CD 与发布契约

本文是 Workspace 生产发布的执行真源。唯一生命周期是：

```text
ci -> Ready Artifact -> deploy
```

`prepare`、`validate`、`build`、fast mode、Release Plan、`--new-plan` 和按阶段切 local/CNB 均已删除，不提供兼容入口。

## 边界

### CI 的责任

`ops/publish.sh ci` 选择专用 release worktree 的已提交候选，并在同一次 invocation 中尽可能报出全部可发现问题：

1. 校验仓库外的租户/CNB 配置输入并计算配置摘要。
2. 对明确以 `_ci` 结尾的专用 PostgreSQL 数据库获取 advisory lock，验证 control role 是 database owner，清空并迁移完整 schema，再证明 runtime role 可读；整个 CI 结束后清空并释放锁。
3. 在执行前冻结完整源码任务图。
4. 运行所有可运行的独立 source checks；单项失败不终止其他独立项。
5. 与 source checks 独立地恢复或构建 exact target artifact；source 失败不阻止 artifact 暴露构建问题。
6. 对 exact artifact 做离线部署演练：校验 archive 路径、包内 symlink、完整 runtime 依赖、basePath、server entry 和 manifest，解包到临时目录，以已迁移的 CI 数据库启动 production standalone，探测 health 与 version，然后清理进程和目录。
7. 只有 source、CI database、artifact、演练和外部输入全部通过，才签发 Ready Artifact。

Ready Artifact 绑定：

- source commit、Git tree、content digest；
- 租户配置 digest 和 Full/unit/shadow/activate 目标；
- aggregate source result、冻结 task graph 和逐任务回执集合；
- artifact、manifest、artifact receipt 和启动演练回执的 SHA-256；
- runtime entry、BUILD_ID、basePath 与必要部署文件。

无法在 CI 确定的只有生产现场事实，例如当前生产版本、部署锁、生产数据库 migration 区间、备份、writer fencing、传输后的远端 digest、原子切换、公开 health 和回滚。这些属于 deploy。

### Deploy 的责任

`ops/publish.sh deploy` 只允许当前 release source、配置和目标已经存在 exact Ready Artifact。它可以：

- 恢复并复验 Ready Artifact；
- 读取当前生产状态并执行 ancestry/migration preflight；
- 获取生产锁，创建备份并执行 migration；
- 传输并复验 artifact，warm up candidate，原子切换；
- 验证公开 health/version，失败时回滚；
- 写不可变部署回执和通知。

它禁止 source check、typecheck、lint、Next build、artifact build、临时补包或 cache miss 后现场构建。deploy cache miss 是 CI 未完成，不是 deploy 的修复机会。

## 一次报全与增量收敛

正式 source suite 设置 aggregate mode。冻结任务状态只有：

- `reused`：input/command/runtime digest 与成功回执完全一致；
- `pending`：本轮必须执行；
- `blocked`：真实输入描述无法计算，仍计入最终失败，但不阻止其他任务；

每个任务回执的 key 是：

```text
taskKey + taskContractVersion + inputDigest + commandDigest + runtimeDigest
```

成功任务进入持久回执库；failed、cancelled 和未声明可复用的 warning 不进入。修复后再次运行 `ci` 时，精确输入未变化的任务直接复用，只执行失效任务。因此第一次可能是 100%，第二次接近变更闭包，后续继续缩小，而不是每轮重跑全量。

derived task receipt 损坏时会先移入 quarantine，再把任务改为 pending 重算；不能因一个坏缓存永久 blocked。artifact cache 损坏时，未被 production/rollback pin 的目录同样先隔离再重建；被 pin 的目录拒绝自动移动并要求人工审计。

同一轮中 external preflight、CI database、source、artifact 和 artifact rehearsal 聚合汇总。即使 database/source 已失败，artifact 仍继续；只有依赖于未就绪 database 或缺失 artifact 的演练会明确标记 blocked。artifact rehearsal 是依赖阶段：无效 archive 无法被启动，但 database migration 已在 artifact 之前独立执行，因此数据库和迁移问题仍会在同一轮进入完整清单。

## 候选与缓存

- CI 候选只来自干净 release worktree 的已提交 tree；共享开发 worktree 的 staged、unstaged 和 untracked 内容不参与。
- content identity 是 `Git tree + SHA-256 content digest`。commit SHA 保留用于审计和 migration ancestry，不作为 task/artifact cache 的唯一 key。
- release `.env` 必须是指向受控 CI 环境文件的符号链接；不得把桌面或生产 secrets 写入源码。该文件中的 `DATABASE_URL`/`DIRECT_URL` 必须指向同一专用 `*_ci` 数据库，control role 必须拥有它；生产数据库会在任何 reset 之前被拒绝。channel adapter 提供 `RELEASE_CI_DATABASE_CA_FILE`（local 优先使用 `/etc/workspace/postgresql/ca.pem`），sandbox 强制把最终 URL 固定为 `sslmode=verify-full` 和该 CA，并用相同 Node driver 证明 runtime 读取。
- `ops/cache-policy.json` 是缓存容量、水位、retention 和 pin 的唯一版本化策略源。
- task receipt 位于 `.cache/check-results/<task>/<input>.json`；artifact cache 位于 `.cache/release-artifacts/<target>/<contentDigest>`。
- 当前 production 和一个 rollback artifact 必须 pin，不参与普通 LRU 驱逐。
- deploy 恢复 cache 时优先使用同文件系统 immutable hardlink；跨文件系统才复制。artifact 在生产传输前后仍各做必要 digest 复验。

## Local 与 CNB

Local 和 CNB 只是执行渠道，不是不同的 CI/CD 模型。任何渠道适配器都必须调用相同的 source aggregator、artifact builder/rehearsal、Ready schema 和 deploy entry，并产生相同成功判定。

渠道不得：

- 增加 `validate/build` 等私有生命周期；
- 在 deploy channel 中补跑 CI 或重建 artifact；
- 使用不同检查集合、宽松回执或不同 production safety gates；
- 把渠道切换写进 Ready Artifact。Ready 描述“什么可以部署”，channel 只描述“在哪里执行/如何传输”。

当前 operator 默认使用 local，因为它直接复用 release worktree 缓存，部署请求到切换的延迟最低。旧 `release-to-cnb.sh` 分段入口已拒绝；CNB adapter 只有在能持久化并消费同一种 Ready Artifact 时才可启用，不能用 CNB 重新 build 来伪装 deploy channel。

## 失败处理

一次 `ci` 失败后：

1. 保存本轮完整 failed/blocked/preflight/artifact/rehearsal 汇总。
2. Agent 一次性审计完整清单和依赖链，集中修复。
3. 用针对性命令验证修改点；不要把正式 CI 当逐错调试器。
4. 再运行 `ci`。它复用成功的 exact-input 回执和 exact artifact/rehearsal，只执行增量。
5. 只有新的 Ready Artifact 签发后才能 deploy。

不创建 Plan，不授权 `--new-plan`，也不存在“完成一个阶段后重新开阶段”。CI 的完成定义就是 Ready 已签发；deploy 的完成定义就是生产回执、health/version 与切换状态一致。

## Migration 与生产安全

新增 migration 的第一条非空行必须声明一次：

```sql
-- workspace:migration-mode=expand
-- workspace:migration-mode=maintenance
```

`expand` 只用于旧 writer 与新 schema 可并存的向前兼容变化；其余使用 `maintenance`。可信历史中的 migration 不得修改、重命名或删除。

生产 deploy 继续强制：source ancestry、migration inventory、生产互斥锁、runtime/数据库凭据边界、备份、writer fencing、原子 current/Gateway 切换、candidate/public health、content version、失败回滚和不可变部署回执。这些现场检查不搬到 CI，也不允许 deploy 借此执行源码修复。

分模块部署见 [`deploy-units.md`](./deploy-units.md)，数据库安全与恢复见 [`database.md`](./database.md)。

## 常用命令

```bash
# 日常精确检查
npm run check:precommit
npm run check:agent -- --plan /absolute/path/to/check-plan.json
npm run check:changed

# 代码完成时运行；聚合 source + artifact + exact runtime rehearsal，签发 Ready
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci

# 单 unit 目标在 CI 时确定，并进入同一种 Ready contract
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci --deploy-unit finance
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci --shadow-unit finance

# 只查看 Ready
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh status

# 用户下达部署命令后只消费 Ready
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh deploy

# 运维模块、依赖和体量治理
npm run source-code-analysis:check
```
