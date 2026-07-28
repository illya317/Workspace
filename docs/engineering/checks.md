# Checks

本项目把检查分成静态 lint、类型、架构/契约 gate、行为测试、真实依赖集成测试和浏览器 E2E。命令可以在 CI 中串起来，但每类检查只负责自己的边界，失败时应能直接判断是代码质量、结构契约还是运行行为出了问题。

`apps/*` 是由部署图生成的独立 Next App 镜像，不是第二份源码事实源。ESLint 只扫描 `app/`、`packages/` 和工具源码；生成 App 由 `deploy:apps:check` 做逐字一致性校验，避免 full lint 重复扫描每个 L1 及其 `.next` 构建目录。

本地多 agent 并行时，确定性的静态检查和 Node 测试以“同一台机器、同一代码快照、同一命令成功一次”为准。每个 agent 都可以收口自己的任务，但检查结果是工作区级别共享的：谁先跑通都算，后续同快照同命令直接复用。`scripts/check/with-check-lock.js` 默认只在最外层计算一次包含 HEAD、staged、unstaged、untracked 和相关环境的快照，子进程继承快照 key；结束时重新取样，工作区漂移就拒绝本轮结果。pre-commit hook 是显式例外：它设置 `CHECK_WORKSPACE_SNAPSHOT_SCOPE=committed`，缓存身份和结束复验只绑定 `HEAD + staged index + 检查环境`，其他 agent 的 unstaged/untracked 变化不参与该次提交检查。成功结果默认可复用 6 小时，`build`、Prisma generate、环境和 Playwright 残留进程等依赖外部状态的任务不缓存。

复合检查统一由 `scripts/check/run-check-suite.mjs` 展开为有序 DAG。一个 suite 在整个执行期只持有一次项目检查锁；嵌套 suite 会被摊平，相同叶子只执行一次，全量 lint/type/UI gate 会覆盖对应增量步骤；full domain 只有在没有 staged-only 视图、两者读取同一 worktree 时才覆盖 changed domain。changed lint、domain 和 migration 共享一次文件集合计算，多个 structure gate 共享一次结构报告。只要快照没漂移，即使后续步骤失败，之前成功的部分结果也会留下供下一轮复用。不要同时启动 `check:blockers`、`gate:domain`、`gate:ui` 或 `arch:structure:*` 来“加速”，总入口已经包含对应叶子，额外启动只会等待 suite 锁。收到终止信号时，锁包装器会终止整棵子进程树并释放锁。

## 常用命令

