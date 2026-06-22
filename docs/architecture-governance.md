# 架构治理规则

这份文档是给人和 agent 共用的“放东西地图”。项目现在还小，正适合把边界一次定清楚；以后增加绩效、采购、生产、更多财务数据时，按这套规则扩展，不靠临时感觉堆文件。

## 0. 文档入口

Agent 开工先读 `AGENTS.md` 和 `docs/README.md`，再进入自己的 `docs/roles/*.md`。本文件只保留架构放置规则，不再维护角色分流、并行线程或任务专题索引。

如果代码改动导致文档过期，任务不算完成。并行时先看 `git status --short`，只提交自己负责的文件。

## 1. 判断一个改动属于哪一层

任何任务开始前，先判断它主要属于哪一层：

| 层 | 典型问题 | 应放位置 |
|---|---|---|
| 业务领域 | HR、Finance、Production、Work、Administration、Library、库存、绩效、采购等 | `packages/<domain>/`, `app/(modules)/<domain>/`, `app/api/modules/<domain>/` |
| 平台能力 | 登录、权限、账号、审计、模块注册、Portal | `packages/platform/` |
| Core 通用能力 | 下拉、筛选、搜索、日期、确认弹窗、通用表格、字段展示 | `packages/core/` |
| 数据模型 | 表、字段、索引、迁移、seed | `prisma/`, `prisma/seed-data/`, `scripts/import-*` |
| 文档治理 | 模块边界、数据来源、导入流程、验收标准 | `README.md`, `docs/`, `app/*/ARCHITECTURE.md` |

如果一个任务横跨两层，先写计划，拆成多个 commit。不要一次让 agent 同时改 schema、导入、API、UI、权限和部署脚本。

## 2. 业务模块目录契约

每个业务模块都应形成同一组入口：

```txt
packages/<domain>/
  module.ts
  ui/
  server/
  types/
  constants/
  import/

app/(modules)/<domain>/
  page.tsx
  ARCHITECTURE.md

app/api/modules/<domain>/
  route.ts or nested route.ts
```

不是每个模块第一天都要建满所有文件，但新增代码时必须往这个方向收敛。

## 3. 新业务模块接入清单

新增绩效、采购、生产等模块时，执行 agent 必须按顺序完成：

1. 更新 `README.md` 的“当前业务模块”或“未来模块”说明。
2. 更新 `AGENTS.md` 或 `docs/agent-handbook.md` 的模块规则。
3. 创建 `app/(modules)/<domain>/ARCHITECTURE.md`。
4. 在业务包 `module.ts` 的 `resourceDefs` 注册资源树；需要 RBAC 常量时使用 `@workspace/platform/permissions`。
5. 设计 Prisma model，明确事实字段和计算字段。
6. 在 `packages/<domain>/server/` 写业务逻辑。
7. 在 `packages/<domain>/ui/` 写主要 UI。
8. 在 `app/api/modules/<domain>/` 写 API route 壳。
9. 补测试或检查命令。
10. 独立提交 commit。

## 4. 数据和 schema 原则

DB 不等于 Excel，也不等于 normalized JSON。

必须入库：

- 人工录入或外部系统提供的事实字段。
- 业务主键或稳定关联字段。
- `sourceFile`、`sourceSheet`、`sourceRow`、`importId` 等追溯字段。
- 必要状态字段，例如 `status`、`importedAt`、`createdAt`。

默认不入库：

- 合计、小计、总计。
- 百分比、占比、完成率。
- 未回款、毛利、单位成本、趋势。
- 任何能由事实字段稳定计算出来的值。

不确定的原始行可以先放 `rawPayload`，但不能为了还原 Excel 样子把几十个不稳定列都建成 schema。

公司、组织、租户相关的专有事实必须数据化，不能散落在代码里。具体公司名、公司编码、管理体系、查询分组、共享编码池、特殊公司判断等信息应来自 `Company` 表或对应 seed/migration 输入；应用代码只保留通用机制，通过领域 service/helper 查询、缓存和派生。

## 5. API 规则

API route 只做：

1. 认证。
2. 权限。
3. 参数校验。
4. 调用 service。
5. 返回 DTO。

输入验证按四层分工：

