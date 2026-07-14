# Checks

本项目把检查分成几类。命令可以在 CI 中串起来，但每类检查只负责自己的边界，避免把细碎治理塞进主 gate。

本地多 agent 并行时，lint/typecheck/gate 类检查以“同一台机器、同一代码快照、同一命令成功一次”为准。每个 agent 都可以收口自己的任务，但检查结果是工作区级别共享的：谁先跑通都算，后续同快照同命令直接复用。`scripts/check/with-check-lock.js` 会串行化本地检查，并对已通过的 lint/typecheck/gate 命令按快照复用结果。

## 常用命令

| 场景 | 命令 | 说明 |
|---|---|---|
| 局部 TS/TSX 改动 | `npm run check:changed` | 跑 changed lint 和 quick typecheck；日常开发不检查净增行。 |
| 本地提交默认检查 | `npm run check:precommit` | pre-commit 默认入口；只跑 staged/changed 增量并复用 ESLint/TypeScript 缓存。全量本地提交用 `PRE_COMMIT_FULL=1 git commit ...`。 |
| 清债/重构改动 | `npm run check:refactor` | 跑拆分质量、changed lint 和 quick typecheck。 |
| 仅检查本次总行数预算 | `npm run complexity:line-budget` | 检查 staged diff；没有 staged diff 时检查 tracked changed + untracked。默认净增必须 `<= 0`。 |
| 仅检查拆分质量 | `npm run complexity:split-quality` | 防止为过 `max-lines` 把大文件随便搬家。 |
| 当前变更阻断项 | `npm run check:blockers` | 跑业务阻断和 UI 阻断；这些问题由当前改动 agent 自己修。 |
| 业务阻断 | `npm run gate:domain` | API、route、resource、RBAC、domain validation、app route 和包边界。 |
| UI 阻断 | `npm run gate:ui` | Core UI 唯一入口、PageSurface 协议、Toolbar/Input/Selector 等结构性 UI 边界。 |
| 架构兼容入口 | `npm run check:arch` | 等价于 `npm run check:blockers`。`npm run arch:gate` 保留为兼容总入口。 |
| Prisma schema、model、migration | `npm run check:data` | 跑 schema 合法性、schema governance 和 migration diff。 |
| PR / CI 权威检查 | `npm run check:ci` | 合并前主链路；hygiene 只以 warning 方式提示。 |
| 兼容旧入口 | `npm run check:full` | `check:ci` 的别名。 |
| 日常 hygiene 提示 | `npm run check:hygiene:warn` | 跑简单清扫项但永远退出 0。 |
| 周期性清债 | `npm run check:hygiene` | 强制巡检公司硬编码和简单 structure hygiene 债务。 |
| Core UI surface 边界 | `npm run arch:surface-boundaries` | 检查声明入口 declares 边界，以及业务侧 deprecated escape hatch 使用。 |
| Core UI 新建入口 | `npm run arch:create-surface-entry` | 禁止业务侧自行声明新建 `+`、旧 Toolbar create 或直接 import 旧 renderer；折叠、树展开和数值增减不在扫描范围。 |
| Core UI PageSurface 迁移债 | `npm run arch:surface-page-adoption` | 检查业务侧是否还在用 PageSurface 顶层兼容 props；由 `check:hygiene:warn` 提示，清零后再收紧。 |
| Core UI 可视化迁移债 | `npm run arch:surface-visualization-adoption` | 检查复杂可视化是否还把 React 组件塞进 VisualizationSurface；由 `check:hygiene:warn` 提示。 |
| Playwright 生命周期 | `npm run playwright:lifecycle:check` | 阻断仓库内直接启动 Playwright Browser；手动 Browser 只能经过统一生命周期 helper。 |
| Playwright 残留进程 | `npm run playwright:processes:check` | 检查本机是否残留 `playwright_*dev_profile` headless 进程；用于 agent/test 收尾。 |
| Action registry | `npm run action-registry:check` | 检查新动作注册表：重复 key、permission icon 唯一、implies 指向存在，旧权限 bundle 不再注册。 |
| Business action registry | `npm run business-action-registry:check` | 强制业务写 API 登记为 BusinessAction，并阻断 workflow readiness 证据缺口、未知 readiness key 和未登记 write API candidate。只读 POST 等例外必须逐 route 声明理由。 |
| Action contract 覆盖 | `npm run action-contract:check` | 强制每个 BusinessAction 具备唯一 `ActionContract`，校验 domain 符号可导出、API 引用存在真实 handler，并双向约束 BusinessAction route 与 Contract command/direct route。Contract 按 `write/lifecycle/governance/workflow/exchange` 声明；mutation/import 必须有 persistence，纯 export 明确声明输出且不得伪造 persistence。 |
| Action contract 文档 | `npm run docs:action-contracts` / `npm run docs:action-contracts:check` | 从 canonical registry 生成或校验 `docs/generated/action-contracts.md`；`docs:check` 会阻断漂移。 |