| 场景 | 命令 | 说明 |
|---|---|---|
| 局部 TS/TSX 改动 | `npm run check:changed` | 跑 Playwright 生命周期、changed ESLint、静态 contract 和 domain/migration changed；日常开发不自动跑全库 TypeScript，也不检查净增行。 |
| 单个 TypeScript 工程 | `npm run typecheck:scope -- <package>` | 只构建指定 package 及其上游引用；也支持 `app`、`tooling`、`prisma-client` 以及生成 App 的 `app-<unit>` scope。 |
| 当前改动的直接 TypeScript 工程 | `npm run typecheck:quick` | 只选择直接 package/App scope，不展开所有下游消费者；编译器/构建输入变化时直接拒绝，不会暗中升级到全图。 |
| 受影响 TypeScript 闭包 | `WORKSPACE_CHANGED_FILES_JSON='[...]' npm run typecheck:affected` | 按 deploy graph 选择 owner unit 及其反向消费者的 package/App scopes；未知、共享或部署协议变化 fail closed 到全部受治理 scopes。 |
| TypeScript 工程图治理 | `npm run typecheck:references:check` | 锁定根 project references、源码 ownership 与 CI 声明/build-info 成对缓存契约；不执行编译。 |
| 本地提交默认检查 | `npm run check:precommit` | pre-commit 默认入口，只跑 staged/changed 增量，不自动运行全库 TypeScript；hook 的 committed 快照不会纳入其他 agent 的 unstaged/untracked 文件。全量本地提交用 `PRE_COMMIT_FULL=1 git commit ...`。 |
| 本地推送自适应检查 | `npm run check:push` | 按 `origin/main..HEAD` 的完整 diff 分类：C0 只跑无依赖文档检查，纯业务展示资源 C1 只跑 migration policy，映射到 C1 的代码仍跑去重后的代码 suite；C2/C3 把 blockers、changed 和 Node 摊平成同一 suite。显式全量用 `npm run check:push:full`。当前 HEAD tree 已有本地 full-CI 通过记录时，只补 base-dependent migration policy；调用方 Node 小版本、平台和架构不参与复用判断。 |
| 清债/重构改动 | `npm run check:refactor` | 跑拆分质量、changed lint 和静态 contract；类型检查留到显式诊断或 CI/发布。 |
| 仅检查本次总行数预算 | `npm run complexity:line-budget` | 检查 staged diff；没有 staged diff 时检查 tracked changed + untracked。默认净增必须 `<= 0`。 |
| 仅检查拆分质量 | `npm run complexity:split-quality` | 防止为过 `max-lines` 把大文件随便搬家。 |
| 当前变更阻断项 | `npm run check:blockers` | 跑业务阻断和 UI 阻断；这些问题由当前改动 agent 自己修。 |
| 业务阻断 | `npm run gate:domain` | API、route、resource、RBAC、domain validation、app route 和包边界。 |
| UI 阻断 | `npm run gate:ui` | Core UI 唯一入口、PageSurface 协议、Toolbar/Input/Selector 等结构性 UI 边界。 |
| 架构兼容入口 | `npm run check:arch` | 等价于 `npm run check:blockers`。`npm run arch:gate` 保留为兼容总入口。 |
| Prisma schema、model、migration | `npm run check:data` | 跑 schema 合法性、schema governance 和 migration diff。 |
| 所有 Node 行为/工具测试 | `npm test` / `npm run test:node` | 自动发现 `packages/`、`scripts/`、`app/`、`ops/` 下的 JS/TS `.test.*`，是 PR / CI 的标准 Node 测试入口。 |
| 产品行为测试 | `npm run test:behavior` | 执行 `packages/`、`app/` 和 `scripts/runtime/` 下的行为测试；不包含扫描器自测。 |
| 工程工具自测 | `npm run test:tooling` | 执行 `scripts/` 与 `ops/` 下的 checker/scanner、CI/CD contract fixture 与测试基础设施安全测试。 |
| Action contract 行为 | `npm run test:contract` | 执行 ActionContract、BusinessAction command 与 route binding 的运行时行为测试。 |
| Work 计划治理行为 | `npm run test:domain:work-plan-governance` | 执行 reopen、scope、report action/snapshot、在途引用和完成联动等领域行为测试。 |
| 可扩展性契约 | `npm run test:scalability-contract` | 用 mock/fixture 阻断全量读取、内存分页和调用次数爆炸；不把它当作真实延迟测试。 |
| PostgreSQL integration | `npm run test:integration:postgresql` | 在一次性 `*_ci` 库执行真实 PostgreSQL runtime/constraint、并发通知读取与并发写入 capacity smoke。 |
| 关键浏览器保存闭环 | `npm run test:e2e:critical` | 先拒绝非一次性数据库并 seed 身份，再执行页面操作 → 保存 → API/DB 回读 → 刷新保留；账户页暖重载超过 `10 s` 会阻断。 |
| 本地全量/生产发布门禁 | `npm run check:ci` | 入口自动切换到 `.node-version` 的仓库 Node 主版本，串行执行去重后的静态门禁、全部 Node 测试、full type 和 production build；某个独立步骤失败后继续收集其余步骤，最后一次性汇总全部阻断项。成功步骤按精确 workspace snapshot/命令/检查环境复用；干净 HEAD 全部通过后原子记录 tree-bound 结果。 |
| 单元生产发布门禁 | `OPS_ENV_FILE=/path/to/private/.env ops/publish.sh prepare --deploy-unit <id>` | 在同一干净 release worktree 运行共享静态/data/Node 证据，再由 deploy graph 指定的 package + `app-<unit>` scopes、独立 Next artifact、一次性 PostgreSQL 和该 unit 的浏览器证据收口。回执和 `.cache/next-units/<unit>` 均按 unit 隔离；不能替代或复用 Full 回执。 |
| 兼容旧入口 | `npm run check:full` | `check:ci` 的别名。 |
| 日常 hygiene 提示 | `npm run check:hygiene:warn` | 跑简单清扫项但永远退出 0。 |
| 周期性清债 | `npm run check:hygiene` | 强制巡检租户硬编码和简单 structure hygiene 债务；active baseline 固定为零，定时 CI 每晚 strict 执行，Hygiene 至少每周复查结果。 |
| Core UI surface 边界 | `npm run arch:surface-boundaries` | 输出完整 Surface 声明关系与业务侧 deprecated escape hatch 报告；声明 owner、允许路径和规模边界同时由 `gate:ui` 硬阻断。 |
| Core UI 新建入口 | `npm run arch:create-surface-entry` | 禁止业务侧自行声明新建 `+`、旧 Toolbar create 或直接 import 旧 renderer；折叠、树展开和数值增减不在扫描范围。 |
| 全项目保存/提交运行时 | `npm run arch:action-runtime-ui` | 禁止业务 UI 用权限布尔值手拼保存/提交、同时暴露两个持久化出口，或在 CreateSurface 硬编码提交；必须由 ActionRuntime 映射最终动作。 |
| Core UI PageSurface 迁移债 | `npm run arch:surface-page-adoption` | 检查业务侧是否还在用 PageSurface 顶层兼容 props；由 `check:hygiene:warn` 提示，清零后再收紧。 |
| Core UI 可视化迁移债 | `npm run arch:surface-visualization-adoption` | 检查复杂可视化是否还把 React 组件塞进 VisualizationSurface；由 `check:hygiene:warn` 提示。 |
| Playwright 生命周期 | `npm run playwright:lifecycle:check` | 阻断仓库内直接启动 Playwright Browser；手动 Browser 只能经过统一生命周期 helper。 |
| Playwright 残留进程 | `npm run playwright:processes:check` | 检查本机是否残留 `playwright_*dev_profile` headless 进程；用于 agent/test 收尾。仅当受限沙箱明确以 `EPERM` 禁止读取进程表时提示并跳过，其他读取失败及本机/CI 真实残留仍阻断。 |
| Action registry | `npm run action-registry:check` | 检查新动作注册表：重复 key、permission icon 唯一、implies 指向存在，旧权限 bundle 不再注册。 |
| Business action registry | `npm run business-action-registry:check` | 强制业务写 API 登记为 BusinessAction，并阻断 workflow readiness 证据缺口、未知 readiness key 和未登记 write API candidate。只读 POST 等例外必须逐 route 声明理由。 |
| Action contract 覆盖 | `npm run action-contract:check` | 强制每个 BusinessAction 具备唯一 `ActionContract`，校验 domain 符号可导出、API 引用存在真实 handler，并双向约束 BusinessAction route 与 Contract command/direct route；允许 direct override 的流程必须同时声明 active persistence 与 direct form mode。Contract 按 `write/lifecycle/governance/workflow/exchange` 声明；mutation/import 必须有 persistence，纯 export 明确声明输出且不得伪造 persistence。 |
| 跨仓库静态 contract | `npm run check:contracts` | 检查 API 响应格式、history policy registry 和 TypeScript 检查入口；这是静态契约 gate，不属于 ESLint，也不执行产品行为。 |
| TypeScript 入口治理 | `npm run typecheck:entrypoints:check` | 快速扫描仓库脚本和现行工程文档，禁止绕过项目锁直接启动编译器；不执行类型检查。 |
| Deploy graph 契约 | `npm run deploy:graph:check` | 从产品 registry、project references、E2E impact map 与最小 runtime blueprint 解析部署图，阻断 ownership、route/asset、blue/green 端口、容量和 contributor 漂移。 |
| 生成 Deploy App 契约 | `npm run deploy:apps:check` | 从根 `app/`、registry 与 deploy graph 重算全部现存 `apps/<unit>`，逐字阻断缺失、漂移和 stale generated wrapper；不构建 Next。 |
| 单元部署 contract | `npm run deploy:unit:contract -- --unit <id>` | 只打印/写出派生 contract，不构建或部署；用于核对公开路由、compiler closure、控制平面 floor 与独立部署 blocker。 |
| OKR 计划治理 | `npm run work-plan-governance:check` | 只做静态治理：强制 WorkPlan 创建时绑定流程/日期版本，审批单记录来源版本，OKR 设置只能增量写策略且不能批量清空。对应行为由 `test:domain:work-plan-governance` 执行。 |
| Action contract 文档 | `npm run docs:action-contracts` / `npm run docs:action-contracts:check` | 从 canonical registry 生成或校验 `docs/generated/action-contracts.md`；`docs:check` 会阻断漂移。 |
| Permission action 文档 | `npm run docs:permission-actions` / `npm run docs:permission-actions:check` | 从 action/resource/business registry 生成或校验 `docs/generated/permission-actions.md`；`docs:check` 会阻断漂移。 |