- 前端负责输入体验，例如选择器、日期控件、数字控件和 FK 候选项查询；前端不是安全边界。
- Zod / API input schema 只校验请求形状，例如 body 是否为对象、rows 是否为数组、id 是否为正整数、field/value 是否存在。
- Domain validator 负责业务规则，例如枚举、日期、百分比范围、FK 是否存在且 active、记录归属、跨字段/跨行规则和归档/删除前引用保护。
- Service 只执行已经验证过的 command，负责事务、Prisma 写库、派生字段落库、`editedBy/editedAt/version`、`snapshotHistory` 和错误映射。

删除的最低平台规则是：删除前必须证明目标 ID 是合法正整数、目标记录存在、请求作用域成立、没有 required FK 或 active reference、目标状态允许删除、删除方式明确，并且引用清理、`snapshotHistory` 和删除/归档/停用处于同一事务边界。通用字段级删除优先走 `@workspace/platform/server/crud-factory`，自定义删除服务优先复用 `@workspace/platform/server/delete-guard`；业务包只补充本领域的归属校验、引用清单和删除方式选择，不要靠 Prisma/DB 报错当业务规则。

新增多入口写入能力时，页面、导入、agent tool 或内部 API 只能新增 input adapter，把输入适配成 domain command；同一个业务字段或业务动作必须收口到同一套 domain validator。HR roster 写服务已作为第一批强制范围，`npm run arch:gate` 会阻断这些 service 重新散落 FK、日期、枚举、百分比、直接上级、合同公司、归档/删除引用保护等业务规则。

Level 1 起，业务资源权限入口统一为 `packages/platform/server/auth/authorize.ts` 的 `authorize()`。`withAuth`、`withFinance*`、`checkHRAccess`、`requireResourceAccess` 等平台 wrapper 必须委托 `authorize()`，新增 API route 不得直接调用 `checkPermission()` 或在 route 内重写角色判断。唯一例外是内置 root admin gate：`auth/admin.ts` 必须委托 `isRootAdminUser()`，且不得把 `system` 注册或判断为 RBAC resource。

`npm run arch:gate` 的 auth 阶段会强制：

- `packages/platform/server/auth/authorize.ts` 存在并导出 `authorize()`。
- 核心业务 auth helper 委托 `authorize()`；root admin helper 委托 `isRootAdminUser()`。
- 新增 API route 必须有认证/授权 gate、明确代理到兼容 route、显式转调 package service，或是文档化的 public/disabled handler。
- 新增 API route 不得新增裸 `checkPermission()` 或裸 `prisma.`。当前历史债由 `scripts/check/level1-api-baseline.json` 锁定，只能减少，不能新增。

`npm run arch:gate` 的 AST 阶段不是 advisory：命中即 `exit 1`。它会阻断 `checkPermission`、`hasAccess`、`canAccess`、`roleCheck`、`rbacCheck` 等替代权限入口，阻断 `if (user.role)` 一类角色分支，阻断 `authorize()`/RBAC service 外新增 RBAC 表直查，并阻断业务包通过 `@/server/*` 或相对路径绕过边界。已有历史债只允许出现在 `scripts/arch/level15-baseline.json`，迁移删除文件时必须同时删 baseline 项；新增违规不能把 baseline 当白名单扩写。

权限动作：

| HTTP 方法 | 权限动作 |
|---|---|
| GET | `access` |
| POST | `write` |
| PUT | `write` |
| PATCH | `write` |
| DELETE | `delete` |

授权和权限管理使用对应资源的 `admin` 角色；系统配置仅内置 root admin 可操作。

## 6. 文件大小红线

| 类型 | 硬上限 | 处理方式 |
|---|---:|---|
| 页面 facade | 150 行 | 拆 components/hooks |
| React 组件 | 220 行 | 拆子组件 |
| hook | 220 行 | 拆 data/edit/filter/table |
| API route | 120 行 | 逻辑移到 service |
| service | 260 行 | 按 queries/summary/import 拆 |
| Prisma 单领域文件 | 350 行 | 按领域继续拆 |

文件大小红线由 ESLint `max-lines` 强制执行，不设历史白名单。任何超限文件都必须先拆分到红线内，任务才允许继续交付或提交。

## 7. API 一级目录规则

API 一级目录只表达系统能力类型：

