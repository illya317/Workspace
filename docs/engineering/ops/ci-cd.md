# CI/CD 与发布契约

本文是 Workspace 生产发布的执行真源。唯一生命周期是：

```text
ci -> Ready -> deploy
```

这里的 Ready 是一个部署前证明集合：CI 签发 Application Ready；deploy 前，`controller-ready` 对当前 controller（可与 Application Ready 同源，也可只沿 deploy-control seam 前进）另行签发 Controller Ready。Controller Ready 是 deploy 的独立前置证明，不是第三个应用 lifecycle stage，也不改变 Application Ready 或 artifact。

`prepare`、`validate`、`build`、fast mode、Release Plan、`--new-plan` 和按阶段切 local/CNB 均已删除，不提供兼容入口。

## 正式 release 七阶段

七阶段描述依赖顺序，不要求所有独立重任务永远串行；channel 不得改序或拆成可绕过 lifecycle：

1. **Candidate/config freeze**：固定 source SHA/tree/content、tenant configuration、target/mode，并只生成一次 `RELEASE_CI_RUN_ID`。
2. **Stage-2 Artifact preflight**：在任何 DB reset、完整 Source CI 或 Next build 前，以真实 Next config loader 检查 exact target、生成 App、Node/npm/Next/package-lock、受控 `node_modules` symlink、PATH 工具和 build-space，写 run-scoped immutable receipt。
3. **Source CI + artifact build**：CI database sandbox 是共同运行依赖；source lane 与 artifact lane 各写独立 result/receipt。本机 3 CPU/10 GiB 环境为避免争抢而串行，资源隔离充分的 runner 可并行。
4. **Artifact static acceptance**：复验 builder、manifest、SBOM 和 archive；rehearsal 在启动前先运行 `inspectArchive`。
5. **Isolated startup**：用同轮 CI database 启动 exact archive；单 unit 必须创建临时 Ed25519 identity，并注入与生产 `start_release` 相同的 unit/slot/state/signing/trust/replay/origin/pool/application-name 环境面，验证 health/version 后清理。生产启动环境面新增或删除字段而 rehearsal 未同步时，契约测试直接失败；日志或响应命中明确的部署身份环境错误时秒级失败并保留运行日志，普通可恢复 5xx 仍继续等待 readiness。演练的 internal origin 刻意指向隔离进程自身，不冒充生产 Gateway；签名、audience、trust 与 replay 行为由 Platform source contract 覆盖，真实 Gateway 路由由 Controller Ready 与 deploy 现场验证负责。
6. **Application Ready**：绑定 Stage-2、source、artifact、static acceptance 与 startup proof。
7. **Controller Ready → Deploy**：独立签发 Controller Ready；deploy 只复验两份 Ready 并执行生产现场安全动作。

Stage-2 失败立即停止后续重任务。只有有依赖的阶段不可越过；source/artifact 两条 lane 的执行并行度由受控资源决定，不能牺牲独立结果或回执。

## 边界

### CI 的责任

`ops/publish.sh ci` 选择专用 release worktree 的已提交候选，并在同一次 invocation 中尽可能报出全部可发现问题：

1. 校验仓库外租户/CNB 输入、计算配置摘要并冻结同轮 run id。
2. 执行 Stage-2 Artifact 预检并写不可变回执；失败时不启动 database/source/build。
3. 对 `_ci` database 获取 advisory lock，验证 owner，清空并迁移 schema，再证明 runtime role 可读。
4. 冻结并运行 target-aware source task graph，聚合独立 source failures。
5. 独立恢复或构建 exact target artifact；source 失败不改写 artifact 结果。
6. 对 exact artifact 做离线启动演练并探测 health/version。
7. 复验 preflight/database/source/artifact/rehearsal 的 exact identity 后签发 Ready Artifact。

