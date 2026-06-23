# Agent 详细手册

这份文档承接原 `AGENTS.md` 中的大段细则。`AGENTS.md` 只做入口和导航；规则细节、流程清单和速查表统一放在这里或对应专题文档。

## 1. 技术栈

- **框架**: Next.js 16 + React + TypeScript + Tailwind CSS
- **数据库**: Prisma ORM + SQLite (`data/dev.db`)
- **认证**: JWT Cookie + Open API Bearer Client
- **CI/CD**: GitHub Actions 负责公开 CI；CNB API/CLI 只触发私有生产发布，CNB/Linux CD 容器构建 standalone 产物，CVM + PM2 只解包产物并重启

## 2. 部署与运行态同步

仓库有两个主要远端：`github` 用于公开 CI，`origin` 使用 CNB 用于私有 CD/生产发布。

- `git push github main` 触发 GitHub Actions CI；CI 执行 `npm run ci`。
- `git push origin main` 只同步 CNB 源码，不触发生产发布，也不作为常规 CI 使用。
- 本地不直连服务器部署；正式发布必须先 commit，并同步 push 到 GitHub 与 CNB，再用 CNB API/CLI 触发 `.cnb.yml` 的 `api_trigger`。
- CNB/API 部署使用 `./ops/deploy.sh`，在 CNB/Linux CD 容器里完成部署构建，然后只把 `.next/standalone` 产物包上传到服务器；服务器不执行 `npm ci` / `npm run build`。
- 服务器运行态只来自 `REMOTE_WORKSPACE_CONFIG_DIR`，包括 `.env`、`data/`、`public/company`、`public/assets/agent/avatar/` 等，不随构建产物覆盖；每次部署会先备份该目录。
- `data/` 以服务器为准：本地 `data/` 不上传覆盖服务器。
- 项目根不要创建 `data -> 外部目录` 软链；Next/Turbopack 构建会追踪项目根 data 软链并可能因指向项目外而失败。代码通过 `.env` 中的 `DATABASE_URL`、`WORKSPACE_CONFIG_DIR` 直接指向外部 data。
- `.env` 可以软链到外部 `.workspace/.env`；`public/company` 和 `public/assets/agent/avatar` 开发时可软链到 `.workspace/assets/...`，生产 standalone 打包时脚本用 `cp -rL` 复制真实文件。

更新源码流程：

```bash
git status --short
git add <files>
git commit -m "<message>"
git push github main
git push origin main
```

生产发布流程：

```bash
sha="$(git rev-parse HEAD)"
cnb build start-build \
  --repo illya317/workspace \
  --branch main \
  --sha "$sha" \
  --event api_trigger \
  --title "deploy ${sha:0:8}" \
  --sync false \
  --verbose
```

部署后用返回的 `sn` 查询状态：

```bash
cnb build get-build-status --repo illya317/workspace --sn "<sn>" --verbose
```

如果部署失败，用同一个 `sn` 和 pipeline/stage id 拉取失败 stage 日志；不要再额外 push 一次制造第二条部署记录。

新环境构造、`.workspace` 目录恢复、服务器 data 拉取规则见 `/Users/koito/Desktop/workspace/.workspace/AGENTS.md`。部署专题说明见 `docs/ops/deploy.md` 和 `docs/ops/environment.md`。

## 3. 项目地图

本项目不是单一 HR 应用，而是会继续扩展 HR、财务、库存、合同、绩效、采购、生产等模块的内部管理系统。新增能力时先判断它属于哪一层：

当前改造方向是“三层多包”，这是后续 agent 写代码的默认前提：

- **Core 底座**：只放通用 UI、字段输入、筛选、表格、确认弹窗、日期、FK 搜索、tag 输入、路由 helper 等纯通用能力；不能依赖 Prisma、权限和业务事实。
- **Platform 主体**：放登录、权限、资源树、模块注册、导航、审计、用户账号、Portal 和平台页面壳；可以聚合模块注册，但不写 HR/生产/财务的业务规则。
- **Apps 业务包**：HR、Production、Finance、Work 等各自拥有自己的 `ui/server/types/constants/import`，业务查询、校验、导入、DTO 和页面组件都要逐步下沉到对应包。

`app/` 和 `app/api/` 只承担 Next 路由壳。新增和重构时不能继续按旧思路把业务逻辑堆在 route；必须顺着包边界迁移。

