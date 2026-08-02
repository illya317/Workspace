# 架构治理规则

这份文档是给人和 agent 共用的“放东西地图”。项目现在还小，正适合把边界一次定清楚；以后增加绩效、采购、生产、更多财务数据时，按这套规则扩展，不靠临时感觉堆文件。

## 0. 文档入口

Agent 开工先遵守 `AGENTS.md` 的 Role Gate，调用 `workspace-role-router` 并进入对应 `.agents/skills/workspace-*`。本文件只保留架构放置规则，不再维护角色分流、并行线程或任务专题索引。

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

所有层默认遵守 `docs/engineering/deep-module-design.md`：模块以小而稳定的 interface 承载大量行为；给人的 UI 同样属于 interface。后端字段、完整生命周期、工作流节点、内部 action 和权限矩阵不得机械展开成用户选项；UI 只表达当前上下文中的业务意图，写入通过 Zod 与 domain validator 在进入持久化前返回准确、可操作的错误。

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

app/(modules)/<domain>/<l2>/
  page.tsx
  ARCHITECTURE.md

app/api/modules/<domain>/<l2>/
  route.ts or nested route.ts
```

不是每个模块第一天都要建满所有文件，但新增代码时必须往这个方向收敛。

源码 L1 所有权与职责投影统一声明在 `scripts/arch/source-code-analysis/declarations.ts`，产品包内的递归模块树声明在 `scripts/arch/source-code-analysis/capabilities.ts`。每个节点通过 `parentKey` 连接父模块，不写死 L2/L3/L4；文件归最深唯一匹配节点。跨分支只能引用目标节点的公开 Interface，祖先只有组合/入口边界可以装配后代 Implementation；历史直连以精确次数基线只减不增。每个受治理文件仍须落入 UI、输入边界、领域校验、业务实现、数据适配、组合壳、契约、测试或工具 role；role 是统计维度，不自动构成新模块。单文件必须守住可独立变化的 seam：输入 schema、domain validator、reference/persistence adapter、第三方 transport 和 React host 不得在同一文件交叉实现；事务型 application service 的持久化编排属于一个原子 use case，不强制增加透传 repository。页面/API 壳属于 composition/input，不能为了统计把拼装代码伪装成领域模块。详细标准见 `docs/engineering/deep-module-design.md`。

## 3. 新业务模块接入清单

新增绩效、采购、生产等模块时，执行 agent 必须按顺序完成：

1. 更新 `README.md` 的“当前业务模块”或“未来模块”说明。
2. 更新 `AGENTS.md` 或 `docs/engineering/agent-handbook.md` 的模块规则。
3. 创建模块或 L2 的 `ARCHITECTURE.md`，写清页面、数据来源、权限和 API 边界。
4. 在 `packages/platform/module-registry.ts` 注册 L1/L2 的 `href`、`resourceKey`、`apiPrefixes` 或 `noApiReason`；API URL 必须通过 `apiPrefixes` 直接推导 resource，需要 RBAC 常量时使用 `@workspace/platform/permissions`。
5. 设计 Prisma model，明确事实字段和计算字段。
6. 在 `packages/<domain>/server/` 写业务逻辑。
7. 在 `packages/<domain>/ui/` 写主要 UI。
8. 在 `app/api/modules/<domain>/<l2>/` 写 API route 壳。
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

公司、组织、租户相关的专有事实必须数据化，不能散落在代码里。租户身份、组织语义、HR 选项、Finance 导入计划、Work 编号、Docs/QC 产品和 Agent 编制以 `WORKSPACE_CONFIG_DIR/config/tenant/profile.json` 及其引用文件为输入；可变公司/组织事实仍以数据库为权威并由租户输入 seed。仓库和部署目标只读专用私有环境变量，不进入 profile 或根 manifest。只有 Platform `tenant-config` 负责路径解析、校验、缓存与 client-safe 快照，业务包只读取语义 accessor/context，不能直接读文件。`company:check` 保持 active baseline 为零并由 Hygiene 定期 strict 复查。

## 5. API 规则

模块内 API 的治理链路固定为：

```txt
module-registry 模块台账
  -> api-registry API contract
  -> createApiRouteHandler / createCommandRoute / with-auth / requireApiAccess
  -> domain service / action
  -> history / notification registry