source task graph 按 Ready 目标冻结。`monolith` 继续执行完整 `release-source`：完整 `release-static`、全部 Node shards 与全部 TypeScript scopes。显式 deploy unit 仍保留同一套 `release-static` 安全合同，只把三个可安全缩小的叶子换成 deploy graph 派生闭包：ESLint 扫描目标私有根、compiler closure 的共享/目标根和生成 App 根；Node 运行 compiler packages、`app`、`scripts/check`、`scripts/deploy`，并从 `unit.privateSourceRoots` 派生 `scripts/*` 等非 package 测试区（`ops` shard 由独立 Controller Ready 覆盖）；TypeScript 只运行 `unit.checks.typecheckScopes`。每个叶子仍按 exact input/command/runtime 缓存，未知 unit 或 graph scope 直接失败，不回退为猜测集合。

aggregate source result 与 schema-v3 source validation receipt 都绑定 `monolith` 或精确 unit id 以及 CI run id。receipt 写入 `source-validation-<target>-<CI_RUN_ID>.json`，因此同一 content 的不同 target、以及同一 target 的多次 CI Ready 都可以并存；Ready 复验拒绝跨 target/run 的 result/receipt，复制旧 receipt 不能冒充新 run。rehearsal 写入 `rehearsal-<target>-<mode>-<CI_RUN_ID>-<config>.json`，旧 mode/run 的启动证据同样不会被覆盖或误选。

Ready Artifact 绑定：

- source commit、Git tree、content digest；
- 租户配置 digest 和 Full/unit/shadow/activate 目标；
- aggregate source result、冻结 task graph 和逐任务回执集合；
- artifact、manifest、artifact receipt 和启动演练回执的 SHA-256；
- runtime entry、Next `BUILD_ID`、deployment ID、basePath 与必要部署文件。

三类身份不可混用：content digest 绑定候选 Git tree 的内容；Next `.next/BUILD_ID` 是实际编译产物身份，manifest 的 `buildId` 必须从 archive 中该文件读取并与其一致；`deploymentId` 是滚动部署 version-skew/cache-bust、health/version 与 activation 使用的运行身份。同一 artifact 的 `buildId` 和 `deploymentId` 都必须存在，但不要求相等。

Application Ready receipt 与 current pointer 都按 `target + mode` 隔离：receipt 写入 `receipts/<target>/<mode>/<CI_RUN_ID>-<content>-<config>.json` 且不可变，pointer 写入 `pointers/<target>/<mode>/current.json` 并只指向该槽位最新签发的 receipt。`monolith` 只有 `activate`；同一 unit 的 `activate` 与 `shadow` 是互不覆盖的两个槽位。

`status`、`controller-ready` 和 `deploy` 的 `--deploy-unit` / `--shadow-unit` 参数只是选择一个已经签发的 exact Ready 槽位。命令会再次核对 pointer 与 receipt 的 target/mode；selector 不能在 deploy 阶段改写 receipt、把 artifact 重定向到另一个 unit，或把 activate/shadow 相互转换。目标不存在、模式不符或 receipt 不一致时直接失败。

所有 unit selector 都只接受一次且不接受保留 id `monolith`；monolith 必须通过无 selector 的默认入口选择。重复 `--deploy-unit`/`--shadow-unit`，以及 `ci --shadow-unit monolith` 等输入在候选准备前直接失败，不能静默降级为 monolith activate。

无法在 CI 确定的只有生产现场事实，例如当前生产版本、部署锁、生产数据库 migration 区间、备份、writer fencing、传输后的远端 digest、原子切换、公开 health 和回滚。这些属于 deploy。

### Controller Ready 的责任

`ops/publish.sh controller-ready` 加载当前 Application Ready 后只调用 Controller Ready module 的 `qualify` interface。module 自己确认入口仓库 controller 是 Application Ready source 的后代且差异只包含登记的 deploy-control 文件，并冻结 `readySource + controller sourceSha/treeId/controlDigest + changedFiles`。