## 边界

### lint

`lint` 负责代码质量和局部静态规则，例如 ESLint warnings=0、基础 restricted imports、行数、明显不安全语法。它不承载架构模型，也不承载公司名、baseline 巡检这类细碎治理。

`lint:changed` 只跑 changed ESLint，不再隐式执行 API response format 或 history policy。后两者属于跨仓库静态契约，由 `check:contracts` 显式执行。净增行属于复杂度 ratchet，由 `complexity:line-budget` 显式触发。

并行开发时不要让每个 agent 都实际跑一遍 `lint:changed`。同一快照已有通过记录时，锁脚本会直接复用；需要重新跑的信号是代码快照、命令参数或相关环境变量发生变化。

`complexity:line-budget` 的公式是 `tracked additions - tracked deletions + untracked source lines`；有 staged diff 时只看 staged 内容，没有 staged diff 时看工作区 changed + untracked。默认 `NET_LINE_GROWTH_LIMIT=0`，用于手动检查本次总行数预算。

`complexity:split-quality` 是达到行数上限后的拆分质量 gate。普通新增功能不触发它；当 diff 呈现“主体文件减少 + parts/helper/config 增长”的拆分形态时，必须满足：单主体拆分的主体减少行数覆盖拆分文件增长；通用 helper 必须在当前 diff 中被至少两个主体引用，且这些消费者的总减少行数覆盖 helper 增长。未来复用不抵扣。