## 边界

### lint

`lint` 负责代码质量和局部静态规则，例如 ESLint warnings=0、基础 restricted imports、行数、明显不安全语法。它不承载架构模型，也不承载公司名、baseline 巡检这类细碎治理。

`lint:changed` 只跑 changed ESLint，不检查净增行。净增行属于复杂度 ratchet，由 `complexity:line-budget` 显式触发。

并行开发时不要让每个 agent 都实际跑一遍 `lint:changed`。同一快照已有通过记录时，锁脚本会直接复用；需要重新跑的信号是代码快照、命令参数或相关环境变量发生变化。

`complexity:line-budget` 的公式是 `tracked additions - tracked deletions + untracked source lines`；有 staged diff 时只看 staged 内容，没有 staged diff 时看工作区 changed + untracked。默认 `NET_LINE_GROWTH_LIMIT=0`，用于手动检查本次总行数预算。

`complexity:split-quality` 是达到行数上限后的拆分质量 gate。普通新增功能不触发它；当 diff 呈现“主体文件减少 + parts/helper/config 增长”的拆分形态时，必须满足：单主体拆分的主体减少行数覆盖拆分文件增长；通用 helper 必须在当前 diff 中被至少两个主体引用，且这些消费者的总减少行数覆盖 helper 增长。未来复用不抵扣。

### typecheck

`typecheck` 负责 TypeScript 类型正确性。它回答代码在类型系统里是否成立，不回答权限语义、业务规则或生产构建是否完整。

`typecheck:quick` 使用 TypeScript incremental cache，缓存文件固定在 `.cache/tsconfig.quick.tsbuildinfo`，用于本地 changed/pre-commit 链路复用；不要为了触发“干净检查”删除 `.cache`，需要全量时跑 `typecheck:full` 或 `check:ci`。`typecheck:quick` 和 `typecheck:full` 的脚本都固定使用 `4096 MiB` Node old-space，调用方不需要再手工设置 `NODE_OPTIONS`。

### blockers

`check:blockers` 是当前改动必须自己修掉的阻断项，不是给 Hygiene Role 的后续任务池。它由两类 gate 组成。

### gate:domain

`gate:domain` 负责业务和系统正确性：

- API / route / resource / RBAC / API contract 的对应关系。
- 新 action registry 的唯一性和包含关系：permission action 的 icon 不能重复，旧权限 bundle 不再注册。
- ActionContract 的 key 唯一性和 business action 对齐；历史 action 缺少完整 contract 暂时 warning-only，用于逐步迁移 payload/persistence/form/domain/api/workflow/display 覆盖。普通写入、生命周期、治理和 workflow mutation 必须声明 persistence；exchange import 声明批量/原子性与 persistence，exchange export 声明输出媒介/类型且不得伪造 active entity。`workflow.kind=not_applicable` 明确动作不可接流程，只需说明原因；`configurable/native` 才声明默认节点、路由、修改策略和允许管理员配置的能力。
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
- 标准新建入口只能通过 `CreateSurface` 声明；业务侧 Toolbar/Selector/Section 不得自己拼新建 `+`，折叠与数值增减按语义排除。
- 业务不得直接 value import 非公共 runtime 入口的 Core UI renderer，也不得 import 禁止的 Core UI type。
- PageSurface 协议、页面壳、toolbar/input/selector/tabbar 的结构边界。
- 页面级 toolbar 与数据块 toolbar 重复、Surface 自带 page chrome、业务直引 Common renderer。
- 业务 UI 候选组件没有复用 Core/Platform 基建、Core UI ownership/coupling 违规。
- UI helper 纯度是零 baseline Gate：纯数据 helper 不得拥有可见 UI、页面 chrome、构造期流程副作用或权限显示决策；显式结构声明可以拥有完整结构内的语义文案、状态和动作，但禁止单字段/单 cell 叶子声明。
- Surface raw/custom content 是零 baseline Gate：未审核的 `content JSX`、JSX `cell`、`expandedRowContent`、`renderItem/renderOption` 直接失败。`@ui-specialized-surface` 只能出现在脚本精确登记的完整深模块，目前为 Platform 文档工作区、阶段流程板、Page Assistant composer/message stream、Workflow BPMN canvas/element editor 和 Production QC runtime paper；QC 纸面字段必须走 Core `PaperInputSurface`，页面、字段、cell、label/icon 级例外禁止登记。