- `/api/auth/*`：登录、回调、改密、session check。
- `/api/settings/account/*`：当前登录用户自己的偏好、目标、routine、week-info。
- `/api/settings/admin/*`：系统管理，包含用户、权限、资源和系统配置。
- `/api/settings/governance/*`：平台治理，包含审计、registry、编码和治理配置。
- `/api/settings/api/*`：API 接入管理，包含 API key 与接入策略。
- `/api/agent/*`：智能体对话、能力清单和变更提案。
- `/api/modules/<module>/*`：业务模块数据入口，例如 HR、Finance、Work、Production、Library、Administration。
- `/api/integrations/*`：飞书、企业微信、外部 webhook 等系统集成。

新业务代码必须使用模块入口：

- HR：`/api/modules/hr/roster/*`
- 财务：`/api/modules/finance/*`
- Work：`/api/modules/work/*`
- 生产：`/api/modules/production/*`
- 资料库：`/api/modules/library/basic-info/*`
- 行政：`/api/modules/administration/*`

`/api/modules/<module>` 只是路由归属和权限归属，不表示 API 层可以写业务逻辑。真实逻辑仍然在 `packages/<module>/server/*`；route 只能做认证、权限、参数校验、调用 package service 或 Platform 通用 factory、返回 DTO。

禁止新增 `/api/hr`、`/api/finance`、`/api/work`、`/api/employees` 等一级业务目录，也不要用 redirect 或 compatibility proxy 继续延长旧路径。历史旧路径删除时必须同步删除文档、脚本和部署配置中的引用。

## 8. Package 边界规则

package 依赖必须单向：

```txt
app/* route shell
  -> @workspace/platform
  -> @workspace/<domain>
  -> @workspace/core
```

- `@workspace/core` 禁止依赖 platform、业务包、`@/app`、Prisma、权限和业务事实。
- `@workspace/platform` 可以聚合业务包注册信息并拥有平台 server runtime 契约，例如 Prisma client、权限、审计；但禁止直接 import 业务页面或业务 service。
- `@workspace/hr`、`@workspace/production`、`@workspace/finance`、`@workspace/work`、`@workspace/administration`、`@workspace/library` 等业务包之间禁止直接互相 import。
- 业务包需要认证或权限检查时应通过 `@workspace/platform/server/auth`；旧 `lib/auth.ts` 聚合 hub 已删除，不得恢复或新增同类 re-export 入口。
- 业务包需要 RBAC 常量、角色 key 标准化或同步可选角色 helper 时应通过 `@workspace/platform/permissions`；不要直接 import `@/lib/permissions`，也不要在业务包内重复定义角色层级。
- 业务包需要通用字段级 CRUD helper 时应通过 `@workspace/platform/server/crud-factory` 并在本领域封装，例如 HR 使用 `packages/hr/server/crud.ts`；不要直接 import `@/lib/crud`。
- 业务包需要访问数据库时应通过 `@workspace/platform/server/prisma`，不要直接 import `@/lib/prisma` 或 generated Prisma client。
- 业务包需要写审计快照时应通过 `@workspace/platform/server/history`，不要直接 import app-root `@/lib/history`。
- 业务包需要解析 FK 快照展示名时应通过 `@workspace/platform/server/resolve-fk`，不要直接 import app-root `@/lib/resolve-fk`。
- API route 只做认证、权限、参数校验、调用 service、返回 DTO；复杂业务逻辑必须进入领域 service 或业务包。
- `app/lib/module-nav.tsx` 只是兼容出口，模块真实注册来源是 `packages/platform/module-registry.ts`。`packages/platform/modules.tsx` 只消费 registry 并生成运行时聚合，不直接 import domain 包。
- 模块注册的 `href` 和 `routes` 只写不带 basePath 的站内绝对路径，例如 `/hr/roster`；禁止把 `@workspace/*` package 名或 `/workspace` basePath 写入 URL。
- `moduleDef.href` 必须是 L1 根路径，例如 `/work`；`moduleDef.children[*]` 是 L2 业务入口单元，必须是直接二级页面 route，例如 `/work/tasks`、`/finance/statement-config`、`/production/qc-batches`。禁止用嵌套三级页面伪装 L2，也禁止在 app 顶层另建绕开 L1/L2 registry 的 route shell。
- L2 四件套必须统一：`moduleDef.children[*]` 页面入口、真实 app route、API contract 和 RBAC resource 一一对应。L2 的 `resourceKey` 必须等于 `module.key + "." + child.key`，例如 `finance.statementConfig`、`finance.statementReview`、`production.qcBatches`；多个页面不能共用一个模糊 resource，例如旧 `finance.statement`。
- 每个 L2 必须声明 `apiPrefixes` 或明确 `noApiReason`。`apiPrefixes` 必须绑定到同一个 L2 resource 的 API contract；宽泛的 `/api/modules/<module>` 只能作为迁移兼容，不允许作为 L2 最终契约来蒙混覆盖。
- `app` 真实页面路径必须落在注册过的 L1 module 或系统保留 route 下。源码可以使用 route groups，例如 `app/(modules)/work/tasks/page.tsx`，但对外 route 仍必须是 `/work/tasks`。禁止重新创建绕开 L1 的顶层 route shell。
- L2 以下 capability 属于业务能力，不自动进入全局页面 L2。capability 必须声明 `capabilityOwnerKey` 指向已注册 L2；它不能用 `parentKey` 继承 owner 权限，但可以用 `runtimeParentKey` 跟随 owner 的模块启停。Settings/Admin 只是 capability 的统一配置容器，授权管理仍按 owner/resource 的可管理范围判断，不强制要求 `settings.admin`。
- 资源注册中的 `parentKey` 只表达权限树继承；模块启停级联使用 `runtimeParentKey`。不要用 `parentKey` 同时表达权限继承和运行态归属；当一个资源不能继承父权限、但必须随模块 disable 一起失效时，保持 `parentKey` 为空并设置 `runtimeParentKey`。典型例子是 `work.projects.viewAll`：它不能继承 `work.projects` 模块权限，但必须随 `work.projects` disabled 一起失效。
- Headless/global 能力必须显式声明 `presentation: "headless"` 和 `noPageReason`。例如 Agent 是全局浮窗和 API 能力，不要求真实 `/agent` 页面，但入口显示、API 和 runtime disabled 仍必须绑定 `agent` resource。
- `settings.account` 属于登录用户自助设置 contract，不进入普通 RBAC 授权矩阵；`docs.api` 和 `settings.api` 是两个资源，API 文档可见按并集授权，API key/接入管理只按 `settings.api`。