### typecheck

`typecheck` 负责 TypeScript 类型正确性。它回答代码在类型系统里是否成立，不回答权限语义、业务规则或生产构建是否完整。Workspace 的根编译 solution 由 `tsconfig.json`、公共 `tsconfig.base.json`、各 `packages/*/tsconfig.json`、`tsconfig.app.json`、`tsconfig.prisma-client.json` 和 `tsconfig.tooling.json` 组成。根 solution 继承 base 供仓库 `tsx` 运行时解析 alias，但保持 `files: []`，不拥有源码。Core 没有 Workspace 上游；Platform 只引用 Core 和生成的 Prisma Client；每个业务 package 只引用 Core 和 Platform；App 与 tooling 引用全部 package。每个生成的 `apps/<unit>/tsconfig.json` 另形成 `app-<unit>` deploy scope，由 deploy contract/builder 显式消费，不手工并入根 solution。`typecheck:references:check` 锁定根工程图、源码 ownership 和缓存契约，禁止通过新增 reference 合法化反向或跨业务依赖，也禁止新增无人负责检查的 TS/TSX/MTS/CTS；生成 App 的文件精确性另由 `deploy:apps:check` 负责，已退出运行面的 `scripts/migrate/sqlite-legacy/` 是唯一显式源码排除。

`npm run typecheck:scope -- production` 这类 scoped 检查只构建目标工程及其上游，适合单模块开发；`typecheck:quick` 从当前 staged/working-tree 变更选择直接 package/App scope，不检查反向下游，也绝不自动升级为全图；`typecheck:affected` 用于 CI 从可信 changed-files evidence 选择 owner unit 及反向消费者；`typecheck:full` 才构建根 solution，只作 CI/发布权威入口。这些入口共享 project-reference 增量产物：声明文件固定输出到 `.cache/types/`，build info 固定输出到 `.cache/tsbuild/`，不会写入源码目录或进入 Next 的 source include。CI 必须同时缓存两者，不能只恢复 build info 而缺少下游需要的声明输出。不要为了触发“干净检查”删除 `.cache`；入口都固定使用 `4096 MiB` Node old-space。