```

`registeredModuleDefinitions` 是模块台账事实源：L1/L2 必须声明页面、资源、API 前缀或无 API 原因。L1/L2 的 `href` 自动派生 page contract；L2 以下真实页面和系统页面必须登记在同一个 `routes` 字段中，并声明 `access/resourceKey/gatePath/notes` 等必要语义。业务 API URL 统一为 `/api/modules/<module>/<resource path>`，resource path 直接推导 `resourceKey`，例如 `/api/modules/settings/api/manage/clients -> settings.api.manage`、`/api/modules/settings/account/api-access/key -> settings.account.apiAccess`、`/api/modules/hr/roster/generated -> hr.roster.generated`。`api-registry` 从台账派生 API owner contract：`method + pathPrefix + apiKind + access + URL-derived resourceKey + ownerModuleKey`；再从 `permission-api-action-policy.ts` 解析 effective authorization：`pathPattern + resourceKey + requiredActions + scopeExtractor(scopeId/projection) + runtimeEnforcement`。route 不再维护第二套资源/动作表。

API 权限语义以 `packages/platform/permission-api-action-policy.ts` 的 `requiredActions`、`pathPattern` 和 `scopeExtractor` 为准，动作 key 来自 `packages/platform/action-registry.ts`。未显式登记的存量 API 只按 HTTP method 得到最小新动作：`GET -> read`、`POST -> create`、`PUT/PATCH -> update`、`DELETE -> delete`。`requireApiAccess()` 读取 effective authorization 并用 `resourceKey + action + scopeId/projection` 判定；旧 RBAC action 不得进入 API contract 或运行时 adapter。需要对象、空间或流程上下文才能判断的接口用 `runtimeEnforcement=serviceDelegated`，并在 policy `notes` 中说明服务层 guard。

所有 `app/api/**/route.ts` 导出的 HTTP method 都必须命中注册契约：内部 API 由 `module-registry` 的 `apiRoutes` / `apiGuards` / `systemApiRoutes()` 覆盖，外部开放 API 由 `open-api-registry` 覆盖。新增 route 时先补注册，再写 handler；不能依赖目录命名或本地 wrapper 让未注册 API 漏过治理。

内部 API contract 会派生 `apiKind`，用于约束 `access/resourceKey/requiredActions` 组合。业务 API 的 resourceKey 必须优先由规范 URL 自动推导；旧兼容路径只能通过 module/child/capability 的 `apiPrefixes` 保留，并且具体 `apiGuards` 或 `apiRoutes` 必须声明 `migrationNote`。不得在 `apiGuards` 或 `apiRoutes` 里手写 `resourceKey`：

| apiKind | 判定 | resource/requiredActions | 说明 |
|---|---|---|---|
| `business` | `resourceKey` 存在 | 必须有 | 默认业务资源 API，必须落到具体 resource + requiredActions。 |
| `session` | `protected` 且无 `resourceKey` | 不允许 | 只校验登录态，例如 `/api/auth/me`、账号资料自助 API。必须写 `notes` 说明为何不是业务资源。 |
| `public` | `access=public` | 不允许 | 登录前可访问，只能返回非业务敏感数据。必须写 `notes`。 |
| `dev` | `access=dev` | 不允许 | 开发环境能力，不能作为生产业务接口。必须写 `notes`。 |
| `internal` | `access=internal` | 不允许 | 服务端内部维护入口，route 必须用 `createInternalApiRoute()`。必须写 `notes`。 |

Open API 不进入内部 `apiKind`；`/api/open/v1/**` 由 `open-api-registry` 的 endpoint/scope/action 表达。

API route 是 API shell，只做：

1. 认证。
2. 权限。
3. Zod 参数校验。
4. 构造 domain command。
5. 调用业务 action/service。
6. 返回 DTO。

新增或迁移的业务模块 API 必须优先使用 `createCommandRoute()`。route 文件只配置 `paramsSchema`、`querySchema`、`bodySchema`、`access`、`buildCommand` 和 `action`；不得在 route 里基于 parsed body/query 写业务 `if` 分派、业务必填组合判断、记录存在性判断或 service 错误映射。需要分派时，在对应业务包 `packages/<domain>/server/*route-command*.ts` 新增 command/action adapter；platform 只承接登录、权限、请求解析、command/result 映射和统一错误响应协议，不承载 HR/Finance/Work 等业务规则。

写入入口必须按三段式收口：

```txt
Zod schema -> domain validator -> service/Prisma
```

输入验证按分工执行：

- 前端负责输入体验，例如选择器、日期控件、数字控件和 FK 候选项查询；前端不是安全边界。
- Zod / API input schema 只校验请求形状，例如 body 是否为对象、rows 是否为数组、id 是否为正整数、field/value 是否存在。
- Domain validator 负责业务规则，例如枚举、日期、百分比范围、FK 是否存在且 active、记录归属、跨字段/跨行规则和归档/删除前引用保护。
- Service 只执行已经验证过的 command，负责事务、Prisma 写库、派生字段落库、`editedBy/editedAt/version`、`snapshotHistory` 和错误映射。

删除的最低平台规则是：删除前必须证明目标 ID 是合法正整数、目标记录存在、请求作用域成立、没有 required FK 或 active reference、目标状态允许删除、删除方式明确，并且引用清理、`snapshotHistory` 和删除/归档/停用处于同一事务边界。归档必须通过 `@workspace/platform/server/delete-guard` 显式声明引用已检查、确无引用或按聚合生命周期保留；声明 `setNull/cascade` 时必须同时实现引用清理，否则 gate 直接拒绝。通用字段级删除优先走 `@workspace/platform/server/crud-factory`，自定义删除服务优先复用 `@workspace/platform/server/delete-guard`；业务包只补充本领域的归属校验、引用清单和删除方式选择，不要靠 Prisma/DB 报错当业务规则。

新增多入口写入能力时，页面、导入、agent tool 或内部 API 只能新增 input adapter，把输入适配成 domain command；同一个业务字段或业务动作必须收口到同一套 domain validator。`npm run arch:gate` 会通过通用 domain validation ratchet 检查业务 API route、route-local helper、写 service 和 exported 写入口函数：新增写 service 必须消费本包 `packages/<domain>/server/domain/*-validation.ts`，route 不得直接或通过 package root 间接 import domain validator，service 不得重新散落 FK、日期、枚举、百分比、归档/删除引用保护等底层业务规则。即使一个文件已经 import domain validator，新增 exported `create/update/save/archive/delete/upsert/import` 写入口也必须在入口体内调用 domain validator 或走带校验 hook 的 CRUD helper；其中 `handleDelete` 只有在入口或引用的 config 里显式提供 `onBeforeDelete`，或入口直接调用已登记的 guarded/domain 删除验证入口时，才视为已验证。仅供内部复用的写 helper 不应 export。HR roster 当前 baseline 为 0；其他模块存量债由 `scripts/arch/domain-validation-baseline.json` 锁定，只能减少，不能新增。

跨业务使用的完成/日期语义统一进入 `@workspace/platform/completion-date-policy`：执行对象的公开字段固定为 `plannedStartDate / plannedEndDate / actualStartDate / actualEndDate`，完成状态固定为 `done`，归档固定为独立 `isArchived` 分类。实际日期不得晚于今日，`actualEndDate` 只允许在 `done` 时存在；前端控件和 domain validator 必须同时消费该策略，不能在业务包内再建日期或完成状态特例。

Level 1 起，业务资源权限入口统一为 `packages/platform/server/auth/authorize.ts` 的 `authorize()`。`requireApiAccess(request)` 是内部业务 API 的统一入口；新增或迁移的 `app/api/modules/**/route.ts` 默认使用 `createCommandRoute()`，route 只声明 schema/access/buildCommand/action，业务分支、dispatch、service-result 映射和 parsed body/query 判断必须进入对应业务包的 command/action 适配层。`createApiRouteHandler()` 仅用于非 command 的平台兼容适配，不作为新增业务模块 API 的默认入口。显式 `access=internal` 的维护型 API 不走登录/RBAC，但必须在 API contract 中声明为 `apiKind=internal`，写明 `notes`，并使用 `createInternalApiRoute()` 集中声明 internal 授权。旧 `withAuth` 等 wrapper 仅作为存量兼容，必须先委托 `requireApiAccess()`，再做历史兼容的模块级细分检查；新接口不得继续新增 wrapper route。新增 API route 不得直接调用 `checkPermission()` 或在 route 内重写角色判断。唯一例外是 root identity gate：`auth/admin.ts` 必须委托 `isRootAdminUser()`，且不得把 `system` 注册或判断为 RBAC resource。

有副作用的业务写操作优先显式命名 action，例如 `work.project.member.added`。业务侧只能调用 `sendNotification(type + payload)`，通知标题、正文、链接和默认重要性由 `packages/platform/server/notifications.ts` 的 notification registry 渲染；除 registry 内部外不得直接调用 `createNotification()`，也不得直接写 `prisma.notification.create/createMany/upsert`。

外部开放 API 使用独立边界：`/api/open/v1/**` 必须通过 `packages/platform/open-api-registry.ts` 注册，并使用 `withOpenApiScope(scopeKey, action, handler)` 校验 `Authorization: Bearer <OpenApiClient secret>`。开放 API 的资源写入 `OpenApiResource/OpenApiScope/OpenApiClientScopeGrant`，不写入内部 RBAC `Resource`，也不得调用 `authorize()`、`withAuth()` 或读取 `visibleResourceKeys`。`runtimeParentResourceKey` 只用于模块启停归属，不表达授权继承。

`npm run arch:gate` 的 auth 阶段会强制：

- `packages/platform/server/auth/authorize.ts` 存在并导出 `authorize()`。
- 核心业务 auth helper 委托 `authorize()`；root identity helper 委托 `isRootAdminUser()`。
- 新增或迁移的业务 API route 必须命中 registry API contract，并使用 `createCommandRoute()`；route 只做登录、权限、Zod 解析、构造 command、调用业务 action 和返回结果。明确的 public/dev/internal/disabled handler 必须在 API contract 中声明，`internal` handler 还必须使用 `createInternalApiRoute()`。
- 新增 API route 不得新增裸 `checkPermission()` 或裸 `prisma.`。当前历史债由 `scripts/check/level1-api-baseline.json` 锁定，只能减少，不能新增。
- 业务不得绕过 notification registry 直接调用 `createNotification()` 或 `prisma.notification.create/createMany/upsert`。

`npm run arch:gate` 的 AST 阶段不是 advisory：命中即 `exit 1`。它会阻断 `checkPermission`、`hasAccess`、`canAccess`、`roleCheck`、`rbacCheck` 等替代权限入口，阻断 `if (user.role)` 一类角色分支，阻断 `authorize()`/RBAC service 外新增 RBAC 表直查，并阻断业务包通过 `@/server/*` 或相对路径绕过边界。已有历史债只允许出现在 `scripts/arch/level15-baseline.json`，迁移删除文件时必须同时删 baseline 项；新增违规不能把 baseline 当白名单扩写。

权限动作：

新动作字典先注册在 `packages/platform/action-registry.ts`。它记录 permission action、非权限 UI action 和 deprecated 非权限 action；旧 `access/write/admin/withdraw` 权限 bundle 已下线，不再作为 runtime 兼容层。新增 action 先注册，且 permission action 的 icon 必须唯一。

API 新语义登记在 `permission-api-action-policy.ts` 的 `pathPattern + requiredActions + scopeExtractor`。旧 `access/write/admin/withdraw` 不得作为 API/RBAC permission action 出现。具体路径查询以 policy note 优先于宽泛 API contract note，便于解释 service-delegated 的真实授权点。

授权管理使用单独的 `grant` action；`admin` 不再作为权限 action。`/settings/admin` 入口必须通过 `requireAdminManageAccess()` 收口到 root identity，或拥有资源级 `grant` / `configure` 管理范围的用户；系统配置仅 root identity 可操作。

## 6. 文件大小红线

| 类型 | 目标线 / 硬上限 | 处理方式 |
|---|---:|---|
| 页面 facade | 150 行 | 拆 components/hooks |
| React 组件 | 新代码目标 220 行；package TSX lint 硬上限 500 行 | 拆子组件，但拆分必须缩小 interface 或提升 locality |
| hook | 新代码目标 220 行；package TSX lint 硬上限 500 行 | 拆 data/edit/filter/table，但避免纯搬家式 helper |
| API route | 120 行 | 逻辑移到 service |
| service | 新代码目标 260 行；package TS lint 硬上限 550 行 | 按 queries/summary/import 拆 |
| Core package | 新代码目标 300 行；Core lint 硬上限 450 行；registry data 500 行 | Core 内部按真实 seam 拆，不为行数新增 shallow module |
| Prisma 单领域文件 | 260 行非空内容 | 按领域继续拆 |

ESLint `max-lines` 只表达硬上限，不代表复杂度已经降低；Prisma model 文件由 `schema:check` 检查非空行数。超过目标线时优先收敛职责、缩小 interface、提高 locality；只有拆分能降低理解成本时才拆。任何超过硬上限的文件都必须先降到红线内，任务才允许继续交付或提交。

`lint:changed` 只负责 changed ESLint。总行数预算由 `complexity:line-budget` 手动检查；达到行数上限后的拆分质量由 `complexity:split-quality` 检查。拆分必须让主体加拆分文件的组内总量变瘦，或在当前 diff 中证明新 helper 被至少两个主体复用且复用消费者的减少量覆盖 helper 增长。未来复用不抵扣。

## 7. API 一级目录规则

API 一级目录只表达系统能力类型：

- `/api/auth/*`：登录、回调、改密、session check。
- `/api/settings/account/*`：当前登录用户自己的账号、安全密码、头像、目标、routine、week-info；普通自助接口是 `session` API，个人 API key 另挂 `settings.account.apiAccess` capability。
- `/api/settings/admin/*`：系统管理，包含用户、权限、资源和系统配置。
- `/api/settings/api/*`：Open API 接入管理，包含 Client、Scope 授权和调用日志。
- `/api/agent/*`：Agent L1 与工具栏助手共用的对话、能力清单和变更提案 API，直接由 `agent` 资源保护。
- `/api/modules/<module>/*`：业务模块数据入口，例如 HR、Finance、Work、Production、Library、Administration。
- `/api/open/v1/*`：外部开放 API，必须由 Open API registry 注册 endpoint 和 scope。
- `/api/integrations/*`：飞书、企业微信、外部 webhook 等系统集成。

新业务代码必须使用模块入口：

- HR：`/api/modules/hr/roster/*`
- 财务：`/api/modules/finance/*`
- Work：`/api/modules/work/*`
- 生产：`/api/modules/production/*`
- 资料库：`/api/modules/library/basic-info/*`
- 行政：`/api/modules/administration/*`

`/api/modules/<module>` 只是路由归属和权限归属，不表示 API 层可以写业务逻辑。真实逻辑仍然在 `packages/<module>/server/*`；route 只能做认证、权限、Zod 参数校验、调用 package service 或 Platform 通用 factory、返回 DTO。写入请求继续按 `Zod schema -> domain validator -> service/Prisma` 收口。

`/api/open/v1/*` 不属于业务模块内部 API，也不复用 L2 RBAC resource。新增开放能力时必须一次性注册共享管理页 `consoleHref=/settings/api`、同页 `consoleTab`、开放资源 `resources`、授权 scope、endpoint、`runtimeParentResourceKey`。开放能力只能进入 `/settings/api` 的同页 tab，禁止为单个 registration 新建 `/settings/api/*` 页面；`npm run arch:gate` 会检查 registry、共享页面、route 文件和 route wrapper 是否一致，page contract gate 会拒绝未登记的深层页面。

禁止新增 `/api/hr`、`/api/finance`、`/api/work`、`/api/employees` 等一级业务目录，也不要用 redirect 或 compatibility proxy 继续延长旧路径。历史旧路径删除时必须同步删除文档、脚本和部署配置中的引用。

## 8. Package 边界规则

package 依赖必须单向：

```txt
app/* route shell
  -> @workspace/<l1>
  -> @workspace/platform
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
- API route 只做认证、权限、Zod 参数校验、调用 service、返回 DTO；复杂业务逻辑必须进入领域 service 或业务包。
- `app/lib/module-nav.tsx` 只是兼容出口，模块真实注册来源是 `packages/platform/module-registry.ts`。`packages/platform/modules.tsx` 只消费 registry 并生成运行时聚合，不直接 import domain 包。
- 模块注册的 `href` 和 `routes` 只写不带 basePath 的站内绝对路径，例如 `/hr/roster`；禁止把 `@workspace/*` package 名或 `/workspace` basePath 写入 URL。
- `moduleDef.href` 必须是 L1 根路径，例如 `/work`；`moduleDef.children[*]` 是 L2 业务入口单元，必须是直接二级页面 route，例如 `/finance/statements`、`/production/qc`、`/work/me`。禁止用嵌套三级页面伪装 L2，也禁止在 app 顶层另建绕开 L1/L2 registry 的 route shell。
- L1/L2 页面不再在 `routes` 中重复登记；`routes` 只登记 L2 以下页面或无 moduleDef 的系统页面。资源页面默认继承最长匹配的 L1/L2 `href` 作为 `gatePath`，特殊页面必须显式声明 `access`，例如 `adminManage`、`authenticated` 或 `public`。
- L2 四件套必须统一：真实 app route、URL `href`、`resourceKey + RBAC`、API contract/guard 一一对应。L2 的 `resourceKey` 必须等于 `module.key + "." + child.key`，例如 `finance.statements`、`production.qc`、`work.me`；多个页面不能共用一个模糊 resource，例如旧 `finance.statement`。
- 每个 L2 必须声明规范 API URL 或明确 `noApiReason`。规范 URL 是 `/api/modules/<module>/<resource path>`，由 resourceKey 自动生成并推导；`apiPrefixes` 只保留旧兼容路径，必须配套 `migrationNote`。API contract 只写 `method/pathPrefix/access`，由 Platform 按最长前缀推导 owner resource；宽泛的 `/api/modules/<module>` 只能作为迁移兼容，不允许作为 L2 最终契约来蒙混覆盖。
- `app` 真实页面路径必须落在注册过的 L1 module 或系统保留 route 下。源码可以使用 route groups，例如 `app/(modules)/work/page.tsx` 对外仍是 `/work`。禁止重新创建绕开 L1 的顶层 route shell。
- `app/(modules)` 页面只能做 route shell：认证、预取、参数解析后挂对应 `@workspace/<module>/ui` 或 `@workspace/platform/ui` 组件。除 login 等系统特例外，模块 app page 不得直接 import `@workspace/core/ui`、不得手写 DOM/Surface/UI 组合；普通 L1 目录页必须使用 Platform `ModuleHomePage`、挂本 L1 的明确专用首页，或只做鉴权后 redirect 到已注册的默认 L2 页面。Agent 与 Work 都是 page gate 显式登记的专用 L1 入口。
- 根 `app/*` 是唯一 route/API 壳；禁止重新引入生成 App 副本或按模块拆分第二套构建/部署代码。
- L2 以下 capability 属于业务能力，不自动进入全局页面 L2。capability 必须声明 `capabilityOwnerKey`，直接指向已注册 L2，或通过无环 capability owner 链最终落到已注册 L2；它不能用 `parentKey` 继承 owner 权限，但可以用 `runtimeParentKey` 跟随 owner 的模块启停。Settings 下的 account/admin/api 也是标准 L2，页面 URL、resource、RBAC 和 API contract 必须统一。
- 资源注册中的 `parentKey` 只表达权限树继承；模块启停级联使用 `runtimeParentKey`。不要用 `parentKey` 同时表达权限继承和运行态归属；只有真实存在独立授权语义的能力才声明 capability，并用 `runtimeParentKey` 跟随 owner 模块启停。
- Headless module 必须声明 `presentation: "headless"` 和 `noPageReason`；其 capability 必须声明独立 resource 与 `capabilityOwnerKey`，不能借 capability 权限生成管理页面。Agent 已是普通 L1，`/agent` 会话、工具栏与 `/api/agent/**` 直接复用 `agent`，不能再为同一调用能力建立重复 capability。Agent 模型面固定为三个受保护业务 API connector，不得为源码、领域 adapter、内部 RPC 或部署能力再建 capability；本地开发、直接提交和部署属于外部运行时。
- Settings 下的 account/admin/api 是标准 L2。默认权限、隐式继承和 Open API 边界只在 `docs/engineering/security/rbac.md` 维护，不在 registry 或页面层写特判。

这些规则由 `npm run arch:gate` 中的 module registry、app route hierarchy、resource registry 和 package boundary 检查执行。package boundary 还会扫描非 Core 包内疑似重复基础组件文件名（例如 `*Select*`、`*Dropdown*`、`*Confirm*`、`*Date*Input`、`*Search*`、`*Table*`、`*Filter*`、`*Shell*`、`*Toolbar*`、`*Modal*`、`*Pagination*`、`*Tab*`）。这些组件必须 import Core/Platform 对应基建，或在 `scripts/check/check-package-boundaries.js` 的 allowlist 中写明业务特殊性和迁移计划。

Core UI registry 治理：

- Core UI registry 保留三组核心口径：`declares` 是 agent 可声明能力，`contract` 是生成契约详情，`composes` 是内部组合关系。旧 `category/subcategory`、`role`、`exposure`、`verified` 不再作为 registry 字段。
- 业务和普通 agent 默认只能使用公共 runtime 入口、helper 或 Surface spec；正文二级 Surface 通过 `BodySurface` 声明，不作为业务直引 renderer。`/settings/governance` 的 UI Tab 只自动展示有 `declares` 的封装组件，分类派生为 `页面布局 / 页面内容 / 通用`。
- 标准页面级新建流只有一个 `PageSurface.create` slot；body 含 split 时 Core 将 inline/block 投影到右侧详情并在新建期间锁定主栏可见，禁止全页横跨分栏。局部新建通过 `BodySurface kind="create"` 使用 `CreateSurface trigger="surface"`。业务不得声明 toolbar trigger。内部 renderer 不得挂 public `declares`，按钮位置、样式和顺序不得进入业务 contract。
- Platform runtime 使用 Core UI 时只能走公共 runtime 入口、根级 `FeedbackProvider` 和纯非组件事件能力；系统专有菜单、系统壳和账号入口由 Platform 自己封装，不再保留 `PageShell` / `DropdownMenu` 直引例外。Agent L1 使用 Platform `ModuleHomePage`；三个 L2 分别通过公开的 `PageSurface` / `BodySurface` contract 组合配置、分析和汇报视图。
- 改 `packages/core/ui/**`、Core UI registry 或 `/settings/governance` 的 UI 声明能力页必须是 UI-system/Architecture 任务，并通过 `CORE_UI_CHANGE=1` 或明确 change request 授权。

页面组件注册表：

- `packages/core/ui/registry/component-registry.ts` 是 Core UI primitive 和页面骨架的注册表。非 Core 包只能消费 registry 中登记的 Core UI 名字；新增 Core UI 入口必须先由 Architecture/Core 任务登记，再导出给 Feature 使用。注册项必须填写中文 `description`，公共声明入口补清晰 `declares`，内部组合关系写入 `composes`。
- 该 registry 是 structure scan 的输入；结构性 UI ratchet 由 `gate:ui` 执行，简单清扫项才由 hygiene strict 执行。
- Registry 不再维护一级/二级分类模型；声明组件库分类由声明视图派生。业务直引非公共 runtime renderer、domain shared layout shell 和 Surface 自带 page chrome 属于结构性 UI 阻断；需要新声明入口或复杂页面重构时由 Architecture/Feature 处理，不交给 Hygiene。
- Core UI 的 value export 必须全部出现在 `component-registry.ts`，或明确列入 structure scan 的非组件导出集合；注册名重复会直接进入 `duplicateCoreUiRegistrations`。这两类 baseline 为空，新增即失败。
- 非 Core 包新增手写页面设计壳会进入 `pageDesignDriftFiles` 检测：在 `packages/*/ui` 中直接用原生 JSX 容器拼 `bg-white`、`rounded`、`shadow/border`、sticky header、页面级 grid 等页面结构时视为漂移。Platform-owned system shell 文件（当前 `AppShell` / `LoginClient` / `UserMenu`）由 Platform 单独封装，只接受窄名单例外；历史债由 `scripts/arch/structure-baseline.json` 锁定，Feature/UI 迁走后必须删对应 baseline 项。
- `PageSurface` 的 `moduleView` 是历史过渡逃生口，不是新增业务页面 API。业务 UI / `app/(modules)` 的存量 `moduleView` 会按 `shell-host`、`content-wrapper`、`split-side`、`analysis-visual`、`report-document`、`complex-editor`、`navigation-composition` 分类进入 `businessModuleViewUsages` baseline；新增或迁移删除都必须通过同一 Structure ratchet。
- 允许业务内容区域保留必要局部样式，例如文档/PDF 预览内容、打印模板、业务图表内部标记、表单字段间距；但页面骨架、卡片、筛选、表格、分栏、入口卡片必须优先使用已注册 Core primitive。

Level 1/1.5 额外硬约束：

- `npm run check:blockers` 是当前改动阻断入口，分为 `gate:domain` 和 `gate:ui`；`npm run arch:gate` 保留为兼容总入口，内部仍串行执行这两类 gate。
- AST 阶段阻断 UI 库 import、app 层新增 UI、权限绕过、RBAC 表直查、业务包 server alias 绕过和跨业务包 import。
- dependency-cruiser 阶段检查包级 DAG 和循环依赖。Core 不能 import Platform/Apps，Platform 不能 import domain package，domain package 不能互相 import，生成目录不参与依赖图。
- TypeScript project references 是同一依赖方向的编译器级事实：Core 无 Workspace reference，Platform 只引用 Core 与 Prisma Client，所有业务 package 只引用 Core 与 Platform，Next App 和 tooling 位于图顶端。根 `tsconfig.json` 保持 `files: []`，只继承 `tsconfig.base.json` 的公共选项供仓库运行时解析 alias 并列出 solution references；不得给业务 package 增加另一个业务 package reference 来绕过 package interface。
- package 与 App 工程只生成声明到 `.cache/types/`，增量状态进入 `.cache/tsbuild/`。`npm run typecheck:references:check` 校验引用图、输出隔离、Next 配置和 CI 缓存；包级实现仍必须通过 `package.json#exports` 暴露，不能因为 `paths` 能解析就深引未公开文件。
- package、App shell、E2E 和根配置不得通过 `@/packages/*` 或相对路径绕过 package exports；package 之间的合法上游依赖也必须走公开 `@workspace/*` 入口。`scripts/` 是唯一允许相对读取 package 内部实现的 privileged tooling 工程，用于架构检查、生成器和迁移；它通过单独的 `tsconfig.tooling.json` 位于工程图顶端，不能被 package 或 App 反向引用。
- module registry 阶段要求每个业务包通过 `packages/platform/module-registry.ts` 注册并导出来自 registry 的 `moduleDefinition`；未注册、重复 key、从业务包反向聚合到 Platform 都会失败。运行态 rename/disable 通过 `packages/platform/module-overrides.ts` 进入 effective registry，禁止为展示改名散改技术 key、API path 或 FK key。
- ESLint 禁止 `antd`、`@mui/*`、`react-bootstrap` 等 UI 库 import。需要新基础 UI 时先补 `packages/core/ui`。
- 业务包之间禁止直接互相 import；跨模块能力必须进入 Platform service/registry，或通过明确稳定的 package contract 暴露。