这些规则由 `npm run arch:gate` 中的 module registry、app route hierarchy、resource registry 和 package boundary 检查执行。package boundary 还会扫描非 Core 包内疑似重复基础组件文件名（例如 `*Select*`、`*Dropdown*`、`*Confirm*`、`*Date*Input`、`*Search*`、`*Table*`、`*Filter*`、`*Shell*`、`*Toolbar*`、`*Modal*`、`*Pagination*`、`*Tab*`）。这些组件必须 import Core/Platform 对应基建，或在 `scripts/check/check-package-boundaries.js` 的 allowlist 中写明业务特殊性和迁移计划。

页面组件注册表：

- `packages/core/ui/component-registry.ts` 是 Core UI primitive 和页面骨架的注册表。非 Core 包只能消费 registry 中登记的 Core UI 名字；新增 Core UI 入口必须先由 Architecture/Core 任务登记，再导出给 Feature 使用。注册项必须填写中文 `description` 和中文 `example`，`/settings/governance/ui-registry` 会自动读取并展示注册名、分类、说明、使用案例、组合子组件和当前消费文件。
- 该 registry 是 `scripts/arch/level2.ts` 的输入，仍通过唯一 `npm run arch:gate` 的 Level 2 ratchet 执行；不要新增独立组件检查脚本或第二套 CI。
- Core UI 的 value export 必须全部出现在 `component-registry.ts`，或明确列入 `scripts/arch/level2.ts` 的非组件导出集合；注册名重复会直接进入 `duplicateCoreUiRegistrations`。这两类 baseline 为空，新增即失败。
- 非 Core 包新增手写页面设计壳会进入 `pageDesignDriftFiles` 检测：在 `packages/*/ui` 中直接用原生 JSX 容器拼 `bg-white`、`rounded`、`shadow/border`、sticky header、页面级 grid 等页面结构时视为漂移。历史债由 `scripts/arch/level2-baseline.json` 锁定，Feature/UI 迁走后必须删对应 baseline 项。
- 允许业务内容区域保留必要局部样式，例如文档/PDF 预览内容、打印模板、业务图表内部标记、表单字段间距；但页面骨架、卡片、筛选、表格、分栏、入口卡片必须优先使用已注册 Core primitive。