这些问题不交给 hygiene 重构；谁引入或触碰相关 UI，谁修到 `gate:ui` 通过。`arch:gate` 仍保留为兼容总入口，内部等价于 `gate:domain + gate:ui`。

### db/schema

`check:data` 负责数据库定义和迁移历史：

- `db:validate` 检查 Prisma schema 合法性。
- `schema:check` 检查 model 文件组织和项目 schema governance。
- `db:migration:check` 检查 migrations 文件、lock provider 和 schema/migration diff。

它不依赖真实业务数据，也不负责生产构建。

### build

`build` 负责生产构建。单独执行 `npm run build` 时会先生成 Prisma Client，再执行 `next build`。CI 中会在 typecheck 前显式运行 `db:generate`，最后用 `build:next` 只执行 Next 生产构建，避免重复 generate。两个入口都固定给 Next 构建进程 `4096 MiB` Node old-space，避免大型 route/type graph 在默认约 `2 GiB` 堆上限下反复 OOM。

### capacity

`test:capacity:workflow` 是 PR CI 主链路中的确定性放大回归：固定模拟 `64` 个用户同时检查 `7` 张 Work 审批单，判权调用不得超过 `用户数 × 审批单数`，且成员判定路径不得枚举全部可登录用户。

`test:capacity:hr` 是 HR 默认 Tab 读取的结构容量门禁：花名册、雇佣关系、员工岗位和合同默认读取必须在数据库内完成计数和分页，不允许先全量加载员工及关系后再在 Node 内存分页；同时锁定尽调版默认列契约。它进入 `check:ci`，因此 full pre-commit、pre-push、发布和 GitHub Actions 都会阻断回归。

`db:postgresql:notification-capacity` 是 PostgreSQL CI 容量门禁：只允许在 `*_ci` 数据库中运行，用 `173` 个可登录用户、`7` 张已提交 Work 审批单和 `8` 个并发通知读取验证默认 `10` 连接池。它由 `db:postgresql:ci-smoke` 自动调用，连接等待超时、provider 内部捕获并降级的查询错误，或总耗时超过 `15 s` 都会阻断 CI。

### deploy/runtime

deploy/runtime 检查回答目标环境能不能运行，例如 workspace manifest、PostgreSQL 连通性、migration/constraint 状态、核心表数据和 admin 账号。它依赖运行环境和真实数据，不属于 PR CI 主链路。

### hygiene

Hygiene 是简单清道夫，不是 UI 重构队。日常/CI 使用 `check:hygiene:warn`，只提示不阻断；Hygiene Role 使用 `check:hygiene`，发现简单清扫项必须失败。

Hygiene 负责简单、局部、机械、可回滚的清扫：

- 公司专有事实硬编码扫描。
- `arch:structure:hygiene` 中的简单债务 ratchet：业务视觉 token 硬编码候选、Core 业务事实泄漏候选、组件内本地 UI config 候选。
- `arch:surface-boundaries` 中的 Core UI surface 边界提示：声明项过厚、跨声明分类组合异常、业务新增 `moduleView/raw/visual` 逃生口。
- stale baseline 删除和小范围 baseline 收窄。
- 已有封装能力下的机械迁移。
- 明显 dead code、禁用注释和小 constant/token 债。
- lint / arch gate 是否存在规则漏洞或误放到主链路的细则。

Hygiene 不负责新公共 API、新封装入口、页面结构重排、复杂组件重构、大面积业务迁移或产品交互设计。发现这类问题时，只做归类和回交：结构性阻断进入 `gate:ui` / `gate:domain`，复杂 UI/业务迁移交给对应 Feature 或 Architecture。

`arch:structure` 是完整结构报告，只用于拆任务和观察趋势；它不是 hygiene strict 的工作清单。