| 层级 | 目录 | 职责 |
|---|---|---|
| Core 底座 | `packages/core/` | 通用 UI、hooks、字段、弹窗、日期、FK 搜索、tag 输入、routing/search helper |
| Platform 主体 | `packages/platform/` | 登录、权限、资源树、模块注册、导航、审计、用户、Portal、平台 server runtime 契约 |
| Apps 业务包 | `packages/hr/`, `packages/production/`, `packages/finance/`, `packages/<domain>/` | 各业务模块自己的 UI、server、types、constants、import、module 注册 |
| 业务页面壳 | `app/(modules)/<domain>/` | Next 路由 facade，只组合 package UI，保留领域 `ARCHITECTURE.md` |
| API 路由壳 | `app/api/modules/<domain>/<l2-kebab>/` | 鉴权、权限、Zod 参数校验、调用 package service、返回 DTO |
| 开发辅助 | `app/api/auth/dev-login-bypass/` | 开发环境快速登录，仅本地 |
| 旧业务服务 | `server/services/<domain>/` | 存量兼容/待迁移旧代码；新增业务 service 不再优先放这里 |
| 认证权限 | `@workspace/platform/server/auth`, `@workspace/platform/permissions`, `packages/platform/server/auth/`, `packages/platform/server/rbac/` | 登录、session、RBAC、资源树；新代码使用 Platform 契约 |
| 数据库 | `prisma/` | Prisma schema、migration、seed |
| 文档治理 | `docs/`, `app/*/ARCHITECTURE.md` | 项目地图和模块边界 |

新增业务模块必须先建立 package 边界。例如绩效模块应使用 `packages/performance/{module,ui,server,types,constants,import}` 承载实现，再由 `app/(modules)/performance/<l2>/` 和 `app/api/modules/performance/<l2>/` 提供薄路由壳。禁止把新模块塞进 HR、Finance 或 route 文件里借壳生长。

### Agent 接力和文件隔离

开工前先读 `docs/agent-startup.md`，再按角色进入 `docs/roles/*.md`，最后按任务类型进入专题文档。Architecture、Feature、Data、Operations、Review 不能混用职责：

| 角色 | 权威说明 |
|---|---|
| Architecture | `docs/roles/architecture.md` |
| Feature | `docs/roles/feature.md` |
| Data | `docs/roles/data.md` |
| Operations | `docs/roles/operations.md` |
| Review | `docs/roles/review.md` |

并行时只 stage 自己的文件。`git status --short` 中出现其他 agent 的范围时，不要提交、回滚、格式化或改名。确实需要干净工作区验证时，先 stage 自己的文件，再用 `git stash push --keep-index --include-untracked` 临时隔离，验证后恢复 stash。

## 4. 必读文档触发条件

`AGENTS.md` 保留简版触发表。完整治理规则见 `docs/architecture-governance.md`。

如果任务同时命中多个条件，全部相关文档都要读。读完后在交付说明里写明参考了哪些文档，以及是否同步更新了文档。

涉及下拉、搜索、筛选、日期、确认弹窗、tag 输入、表格、页面模板时，还必须先读 `docs/reusable-components.md`。已有 Core/Platform/App 组件能覆盖的场景，不允许在页面或业务包里重复造控件。

## 5. 新模块接入流程

仅适用于“新增业务模块 / 新 domain”。如果是在已有模块内新增 Tab、审核流、规则页、CRUD 能力，改看 `docs/existing-module-feature-checklist.md`。