Level 1/1.5 额外硬约束：

- `npm run arch:gate` 是唯一架构入口，串行执行 AST 扫描、dependency-cruiser、module registry、app route hierarchy、资源注册、package boundary 和 auth/API 检查；任一阶段失败立即退出。
- AST 阶段阻断 UI 库 import、app 层新增 UI、权限绕过、RBAC 表直查、业务包 server alias 绕过和跨业务包 import。
- dependency-cruiser 阶段检查包级 DAG 和循环依赖。Core 不能 import Platform/Apps，Platform 不能 import domain package，domain package 不能互相 import，生成目录不参与依赖图。
- module registry 阶段要求每个业务包通过 `packages/platform/module-registry.ts` 注册并导出来自 registry 的 `moduleDefinition`；未注册、重复 key、从业务包反向聚合到 Platform 都会失败。运行态 rename/disable 通过 `packages/platform/module-overrides.ts` 进入 effective registry，禁止为展示改名散改技术 key、API path 或 FK key。
- ESLint 禁止 `antd`、`@mui/*`、`react-bootstrap` 等 UI 库 import。需要新基础 UI 时先补 `packages/core/ui`。
- 业务包之间禁止直接互相 import；跨模块能力必须进入 Platform service/registry，或通过明确稳定的 package contract 暴露。

Level 2 结构智能层：

- Level 2 不新增平行 hard gate；`npm run arch:gate` 仍是唯一 CI 架构门禁。
- Level 2 当前由三件套组成：`scripts/arch/level2.ts` 做 AST/pattern scan，`packages/platform/module-registry.ts` 做模块注册锁，`packages/platform/api-registry.ts` 做 API Contract。`packages/core/ui/component-registry.ts` 是 AST/pattern scan 的 Core UI 白名单输入，不是独立 gate。任何新增检测或 contract 来源必须并入这三个入口或唯一 gate，不得另起旁路。
- `npm run arch:level2` 生成确定性的结构报告，用于发现 UI pattern 重复、API route contract 覆盖缺口、API route 模板漂移、旧 service 迁移债和 app 层 JSX 存量。
- API Contract 的单一来源是 `packages/platform/api-registry.ts`，它从 effective module registry 的 `apiGuards` 和 `apiRoutes` 派生，不允许业务包维护第二套 API 清单。
- `apiGuards` 表示需要资源权限的 protected API；`apiRoutes` 表示显式 route contract，可标记为 `protected`、`public`、`dev` 或 `disabled`，用于登录/OAuth、开发入口、禁用兼容 API 等非资源权限入口。
- Level 2 中已升级为强制规则的漂移项由 `scripts/arch/level2-baseline.json` 锁定，并通过唯一 `npm run arch:gate` 执行。baseline 只能减少：新增未注册 API route、API route 裸 `prisma.`、非 GET route 缺结构化 validation、API route 缺 service 调用、app-root hook 实现、未复用 Core 的业务选择器、未注册 Core UI import、Core UI 已导出但未登记、Core UI registry 重名、非 Core 包新增手写页面壳、搜索型原生 input、旧 `server/services` 文件或重复 service group 都会失败；迁移删除后必须同步删 baseline 项。页面设计漂移会读取 TSX JSX pattern，拦截手写 surface、sticky header、layout grid、table、form/control、modal overlay、toolbar layout、action button 和 table scroll shell。
- Level 2 报告只读、不自动修复、不直接失败 CI。把某个发现升级为硬约束前，必须先进入 `scripts/arch/gate.ts` 所属的单 gate 系统，禁止在 CI 里新增旁路检查。
- Feature/Data/Operations agent 使用 Level 2 报告拆迁移任务时，只能改对应业务文件；Architecture agent 才能修改 `scripts/arch/*`、`packages/platform/module-registry.ts`、`packages/platform/api-registry.ts` 和相关治理文档。
- Architecture agent 做 baseline ratchet 时只能减少历史债。若迁移删除了旧 route-local service、app hook 或 direct permission 文件，必须同步删 `scripts/arch/level2-baseline.json`、`scripts/arch/level15-baseline.json` 或 `scripts/check/level1-api-baseline.json` 中对应项；禁止为新违规扩写 baseline。

Level 2 任务拆解规则：