昂贵的 ops shard qualification 与面向当前 Application Ready 的 binding 分开存证。qualification key 精确绑定 `controlDigest + 固定命令 digest + Node runtime digest`，持久回执位于 `.cache/release-control/controller-qualifications/<controlDigest>/<commandDigest>-<runtimeDigest>.json`。cache miss 时，module 内部固定的受锁 runner 真实执行完整 `node scripts/check/with-check-lock.js -- node scripts/testing/run-node-tests.mjs shard ops`，把 exit code、Node runtime identity 和输出 digest 规范化为 passed evidence，并以不可变首写方式保存；cache hit 时复验整份 qualification 回执及其内容 digest，绝不重跑 ops shard。命中或执行完成后，module 都重新计算 controller tuple；tuple 完全一致才签发 schema-v2 Controller Ready binding 到当前 controller worktree 的 `.cache/release-control/controller-ready.json`。

`qualify` interface 与 CLI 都不接受 runner 或 passed evidence 注入；测试在临时 Git repository 中提交并运行真实的最小 child fixture，覆盖成功、非零退出、运行期间 controller 漂移，以及 application-only Ready 变化时复用 qualification。该资格检查不访问 production。

Controller Ready 回执精确绑定：

- 当前 Application Ready 的 `readySource`；
- controller 的 source SHA、Git tree、control digest 和相对 Application Ready 的 changed-files 列表；
- 内嵌的完整 ops qualification：control digest、固定命令及其 digest、Node runtime 及其 digest、passed exit/output evidence 和 qualification receipt digest；
- 完成时间和回执内容 digest。

已有 Controller Ready binding 在 Application Ready 改变后仍会因 `readySource` 不匹配而拒绝 deploy，必须重新运行 `controller-ready` 绑定新 Ready；但如果只是 application-only 变化，且 control digest、固定命令与 Node runtime 均未变化，本次只复用既有 qualification 并重签 binding，不运行 ops shard。control digest、命令或 runtime 任一漂移都会 cache miss 并真实重跑 ops shard。controller HEAD/tree/changed-files 漂移、qualification 或 binding 缺失/损坏、passed evidence 不完整均 fail closed。该命令不运行应用 source gate，不构建或修改 artifact，也不访问生产。

### Deploy 的责任

`ops/publish.sh deploy` 只允许 release source、配置和目标已经存在 exact Application Ready，且入口仓库当前 controller 已有精确匹配的 Controller Ready。应用候选继续固定在 Application Ready source；controller 可以是它的后代，但差异只能包含显式登记的 deploy-control 文件。deploy 只复验两份回执，并把 controller source/tree/control digest/Controller Ready receipt digest 写入 canonical `deployed-release.json`；任何应用、schema、artifact builder、未登记路径变化或 Controller Ready 漂移都失败。它可以：

- 恢复并复验 Ready Artifact；
- 原子安装租户配置后恢复 runtime traverse/read/write ACL，并在 SSH master 建立后再次恢复可能被登录策略收紧的 parent ACL，再验证受限 PM2 runner；
- 读取当前生产状态并执行 ancestry/migration preflight；
- 获取生产锁，创建备份并执行 migration；
- 传输并复验 artifact，warm up candidate，原子切换；
- 验证公开 health/version，失败时回滚；
- 写不可变部署回执和通知。

它禁止测试、应用 source check、typecheck、lint、Next build、artifact build、临时补包或 cache miss 后现场构建。controller 与 Application Ready source 不同时，deploy 也只验证提前签发的 Controller Ready，绝不补跑 ops shard。deploy cache miss 是 CI 未完成，不是 deploy 的修复机会。

当生产 Application source 已与 Application Ready 完全相同时，deploy 在生产锁内复验实时 health/version，并比较 deployed receipt 中的 Controller Ready 四元组。四元组相同是纯 no-op；四元组不同则只原子激活新的 controller identity，保留既有 source、artifact、migration 和 deployment identity，不重建 artifact、不执行 migration、不重启应用。旧 schema-v3 deployed receipt 可读，但下一次部署或 controller activation 会写成带完整 controller 的 schema v4。

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