1. 在 `packages/platform/module-registry.ts` 注册 L1/L2：`moduleDef`、`children`、`href`、`resourceKey`、`apiPrefixes` 或 `noApiReason` 必须一次写齐。
2. L1/L2 RBAC resource 由 module registry 自动派生；不要在业务包里重复手写主资源，也不要在 seed 里维护第二套资源树。需要 RBAC 常量时使用 `@workspace/platform/permissions`。
3. `packages/<domain>/module.ts` 必须导出 registry 中的 `moduleDefinition`，不要在业务包本地重新定义模块。
4. 模块展示名、描述、隐藏和启停优先改 `packages/platform/module-overrides.ts`；不要为了中文 rename 改 `resourceKey`、FK key、API path 或 URL path。
5. `parentKey` 只表达 RBAC 权限继承；不能继承父权限、但必须随模块启停的 capability 使用 `runtimeParentKey`，例如 `work.projects.viewAll`。
6. 创建模块或 L2 的 `ARCHITECTURE.md`，写清楚数据来源、事实字段、计算字段、权限、页面和 API 边界。
7. 如需新表，创建 `prisma/models/<domain>.prisma`，同步 migration/seed，并更新数据库文档。
8. 在 `packages/<domain>/server/` 写业务逻辑；`server/services/<domain>/` 只用于尚未迁移的存量代码。API route 只做认证、权限、Zod 参数校验、调用 service、返回 DTO；写入请求按 `Zod schema -> domain validator -> service/Prisma` 落位。
9. 在 `app/api/modules/<domain>/<l2-kebab>/` 写 route handler，GET/POST/PUT/PATCH/DELETE 必须匹配 registry 中同一个 L2 的 resource/action。系统设置例外走 `/api/settings/<l2>`，认证和 Agent 是独立 L1。
10. 在 `packages/<domain>/ui/` 写主要 UI；`app/(modules)/<domain>/` 只放 Next route facade。模块首页用 Platform 的 `ModuleHomePage`，L2 子页面用 Platform 的 `AppShell`。
11. 对需要独立权限的子页面，在对应子目录加 `layout.tsx`，调用 `requireRouteAccess("<href>")` 做路由门禁；不要在页面手写 resource key。
12. 删除 L1/L2 时同步删除 registry、真实 app route、API route、docs 和相关引用；`scripts/seed-resources.ts` 会清理 DB 中未注册的 stale resources 及其授权，不要留下 hidden/disabled 旧 resource 当兼容层，除非任务明确要求。
13. 同步更新 `README.md`、`AGENTS.md` 或 docs、`docs/new-module-checklist.md` 和对应模块文档。
14. 交付前运行硬约束，并提交一个清晰 commit。

摘要：

| 步骤 | 内容 |
|------|------|
| 1. L1/L2 注册 | `packages/platform/module-registry.ts` 注册页面、API contract、resourceKey；主 RBAC resource 自动派生 |
| 2. 导航 | `packages/<domain>/module.ts` 导出 registry 中的 `moduleDefinition`，不要维护第二套导航 |
| 3. 数据库 | `prisma/models/<domain>.prisma` + migration + seed |
| 4. 页面 | facade server component + 子目录 `layout.tsx` 路由门禁 |
| 5. API | 认证 -> 权限 -> Zod 参数校验 -> 调 package service -> 返回 DTO；写入继续进 domain validator 和 service |
| 6. Service | `packages/<domain>/server/` 业务逻辑 |
| 7. 文档 | `ARCHITECTURE.md` + README/AGENTS/docs/checklist |
| 8. 硬约束 | `tsc --noEmit` / `lint --max-warnings=0`（含文件行数红线） / `build` / `arch:gate` |

## 6. 数据库模型

核心业务表：

| 表 | JSON 来源 | 说明 |
|---|---|---|
| `Employee` | `employees.json` | 员工基础信息，16 字段 |
| `Employment` | `employments.json` | 雇佣信息，status/company/joinDate/leaveDate/contracts 等 |
| `EDP` | `employee_positions.json` | 员工-部门-岗位关联，`@@map("EmployeePosition")` |
| `Department` | `department.json` | 部门树，扁平存储，parentId 推导自 children |
| `Position` | `position.json` | 岗位 |
| `PositionDescription` | `position-descriptions/*.json` | 岗位说明书，details 为 JSON blob |
| `Company` | `companies.json` | 公司 |

已删除的表/字段：ManagementGroup 整张表、Employee.deleted/deletedTime/deletedBy、EDP.system/center/sortOrder、Department.sortOrder 等。

审计字段统一顺序为 `editedBy -> editor -> editedAt -> version -> createdAt -> updatedAt`。Employee、Employment、Company、Department、Position、EDP、Project、EmployeeProject、PositionDescription、Report 均具备。

Schema 可视化文档：`docs/generated/tables.html`，通过 `node scripts/gen-tables-html.js` 生成。

## 7. Prisma Schema 规则

- 当前 schema 仍在 `prisma/schema.prisma`，新增领域前优先完成或遵守多文件 schema 治理计划。
- 目标结构是按领域拆分到 `prisma/models/*.prisma`，主 `prisma/schema.prisma` 只保留 `generator` 和 `datasource`。
- 所有 model 必须按领域归属：auth/rbac、hr、reports、works、finance-ledger、finance-cost、inventory、contracts、future domains。
- 每个 model 前必须有 `///` 注释，说明业务含义、数据来源、是否事实表。
- DB 默认只保存事实字段；合计、百分比、毛利、单位成本、未回款等派生结果必须放在 service 层计算。
- Finance Cost 禁止把 normalized JSON 原样映射成 DB schema。
- 修改 schema 后必须同步更新对应 `ARCHITECTURE.md` 和 `docs/database.md` 或 `docs/schema-governance.md`。

## 8. 数据导入