根 monolith 的 Next 通过 `next.config.ts#typescript.tsconfigPath` 使用 `tsconfig.app.json` 检查路由壳。当前 Next 16 会提示 project references 尚未完全支持，并尝试自己的 incremental build；因此 Next build 是 App/框架集成门禁，不能替代 `typecheck:full` 对完整工程图的权威检查。独立 unit builder 会先运行 deploy graph 派生的全部 package 与 `app-<unit>` scopes，生成的 unit Next config 才设置 `ignoreBuildErrors`，只跳过这次重复且不完整的 Next project-reference 类型遍历。

所有入口都必须经过 `scripts/check/with-check-lock.js -> scripts/check/run-typecheck.js`。专用 runner 会校验当前活锁及其 owner，直接执行 runner 会在加载编译器前失败；`typecheck:entrypoints:check` 同时扫描 package scripts、CI/ops/scripts 和现行 agent/工程文档，阻止裸 TypeScript CLI 命令重新进入仓库。锁包装器会把 `SIGINT`、`SIGTERM` 和终端挂断的 `SIGHUP` 转发到独立子进程组，等待子进程退出后才释放锁；宽限期后仍未退出则强制终止整个进程组。

日常 `check:changed`、`check:refactor`、`check:quick`、`check:precommit` 和 `check:push` 都不自动运行 TypeScript。普通局部修改不需要另外启动类型检查；需要本地诊断时优先用单 scope，多直接工程才用 `typecheck:quick`。CI/发布通过 `typecheck:full` 保留权威类型门禁。

### blockers

`check:blockers` 是当前改动必须自己修掉的阻断项，不是给 Hygiene Role 的后续任务池。它由两类 gate 组成，并通过 suite DAG 复用二者的叶子检查；不要在运行 blockers 时再并行启动任一子 gate。

### gate:domain

`gate:domain` 负责业务和系统正确性：

- API / route / resource / RBAC / API contract 的对应关系。
- API response format 与 history policy registry 等跨仓库静态 contract。
- 新 action registry 的唯一性和包含关系：permission action 的 icon 不能重复，旧权限 bundle 不再注册。
- ActionContract 的 key 唯一性和 BusinessAction 一一对齐；缺失、重复或 route/domain binding 漂移均 hard fail。普通写入、生命周期、治理和 workflow mutation 必须声明 persistence；exchange import 声明批量/原子性与 persistence，exchange export 声明输出媒介/类型且不得伪造 active entity。`workflow.kind=not_applicable` 明确动作不可接流程，只需说明原因；`configurable/native` 才声明默认节点、路由、修改策略和允许管理员配置的能力。`test:contract` 另锁定 `validateOn` 三阶段重验、批准 capability 与 direct service guard 的行为边界。
- 所有 `app/api/**/route.ts` 导出的 HTTP method 必须命中注册契约；内部 API 进 module registry 派生 contract，开放 API 进 Open API registry。
- 内部 API contract 会派生 `apiKind`：`business` 必须由规范 `/api/modules/<module>/<resource path>` URL 推导 owner `resourceKey`，并有 effective `authorization.requiredActions`；旧兼容路径如果无法从 URL 直接推导 resource，必须声明 `migrationNote`。`session/public/dev/internal` 不允许有 `resourceKey/requiredActions`，且必须写 `notes` 说明例外原因。API 新动作登记在 `permission-api-action-policy.pathPattern + requiredActions + scopeExtractor`，`requireApiAccess()` 检查 effective `authorization.resourceKey/scopeId/projection/actions`；旧 RBAC action 不允许作为 API/RBAC 运行时兼容层恢复。
- Open API registry、scope wrapper 和 console route 对齐。
- 写入链路的 domain validation 收口。
- 全局执行时间统一使用 `plannedStartDate / plannedEndDate / actualStartDate / actualEndDate`；实际日期输入必须设置今日上限，`actualEndDate` 只能在 `status=done` 时编辑。项目、WorkPlan、WorkItem 和周期拆解写入必须调用 Platform completion/date policy；Prisma 字段、公开 DTO/API 旧别名、UI 漏配和 domain 漏调用均由 `gate:domain` 阻断。
- app route hierarchy、module gate、package boundary 和 auth chain。
- `app/(modules)` 页面只能挂对应 package/platform UI；直接 import Core UI、手写 DOM 或在 app page 里组合页面 UI 会失败。
- 模块 API route 必须命中模块台账派生 contract，并使用 `createApiRouteHandler` / `requireApiAccess` / 已接入 `requireApiAccess` 的 `with-auth` wrapper。
- 业务通知必须走 notification registry 的 `sendNotification(type + payload)`，不得在业务侧直接拼 `createNotification` 或直接写 `prisma.notification.create/createMany/upsert`。
- Structure scan 里已经判定为业务阻断的历史债 ratchet，例如新增未登记 API route、裸 Prisma、缺 validation/service、旧 root service/auth/prisma 入口。