Structure Scan 结构智能层：

- Structure scan 不再整体归入 Hygiene。它按 detector scope 分成 `domain-blocker`、`ui-blocker` 和 `hygiene`：前两者进入 blockers，后者才进入 Hygiene Role。
- Structure scan 当前由三件套组成：AST/pattern scan、`packages/platform/module-registry.ts` 模块注册锁、`packages/platform/api-registry.ts` API Contract。`packages/core/ui/registry/component-registry.ts` 是 AST/pattern scan 的 Core UI 白名单输入，不是独立 gate。任何新增检测或 contract 来源必须并入这三个入口或唯一 gate，不得另起旁路。
- `npm run arch:structure` 生成确定性的结构报告，用于发现 UI pattern 重复、API route contract 覆盖缺口、API route 模板漂移、旧 service 迁移债和 app 层 JSX 存量。
- API Contract 的单一来源是 `packages/platform/api-registry.ts`，它从 effective module registry 的 `apiGuards` 和 `apiRoutes` 派生 owner contract，并合并 `permission-api-action-policy.ts` 的 effective authorization；不允许业务包维护第二套 API 清单。
- `apiGuards` 表示需要资源权限的 protected API；`apiRoutes` 表示显式 route contract，可标记为 `protected`、`public`、`dev` 或 `disabled`，用于登录/OAuth、开发入口、禁用兼容 API 等非资源权限入口。
- `scripts/check/check-resource-registry.js` 会反查真实 `app/api/modules/**/route.ts` 导出方法是否命中 contract，`scripts/check/check-api-routes.js` 会检查全量 `app/api/**/route.ts` 导出方法是否命中注册契约、route 目录、L2 API base 和统一 gate，`scripts/check/check-notification-registry.js` 会阻断业务直接拼通知。
- Structure scan 中已升级为强制规则的漂移项由 `scripts/arch/structure-baseline.json` 锁定，并按 scope 执行：业务/API/legacy/service 类进入 `arch:structure:domain`，结构性 UI 类进入 `arch:structure:ui`，简单清扫类进入 `arch:structure:hygiene`。baseline 只能减少；迁移删除后必须同步删 baseline 项。
- Structure 完整报告只读、不自动修复、不直接要求 Hygiene 清完。把某个发现升级为硬约束前，必须明确放入 `domain-blocker` 或 `ui-blocker` scope；简单清扫项才能留在 `hygiene` scope。
- Feature/Data/Operations agent 使用 Structure 报告拆迁移任务时，只能改对应业务文件；Architecture agent 才能修改 `scripts/arch/*`、`packages/platform/module-registry.ts`、`packages/platform/api-registry.ts` 和相关治理文档。
- Architecture agent 做 baseline ratchet 时只能减少历史债。若迁移删除了旧 route-local service、app hook 或 direct permission 文件，必须同步删 `scripts/arch/structure-baseline.json`、`scripts/arch/level15-baseline.json` 或 `scripts/check/level1-api-baseline.json` 中对应项；禁止为新违规扩写 baseline。
- Core UI 大迁移需要定期 review gate/report：每个阶段至少阅读 Core UI registry validation、structure ratchet 和 import baseline，确认 Core UI import bypass 和 `businessModuleViewUsages` 只减少、不变宽，`platformCoreUiRoleBypassImports` 保持为空；Production QC 质检纸、批记录、打印/留档渲染不得纳入宽泛 UI codemod。