源数据在 `prisma/seed-data/*.json`、`prisma/seed-data/position-descriptions/*.json` 和 `prisma/seed-data/department-descriptions/*.json`。

导入顺序：

```txt
Company -> Department -> PositionDescription -> Position -> Employee -> Employment -> EDP
```

重置数据：

```bash
rm data/dev.db && npx prisma db push
```

## 9. 关键路由

| 页面 | 路径 | 权限 |
|------|------|------|
| 登录 | `/login` | 公开 |
| 入口 | `/portal` | 登录 |
| 工作计划 | `/work/tasks` | `work.tasks.access` |
| 人事行政 | `/hr` | `hr.access` |
| 管理后台 | `/settings/admin` | `settings.admin.access` |
| 账号与接入 | `/settings/account` | `settings.account.access` |
| 个人 API 使用 | `/settings/account` | `settings.account.apiAccess.access`（业务 API 仍按目标 resource 授权） |
| 设置 | `/settings` | 登录 |
| 智能助手 | `/api/agent` | 登录，权限随用户 |
| 外部关系 | `/external` | `external.access` |
| 文档中心 | `/docs` | `docs.access` |
| 资料库 | `/library` | `library.access` |
| 财务数据 | `/finance` | `finance.access` |
| 成本管理 | `/finance/cost` | `finance.access` 或 `finance.cost.access` |

## 10. 认证与 API 权限

认证方式：

1. 网页版：Cookie JWT (`token`)
2. 内部 API：`/api/modules/**` 使用 Cookie 会话 + RBAC `authorize()` 或平台 wrapper。
3. 外部 Open API：`/api/open/v1/**` 使用 `Authorization: Bearer <OpenApiClient secret>` + `OpenApiScope` grant，不读取内部 RBAC `Resource`。
4. 权限校验：优先使用 `@workspace/platform/server/auth` 中的平台契约；旧 `lib/auth.ts` 聚合 hub 已删除，不要恢复同类兼容入口。

API 权限规则：

- 页面按钮隐藏不是安全边界，所有写入和删除必须在 API 层校验。
- GET 使用 `access`；POST/PUT/PATCH 使用 `write`；DELETE 使用 `delete`；授权使用对应资源的 `admin`，系统配置仅内置 root admin 可操作。
- 新 API route 只允许做四件事：认证、Zod 参数校验、调用 service、返回 DTO；写入必须继续进入 domain validator 和 service。
- 复杂查询、导入、汇总、派生字段计算必须放到 `packages/<domain>/server/`；旧 `server/services/<domain>/` 只作为存量兼容位置。
- 旧兼容 API 可以保留代理，但新功能必须走领域入口，例如 HR 新接口走 `app/api/modules/hr/roster/*`，财务成本走 `app/api/modules/finance/cost/*`。
- 需要对外开放的新接口必须走 `packages/platform/open-api-registry.ts` 注册，并放在 `/api/open/v1/**`，不得直接暴露内部 `/api/modules/**`。

## 11. 业务规则

### 公司分组

- 公司事实来源：公司名称、编码、管理体系、查询分组、共享编码池等来自 `Company` 表；seed/migration 只负责初始化事实数据。
- 查询封装：公司相关判断必须通过领域 service/helper 从 DB 派生，禁止在调用方复制公司映射、分组数组或特殊判断。
- 通用框架约束：公司专有事实禁止硬编码在 `app/`、`server/`、`lib/`、`scripts/` 中，包括具体公司名、公司编码、管理体系、查询分组、共享编码池、特殊公司判断。此类信息必须来自 `Company` 表或 seed/migration 的输入数据，业务代码只允许通过领域 service/helper 查询和派生。

### 编码规则

- 部门：L1=`前缀001`，L2=`前缀100/200`，L3=`前缀101`
- 岗位：`GW-{dept}-{seq}`，GMP 岗位带 `PPA-` 前缀

## 12. 前端规范

共享组件必须使用，禁止重复造轮子：

| 组件 | 用途 | 导入 |
|------|------|------|
| `ConfirmModal` | 确认弹框 | `@workspace/core/ui` |
| `DetailModal` | 通用详情弹窗 | `@workspace/core/ui` |
| `EditToolbar` | 编辑工具栏，编辑、保存、取消、版本 | `@workspace/core/ui` |
| `Toast` + `useToast` | 通知提示 | `@workspace/core/ui` + `@workspace/core/hooks` |
| `FilterBar` | 筛选栏容器 | `@workspace/core/ui` |
| `AppShell` / `ModuleHome` | 登录后页面壳和模块首页 | `@workspace/platform/ui` |

规范：