### gate:ui

`gate:ui` 负责结构性 UI 阻断，不管细碎视觉债：

- Core UI 唯一入口和 registry 关系。
- Surface `declares` 只能挂在正式 Page/Content/Common owner；缺 owner rule、越出允许路径或超过 owner 专属规模上限均直接失败，内部 `Toolbar` / `TabBar` renderer 不得形成平行声明入口。
- 标准新建入口只能通过 `CreateSurface` 声明；业务侧 Toolbar/Selector/Section 不得自己拼新建 `+`，折叠与数值增减按语义排除。
- 业务不得直接 value import 非公共 runtime 入口的 Core UI renderer，也不得 import 禁止的 Core UI type。
- PageSurface 协议、页面壳、toolbar/input/selector/tabbar 的结构边界。
- 页面级 toolbar 与数据块 toolbar 重复、Surface 自带 page chrome、业务直引 Common renderer。
- 全项目写入入口只负责打开本地表单；CreateSurface 与编辑表单的 `保存/提交` 必须分别通过 `actionRuntimeCreateSubmission` / `actionRuntimeCommands` 映射，不得由页面权限条件猜测，也不得同时暴露两个持久化出口。审批处理、发布、结案等显式业务状态流转不属于同一表单的保存/提交替换关系。
- 业务 UI 候选组件没有复用 Core/Platform 基建、Core UI ownership/coupling 违规。
- UI helper 纯度是零 baseline Gate：纯数据 helper 不得拥有可见 UI、页面 chrome、构造期流程副作用或权限显示决策；显式结构声明可以拥有完整结构内的语义文案、状态和动作，但禁止单字段/单 cell 叶子声明。
- Surface raw/custom content 是零 baseline Gate：未审核的 `content JSX`、JSX `cell`、`expandedRowContent`、`renderItem/renderOption` 直接失败。`@ui-specialized-surface` 只能出现在脚本精确登记的完整深模块，目前为 Platform 文档工作区、阶段流程板、企业微信登录面板、Page Assistant composer/message stream、Workflow BPMN canvas/element editor 和 Production QC runtime paper；QC 纸面字段必须走 Core `PaperInputSurface`，页面、字段、cell、label/icon 级例外禁止登记。

这些问题不交给 hygiene 重构；谁引入或触碰相关 UI，谁修到 `gate:ui` 通过。`arch:gate` 仍保留为兼容总入口，内部等价于 `gate:domain + gate:ui`。

### db/schema

`check:data` 负责数据库定义和迁移历史：

- `db:validate` 检查 Prisma schema 合法性。
- `schema:check` 检查 model 文件组织和项目 schema governance。
- `db:migration:check` 检查 migrations 文件、lock provider 和 schema/migration diff。

它不依赖真实业务数据，也不负责生产构建。

### build

`build` 负责生产构建。单独执行 `npm run build` 时会先生成 Prisma Client，再执行 `next build`。CI 中会在 typecheck 前显式运行 `db:generate`，最后用 `build:next` 只执行 Next 生产构建，避免重复 generate。两个入口都固定给 Next 构建进程 `6144 MiB` Node old-space，覆盖 Turbopack 编译后仍需运行的完整 route/type graph 检查，避免在 `Running TypeScript` 阶段触顶旧的 `4096 MiB` 上限。Agent/企微路由不携带源码读取依赖；standalone 只能包含模型 runtime、会话存储和受保护业务 API connector 所需闭包。