每次 `ci` 无论成功或失败，都会在 gitignored `.cache/release-attempts` 写入一份 run-scoped immutable attempt receipt，并为八个 lane 保留 `0600` 日志、耗时、证据摘要和稳定故障指纹。后续同责任 lane 通过时，回执记录修复 commit；已关闭指纹再次出现会以 P1 和退出码 `42` 阻止 Ready。字段、巡检命令和敏感信息边界见 [Release CI attempt receipts](./release-ci-attempts.md)。

Controller Ready 采用相同的精确复用原则，但不把 application source 误算为 ops qualification 输入：application-only 新 Ready 只使 binding 失效，控制面 qualification 仍按 `controlDigest + commandDigest + runtimeDigest` 复用。只有这三个输入之一变化才重跑完整 ops shard；新的 binding 始终重新绑定当前 `readySource` 和完整 controller provenance。

derived task receipt 损坏时会先移入 quarantine，再把任务改为 pending 重算；不能因一个坏缓存永久 blocked。artifact cache 损坏时，未被 production/rollback pin 的目录同样先隔离再重建；被 pin 的目录拒绝自动移动并要求人工审计。

同一轮中 external preflight、CI database、source、artifact 和 artifact rehearsal 聚合汇总。即使 database/source 已失败，artifact 仍继续；只有依赖于未就绪 database 或缺失 artifact 的演练会明确标记 blocked。artifact rehearsal 是依赖阶段：无效 archive 无法被启动，但 database migration 已在 artifact 之前独立执行，因此数据库和迁移问题仍会在同一轮进入完整清单。

## 候选与缓存

- CI 候选只来自干净 release worktree 的已提交 tree；共享开发 worktree 的 staged、unstaged 和 untracked 内容不参与。
- content identity 是 `Git tree + SHA-256 content digest`。commit SHA 保留用于审计和 migration ancestry，不作为 task/artifact cache 的唯一 key。
- release `.env` 必须是指向受控 CI 环境文件的符号链接；不得把桌面或生产 secrets 写入源码。该文件中的 `DATABASE_URL`/`DIRECT_URL` 必须指向同一专用 `*_ci` 数据库，control role 必须拥有它；生产数据库会在任何 reset 之前被拒绝。channel adapter 提供 `RELEASE_CI_DATABASE_CA_FILE`（local 优先使用 `/etc/workspace/postgresql/ca.pem`），sandbox 强制把最终 URL 固定为 `sslmode=verify-full` 和该 CA，并用相同 Node driver 证明 runtime 读取。
- `ops/cache-policy.json` 是缓存容量、水位、retention 和 pin 的唯一版本化策略源。
- task receipt 位于 `.cache/check-results/<task>/<input>.json`；Controller qualification 位于 `.cache/release-control/controller-qualifications/<controlDigest>/<commandDigest>-<runtimeDigest>.json`；target/run-bound source receipt 位于 `.cache/release-artifacts/evidence/<contentDigest>/source-validation-<target>-<CI_RUN_ID>.json`；artifact cache 位于 `.cache/release-artifacts/<target>/<contentDigest>`。
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

# 当前 Application Ready 上独立验证并签发 controller；不改变或重建 artifact
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh controller-ready

# 单 unit 目标在 CI 时确定，并进入同一种 Ready contract
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci --deploy-unit finance
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci --shadow-unit finance

# 只查看 Application Ready；unit selector 选择已经签发的对应槽位
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh status
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh status --deploy-unit finance
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh status --shadow-unit finance

# 为已签发的 unit Ready 签发同一 selector 对应的 Controller Ready
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh controller-ready --deploy-unit finance
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh controller-ready --shadow-unit finance

# 用户下达部署命令后只消费并复验 selector 对应的 Application Ready + Controller Ready
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh deploy
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh deploy --deploy-unit finance
OPS_ENV_FILE=/path/to/ops.env ops/publish.sh deploy --shadow-unit finance

# 运维模块、依赖和体量治理
npm run source-code-analysis:check
```