- 确认弹框用 `<ConfirmModal>`，禁止 `window.confirm`。
- 下拉、筛选、日期、tag、表格、页面模板的完整复用规则见 `docs/reusable-components.md`。
- 业务包和页面不能手写原生 `<select>`、浏览器默认日期输入或一次性搜索框；必须使用 Core 组件或基于 Core 的 App 字段组件。
- 选择面板和字段展示必须解耦。字段展示保持统一样式；选择面板可以是普通下拉、分级选择、FK 搜索、tag 选择。
- 通知用 `useToast()`，禁止裸 `setTimeout`。
- 公司名、编码、管理体系通过 API 或领域 service/helper 获取，禁止硬编码。
- API 鉴权优先走 `@workspace/platform/server/auth`；旧 `lib/auth.ts` 聚合 hub 已删除，不要恢复同类兼容入口。
- 搜索优先用 `@workspace/core/search` 的通用匹配；业务语义搜索留在对应业务包。
- 当前用户类型从 `@workspace/platform/types` 导入 `SessionUser`，禁止页面内重复定义 `interface User`。
- 业务页面 facade 负责组合，不承载大段业务逻辑；超过 150 行应拆 components/hooks。
- 组件或 hook 不超过 220 行，API route 不超过 120 行，service 不超过 260 行。
- 新业务模块必须有 `types.ts`、必要 hooks/components，以及 `ARCHITECTURE.md`。
- 禁止在页面里直接堆 fetch、权限判断、复杂映射和计算；这些应分别下沉到 hook、API/service、权限 helper。

## 13. Package 契约速查

| 模块 | 用途 | 关键导出 |
|------|------|----------|
| `@workspace/core/ui` | 通用 UI | 确认弹框、Toast、表格、筛选、字段、日期、状态、金额/数字单元格 |
| `@workspace/core/hooks` | 通用 hook | `useCSV`、`useToast` |
| `@workspace/core/routing` | 路由 helper | `workspacePath` |
| `@workspace/core/search` | 通用搜索 | 拼音首字母、全拼和文本匹配 |
| `@workspace/platform/ui` | 平台壳 UI | `AppShell`、`ModuleHome`、`PortalClient`、`UserMenu`、审计日志 UI |
| `@workspace/platform/types` | 平台类型 | `SessionUser`，全站统一 |
| `@workspace/platform/server/auth` | 认证鉴权 | `authenticate`、`authorize`、`requireAuthorized` 和已委托 `authorize()` 的领域 wrapper；新代码不要直接调用 `checkPermission` |
| `@workspace/platform/server/prisma` | 数据库 | 单库 Prisma runtime client |
| `@workspace/platform/server/history` | 审计 | `snapshotHistory` |
| `@workspace/platform/server/crud-factory` | 通用 CRUD 工厂 | 业务包通过本领域 wrapper 复用 |
| `@workspace/platform/server/resolve-fk` | FK 展示名 | 审计和 DTO 中的 FK 快照显示名解析 |
| `@workspace/hr/server` | HR 业务服务 | HR 查询、保存、导入、校验、DTO |
| `@workspace/hr/ui` | HR UI | 员工资料、部门岗位、项目资料等 HR 页面组件 |
| `@workspace/work/server` | Work 业务服务 | 工作计划、项目管理、工作汇报和目标权限 |
| `@workspace/production` | 生产包 | 生产/QC 模块注册、类型和后续 UI/server |
| `@workspace/finance` | 财务包 | 财务模块注册、类型和后续 UI/server |
| `lib/security.ts` | 登录安全 | `checkBruteForce`, `recordAttempt` |
| `@workspace/platform/permissions` | RBAC 常量 | `RES`, `ROLE`, `ACTION`, `normalizeRoleKey` |
| `@workspace/core/period` | 周期计算 | `getCurrentPeriod`, `getPeriodRange`, `getPeriodOptions`, `PeriodType` |

`lib/*` 中的旧 runtime 入口只用于兼容存量代码，新代码不要直接依赖；业务包必须通过 Platform server 契约或本包 service 访问。

## 14. 硬约束

交付前按风险运行：

```bash
npm run arch:gate
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

提交规则：

- 每次完成一个独立任务后要提交 commit。
- commit 前先看 `git status`，不要把无关文件、`.env`、数据库、`.DS_Store`、临时 planning 文件提交进去。
- 已有用户或其他 agent 的改动不得回滚；如需跨任务整理，单独开治理任务。
- 修改架构、schema、权限、导入流程时，必须同步更新 README、AGENTS/docs 或对应 `ARCHITECTURE.md`。