Structure 任务拆解规则：

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
禁止触碰: packages/work, .workspace/tools/qc/generate-product-stage-tests.mjs
验证: npm run arch:gate; npm run typecheck:scope -- finance
风险: medium
```

Feature/Data/Operations agent 的执行细则、baseline 权限和验证矩阵见 `docs/engineering/structure-agent-execution.md`。这份文档是任务包落地说明，不改变 `arch:gate` 的单一权威地位。

`app/` 层规则：

- `app/(modules|system|auth|docs)/**/page.tsx`、`layout.tsx` 等只做认证、预取和挂载 package component，不写业务渲染、筛选、表格、表单或弹窗。
- 页面源码使用 Next route groups 收口：所有正常 L1 页面放 `app/(modules)/*`，平台保留页放 `app/(system)/*`，登录放 `app/(auth)/*`。这些 group 不改变 URL；新增业务页面必须挂在对应 L1 module 下，例如 `/docs` 对应 `app/(modules)/docs/page.tsx`。
- `app/api/*/route.ts` 只做认证、权限、Zod 参数校验、调用 package service 或 Platform 通用 factory、返回 DTO；业务模块 route 必须位于 `app/api/modules/<module>/*`，不得新增一级业务 API 目录或旧路径兼容壳。
- `scripts/arch/level15-baseline.json` 同时锁定历史 app JSX 文件、非入口实现文件和 `components/hooks/lib` 目录；新增 `FooClient.tsx`、`useFoo.ts`、字段 helper、route-local component 这类文件都会被 `npm run arch:gate` 阻断，迁移删除后必须同步删 baseline。

## 9. Agent 交付要求

每次交付必须说明：

- 改了哪些文件。
- 属于哪个业务领域或平台能力。
- 跑了哪些检查。
- 是否改了 schema、权限、导入流程或架构文档。
- 有哪些遗留风险。

改完一个独立任务后要按风险检查并 commit。不要把多个无关任务混成一个 commit。不要每个小 patch 都跑完整检查；部署前、一个任务收口、或多文件/大量改动时再按风险跑。明显切换新话题前，如果当前话题已有文件改动，先完成收尾检查和独立提交。

## 10. 当前已知治理债

这些不是马上阻断业务的错误，但后续应逐步清理：

- `prisma/schema.prisma` 已经很长，应按领域拆分。
- 部分历史文档、脚本或部署配置仍可能引用旧 route；清理代码入口时必须一并清理引用，避免 CI/CD 或 agent 按旧路径执行。
- `packages/settings/ui/admin` 里旧权限 tab 文件仍存在，统一权限矩阵稳定后可以删除。
- `lib/` 中有部分 server-only 逻辑，新代码优先放到 `server/`。
- `scripts/` 需要继续区分 check/import/migrate/generate。

治理债应单独开任务处理，不要混在业务功能 PR 里偷偷改。