### tests

测试回答“给定输入实际会发生什么”，不替代全库静态 gate：

- `test:node` 是统一聚合入口，递归发现 `packages/`、`scripts/`、`app/`、`ops/` 下的 JS/TS Node test；新增 Node 测试不需要再手工追加到 `check:ci`。
- `test:behavior` 聚合产品/领域/runtime 行为，`test:tooling` 聚合 `scripts/` checker/scanner、`ops/` CI/CD contract 与测试基础设施自测。gate 扫描整个仓库回答“是否存在结构违规”，tooling test 用正反 fixture 回答“scanner 会不会正确识别违规”，并锁定 E2E 数据库 guard、发布证据和部署顺序等安全契约。
- `test:contract` 和 `test:domain:work-plan-governance` 是聚焦入口，便于局部开发；其中的测试同时已被 `test:node` 覆盖，不进入静态 `gate:domain`，也不在 `check:ci` 重复串行执行。`work-plan-governance:check` 只运行静态治理扫描。
- PostgreSQL integration 使用一次性 `*_ci` / `*_test` / `*_e2e` 库，验证 migration、Prisma、真实约束、事务和写后读；不得指向开发或生产库。
- 所有 `test:e2e*` 入口都会先 seed 身份，Playwright config 也会独立校验 `DATABASE_URL` 以及已设置的 `DIRECT_URL`：两者必须指向同名的 `*_ci` / `*_test` / `*_e2e` 库，所以直接绕过 package script 也不能连接开发/生产库。当前只有账户设置 spec 通过真实页面事件覆盖保存、服务端回读、刷新持久化和原值恢复，并以独立 `10 s` 暖重载上限拦截灾难性回归；其他已注册模块浏览器证据仍是只读或 readiness。Playwright 禁止复用已有 server；CI 中只启动已由 build job 产出并校验 manifest/digest 的 standalone，不在 E2E job 重建。

GitHub Actions 先对完整 base/head diff 做 C0–C3 分类，再并行执行 static、Node、type、PostgreSQL 和 build。没有 E2E 且不要求整站 artifact 时，build job 生成受影响 unit 计划并构建对应独立 artifacts；需要 E2E 或显式整站 artifact 时才构建 canonical monolith，E2E 独立 job 只下载并启动同一个 canonical 产物。`CI / required` 最后验证哪些 job 必须成功、哪些必须跳过。详细分级、覆盖映射和同 SHA 发布契约见 [`ops/ci-cd.md`](ops/ci-cd.md)。

生产发布不等待或查询 GitHub。Git hooks 与本地 `ops/publish*.sh` / `release-to-cnb.sh` 入口统一通过 `scripts/runtime/run-with-repo-node.sh` 选择 `.node-version` 指定的 Node；`npm run check:ci` 的可执行入口也会自举到同一 Node 主版本，并把 `TMPDIR` 固定到工作区忽略目录 `.cache/runtime-tmp`，避免调用方 PATH 漂移。通过记录只绑定 Git tree、检查命令、结果和完成时间，不绑定调用方 Node 完整小版本、平台或架构；生产 Linux runtime 由 CNB 对目标 artifact 的构建另行证明。仓库 TypeScript 脚本统一使用 `node --import tsx`，不启动受限环境会拒绝的 `tsx` CLI IPC server。Full 的 `ops/publish.sh prepare` 在干净 release worktree 聚合运行 `check:ci`，再复用同一个 production standalone build 完成一次性数据库 migration/seed 和全量 E2E，写入精确 source/tree 回执。单 unit 的 `prepare --deploy-unit <id>` 复用同一 clean-tree/snapshot/task-cache 基础，只把 full TypeScript、monolith Next 和浏览器范围替换为 deploy graph 派生的 unit closure、`.cache/next-units/<id>` 与目标 artifact E2E，并写入 source/tree/unit 三重绑定的独立回执。两种回执不可交叉消费；任何失败都留在本地修复/复查。`ops/publish.sh deploy` 只验证并消费与目标精确匹配的回执，缺失或过期时在连接 CNB 前退出，不隐式运行编译或测试。Library/Qwen/ONLYOFFICE runtime 快速路径都必须先通过 identity/version/health 复验。