- Architecture agent 输出给其他 agent 的任务必须是文件级或模块级动作，不能只写“优化 UI / 收敛 service”这类抽象目标。
- 每个任务必须包含：目标、范围、目标文件、动作类型（move/delete/refactor/rewrite）、目标归属层、依赖顺序、禁止触碰范围、验证命令和风险。
- 迁移顺序必须按依赖走：先稳定 Core/Platform 入口，再迁 route shell，再迁 domain service/UI，最后删除兼容旧代码和 ratchet baseline。
- 如果一个发现同时涉及 boundary corruption、validation weakness、abstraction gap、migration debt、duplication，优先级固定为：边界污染 > 校验薄弱 > 抽象缺口 > 迁移债 > 重复代码。
- Feature/Data/Operations agent 接到任务包后不再重新做全量架构分析，只执行目标文件动作。执行过程中发现需要修改 gate、registry、API contract 或 baseline 时，必须交回 Architecture，除非任务包明确授权。
- 任务包示例：

```txt
目标: 将某 API route 缩薄为认证/校验/service/DTO
范围: finance
文件: app/api/modules/finance/example/route.ts, packages/finance/server/example.ts
动作: refactor
目标层: api-shell + package
依赖: 先补 package service -> route 改调用 service -> 删除 route 内 Prisma/业务计算 -> ratchet baseline
禁止触碰: packages/work, .workspace/config/scripts/generate-product-stage-tests.mjs
验证: npm run arch:gate; npm run typecheck:quick
风险: medium
```

Feature/Data/Operations agent 的执行细则、baseline 权限和验证矩阵见 `docs/level2-agent-execution.md`。这份文档是任务包落地说明，不改变 `arch:gate` 的单一权威地位。

`app/` 层规则：

- `app/(modules|system|auth|docs)/**/page.tsx`、`layout.tsx` 等只做认证、预取和挂载 package component，不写业务渲染、筛选、表格、表单或弹窗。
- 页面源码使用 Next route groups 收口：业务页放 `app/(modules)/*`，平台/设置/管理放 `app/(system)/*`，登录放 `app/(auth)/*`，文档放 `app/(docs)/*`。这些 group 不改变 URL；新增业务页面必须挂在对应 L1 module 下，例如 `/work/tasks` 对应 `app/(modules)/work/tasks/page.tsx`。
- `app/api/*/route.ts` 只做认证、权限、参数校验、调用 package service 或 Platform 通用 factory、返回 DTO；业务模块 route 必须位于 `app/api/modules/<module>/*`，不得新增一级业务 API 目录或旧路径兼容壳。
- `app/components`、`app/hooks` 和旧 `lib` 只能作为兼容 re-export 或少量 Next 必须入口。新增真实实现必须进入 Core、Platform 或 domain package。
- `scripts/arch/level15-baseline.json` 同时锁定历史 app JSX 文件、非入口实现文件和 `components/hooks/lib` 目录；新增 `FooClient.tsx`、`useFoo.ts`、字段 helper、route-local component 这类文件都会被 `npm run arch:gate` 阻断，迁移删除后必须同步删 baseline。

## 9. Agent 交付要求

每次交付必须说明：

- 改了哪些文件。
- 属于哪个业务领域或平台能力。
- 跑了哪些检查。
- 是否改了 schema、权限、导入流程或架构文档。
- 有哪些遗留风险。

改完一个独立任务后要按风险检查并 commit。不要把多个无关任务混成一个 commit。开发中不要每个小 patch 都跑完整检查；明显切换新话题前，如果当前话题已有文件改动，先完成收尾检查和独立提交。

## 10. 当前已知治理债

这些不是马上阻断业务的错误，但后续应逐步清理：

- `prisma/schema.prisma` 已经很长，应按领域拆分。
- 部分历史文档、脚本或部署配置仍可能引用旧 route；清理代码入口时必须一并清理引用，避免 CI/CD 或 agent 按旧路径执行。
- `packages/platform/ui/admin` 里旧权限 tab 文件仍存在，统一权限矩阵稳定后可以删除。
- `lib/` 中有部分 server-only 逻辑，新代码优先放到 `server/`。
- `scripts/` 需要继续区分 check/import/migrate/generate。

治理债应单独开任务处理，不要混在业务功能 PR 里偷偷改。