### scalability contract 与真实容量

`test:scalability-contract` 中的 workflow case 是确定性放大回归：固定模拟 `64` 个用户同时检查 `7` 张 Work 审批单，判权调用不得超过 `用户数 × 审批单数`，同一用户批量投影时还必须按不同 control target 复用判权结果，且成员判定路径不得枚举全部可登录用户。

同一入口中的 HR case 是默认 Tab 读取的结构容量门禁：花名册、雇佣关系、员工岗位和合同默认读取必须在数据库内完成计数和分页，不允许先全量加载员工及关系后再在 Node 内存分页；同时锁定尽调版默认列契约。

以上测试使用 mock/fixture 验证查询形状和复杂度上界，只能证明“没有明显的全量读取或调用次数爆炸”，不能证明页面 P95/P99 延迟。E2E 暖刷新上限也只拦截灾难性回归；真实“加载慢”仍应由稳定测试数据上的 integration benchmark、候选环境浏览器计时或生产 synthetic/APM 监控负责，避免拿开发机冷启动时间做易抖动的精细 PR gate。

`db:postgresql:notification-capacity` 是 PostgreSQL CI 容量门禁：只允许在 `*_ci` 数据库中运行，用 `173` 个可登录用户、`7` 张已提交 Work 审批单和 `8` 个并发通知读取验证默认 `10` 连接池。它由 `db:postgresql:ci-smoke` 自动调用，连接等待超时、provider 内部捕获并降级的查询错误，或总耗时超过 `15 s` 都会阻断 CI。

`db:postgresql:write-capacity` 是同一 PostgreSQL lane 的写入容量门禁：先以 `24` 个互不冲突的并发写验证默认连接池不会丢写，再以 `8` 个竞争同一状态的 Serializable 写验证统一事务 helper 能通过带抖动的指数退避有界收敛，并断言最终计数不存在 lost update。该门禁只接受 `*_ci` 数据库，任一写失败、超过 `10 s` 或最终状态不一致都会阻断 CI。

### deploy/runtime

deploy/runtime 检查回答目标环境能不能运行，例如租户私有配置、目标 PostgreSQL 连通性、migration/constraint 状态、核心表数据和 admin 账号。针对真实目标环境的检查不属于 PR CI；PR workflow 中运行的是隔离的一次性 PostgreSQL integration，不读取或修改生产数据。

### hygiene

Hygiene 是简单清道夫，不是 UI 重构队。日常/CI 使用 `check:hygiene:warn`，只提示不阻断；Hygiene Role 使用 `check:hygiene`，发现简单清扫项必须失败。

Hygiene 负责简单、局部、机械、可回滚的清扫：

- 公司专有事实硬编码扫描。除 tenant profile 及其受控引用外，本地发布前扫描还会读取可选私有 `WORKSPACE_CONFIG_DIR/config/tenant/source-code-forbidden-signals.json`，用于阻断结构化配置无法派生的历史品牌片段、人员示例和旧别名；该文件不进入 Git，也不作为应用运行配置。
- `arch:structure:hygiene` 中的简单债务 ratchet：业务视觉 token 硬编码候选、Core 业务事实泄漏候选、组件内本地 UI config 候选。
- `arch:surface-boundaries` 中的 Core UI surface 观察项：跨声明分类组合异常、业务存量 deprecated escape hatch；声明 owner、允许路径和规模边界已属于 `gate:ui` blocker。
- stale baseline 删除和小范围 baseline 收窄。
- 已有封装能力下的机械迁移。
- 明显 dead code、禁用注释和小 constant/token 债。
- lint / arch gate 是否存在规则漏洞或误放到主链路的细则。

Hygiene 不负责新公共 API、新封装入口、页面结构重排、复杂组件重构、大面积业务迁移或产品交互设计。发现这类问题时，只做归类和回交：结构性阻断进入 `gate:ui` / `gate:domain`，复杂 UI/业务迁移交给对应 Feature 或 Architecture。

`arch:structure` 是完整结构报告，只用于拆任务和观察趋势；它不是 hygiene strict 的工作清单。
