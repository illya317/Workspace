# Workspace 模块边界

Workspace 采用 `Core -> Platform -> Apps` 三层多包结构。短期仍是一个 Next.js 应用和一个部署单元，先把代码所有权、注册入口和依赖方向拆清楚。

这份边界是当前改造方向，不是未来备忘。后续 agent 继续开发时，必须默认项目已经进入包化迁移阶段：能进入 `packages/core`、`packages/platform`、`packages/<domain>` 的新代码，不要再按旧模式塞回 `app/components`、`app/lib`、`lib` 或 `server/services`。旧目录保留是为了 Next 路由、兼容 re-export 和渐进迁移，不代表它们仍是新业务实现位置。

## 包边界

| 包 | 层级 | 责任 | 禁止 |
|---|---|---|---|
| `@workspace/core` | 底座 | 通用类型、模块注册契约、通用 UI/表格/筛选/搜索/分页/PageShell/表单组件 | 依赖平台、业务包、Prisma、权限、业务事实 |
| `@workspace/platform` | 主体 | 登录后平台壳、模块聚合、导航、权限资源注册、审计和用户等平台能力 | 直接依赖某个业务页面或业务 service |
| `@workspace/hr` | 业务 | HR 模块注册、HR UI/server/import/types/constants 的归属入口 | 直接依赖财务或生产 |
| `@workspace/production` | 业务 | 生产/QC 模块注册、生产 UI/server/import/types/constants 的归属入口 | 直接依赖 HR 或财务 |
| `@workspace/finance` | 业务 | 财务模块注册、财务 UI/server/import/types/constants 的归属入口 | 直接依赖 HR 或生产 |
| `@workspace/work` | 业务 | 工作管理：项目、工作清单、工作汇报、历史记录 | 直接依赖 HR、Finance、Production、Administration、Library |
| `@workspace/administration` | 业务 | 行政管理：合同台账等行政能力 | 直接依赖其他业务包 |
| `@workspace/library` | 业务 | 资料库、资料检索、尽调问卷、生成资料 | 直接依赖其他业务包 |

## 当前落地状态

- `packages/core/module-contract.ts` 定义模块注册、资源注册和 API guard 的契约。
- `packages/core/ui` 已接收第一批纯通用 UI：PageShell、确认弹窗、确认上下文、详情弹窗、筛选栏、搜索输入、Toast、日期选择、通用下拉、字段和值筛选、分页、状态徽标/切换、数字/金额单元格、列显隐、TabBar、DataTable、编辑工具条。二段式筛选统一由 `FieldValueFilter` 承载。
- `docs/reusable-components.md` 是 Core/Platform/App 组件复用清单。下拉、搜索、筛选、日期、确认弹窗、tag、表格和页面模板必须先查这个文档；业务包不能绕开 Core/Platform 重复造通用控件。
- `packages/core/hooks/useToast.ts` 已接收通用 Toast hook。
- `packages/hr`、`packages/production`、`packages/finance` 各自导出本领域 `WorkspacePackageRegistration`。
- `packages/hr`、`packages/production`、`packages/finance` 已建立 `ui/server/types/constants/import` 样板入口，后续迁移按这些目录落位。
- `packages/hr/types` 已接收 HR 通用类型、员工详情 DTO、编码表类型。
- `packages/hr/constants` 已接收 HR 人力分析维度常量、员工详情字段配置、学校库、HR 字段选项和批量表格 Tab 配置。
- `packages/hr/utils` 已接收员工身份字段格式化/校验和部门路径格式化 helper。
- `packages/hr/ui` 已接收 HR 合同分析、编码表、批量表 hook、农历生日 helper、HR 专用字段/选择组件、HR 批量表工具栏，以及员工资料、员工详情、部门岗位、项目资料等第一批 HR UI 页面组件。
- `packages/hr/server` 已接收 HR autocomplete 与搜索配置、字段校验、创建参数 schema、公司、公司关系、部门、员工、雇佣、合同、EDP、项目、员工项目、名册、岗位、岗位说明书模板、员工详情聚合、员工合同/岗位/项目保存、员工历史记录和岗位说明书查询/保存 service。
- `packages/hr/server/search.ts` 已接收 HR 员工和 HR 主数据搜索语义。
- `packages/finance/ui` 已接收财务重分类配置视图及其局部组件、列配置。
- `packages/finance/ui` 已接收财务页面壳 `FinanceShell`、财务全域筛选模板 `FinanceFilters`、公司期间选择器 `CompanyPeriodPicker`、分页/重分类共享 UI 和财务子模块导航 helper；旧 `app/finance/components/*` 兼容出口已删除，页面直接消费 `@workspace/finance/ui`。
- `packages/finance/types` 已接收重分类配置 UI 的候选 DTO 类型；后续服务下沉时与 server DTO 合并。
- `packages/core/routing` 已接收 Workspace base path 拼接 helper，app 旧路径仅作兼容 re-export。
- `packages/core/search` 已接收通用拼音首字母、全拼和文本匹配 helper；员工语义匹配仍留在 HR/兼容层。
- `packages/production/types` 已接收生产 QC 模板、布局、批次和模板反馈领域类型。
- `packages/platform/module-registry.ts` 是模块注册锁。`registeredModuleDefinitions` 是唯一有效注册源；`packages/platform/modules.tsx` 只消费 registry 并导出运行时聚合，不直接 import domain package。
- `packages/platform/module-overrides.ts` 是模块运行态覆盖层。模块中文名、描述、隐藏和启停优先在这里改；不要为了展示 rename 去散改页面文案、resource name、API path 或 FK key。运行时消费方使用 effective registry，资源和 FK 使用 active registry 自动过滤 disabled 模块。
- `ResourceRegistration.parentKey` 只用于 RBAC 权限树继承；`runtimeParentKey` 只用于模块启停级联。不要为了让 disabled 级联而把独立权限挂进父资源树。像 `work.projects.viewAll` 这类不能继承父权限、但必须随项目模块失效的资源，应保持 `parentKey` 为空并设置 `runtimeParentKey: "work.projects"`。
- `packages/platform/module-nav.tsx` 生成 `MODULES`、`getAccessibleModules`、`getSubModules`。
- `packages/platform/resources.ts` 从各 package `resourceDefs` 派生 `RESOURCE_DEFS`、`RESOURCE_KEYS` 和 `RESOURCE_MAX_ROLE`，`packages/platform/permissions.ts` 与 `scripts/seed-resources.ts` 复用这个出口；旧 `lib/permissions.ts` 只保留兼容 re-export。
- `packages/platform/module-lifecycle.ts` 从模块注册的 `lifecycleStatus` 派生资源生命周期提示；`app/lib/module-lifecycle.ts` 保留兼容 re-export。
- `packages/platform/types` 已接收登录态平台契约类型，`lib/types.ts` 保留兼容 re-export。
- `packages/platform/audit` 已接收审计展示字段标签和值格式化 helper，`lib/audit-field-labels.ts` 保留兼容 re-export。
- `packages/platform/server/auth.ts` 已接收认证和权限检查的 server 契约；旧 `lib/auth.ts` 聚合 hub 与 root `server/auth` 已删除。业务包和 app route 需要鉴权时依赖 `@workspace/platform/server/auth`，不要新增 `@/lib/auth` 或 root `server/auth` 入口。
- `packages/platform/server/auth/authorize.ts` 是业务资源权限单入口；平台 auth helper、page guard 和 wrapper 必须委托 `authorize()`，新增 API route 不得新增裸 `checkPermission()`。内置 root admin 不属于 RBAC resource，必须走 `isRootAdminUser()`。
- `packages/platform/server/crud-factory.ts` 已接收通用 CRUD route helper；业务包需要复用字段级更新/创建/删除时通过本领域 wrapper 使用，不要直接依赖 `@/lib/crud`。
- `packages/platform/server/prisma.ts` 已接收单库 Prisma runtime client，`lib/prisma.ts` 已删除；业务包、server root 和 app route 需要数据库访问时必须依赖 `@workspace/platform/server/prisma`，不要直接依赖 `@/lib/prisma` 或 generated client。
- `packages/platform/server/history.ts` 已接收审计快照写入契约，`lib/history.ts` 保留兼容 re-export；业务包需要写 EditHistory 时依赖 `@workspace/platform/server/history`。
- `packages/platform/server/resolve-fk.ts` 已接收 FK 显示名解析契约，`lib/resolve-fk.ts` 保留兼容 re-export；审计日志和业务包需要展示 FK 快照时依赖 `@workspace/platform/server/resolve-fk`。
- `packages/hr/server/crud.ts` 已接收 HR 字段级 CRUD wrapper，统一注入 `hr.roster` 读写删除权限；HR server service 使用这个 wrapper 而不是 app-root `@/lib/crud`。
- `packages/platform/ui` 已接收登录后的 Portal、L1 模块首页、AppShell、跨页 NavLink、用户菜单、设置页和审计日志 UI；AppShell 必须复用 Core `PageShell`。根 `app/components/*` 与 `app/portal/PortalClient.tsx` 兼容出口已删除，route 直接挂载 Platform UI。
- `packages/administration` 已接收合同台账的 module、UI、server、types，`app/(modules)/administration/contracts/page.tsx` 和 `app/api/modules/administration/contracts/*` 只保留 Next 壳。
- `packages/library` 已接收资料库 module、UI、server、types，`app/(modules)/library/page.tsx` 和 `app/api/modules/library/basic-info/*` 只保留 Next 壳；旧 `server/services/library` 不再承载实现。
- 每个业务包的 `module.ts` 必须导出 `moduleDefinition`，同时保留领域兼容别名（例如 `financePackage`）。`moduleDefinition` 必须来自 `packages/platform/module-registry.ts` 的 `getRegisteredModuleDefinition("@workspace/<domain>")`；`npm run arch:gate` 会校验业务包导出、registry 注册和重复 module key。
- `packages/platform/ui/docs` 已接收文档中心和接入指南 UI；`app/(docs)/docs/*` 只保留鉴权/参数/挂载壳。
- `app/lib/module-nav.tsx` 是兼容出口，现有页面暂时继续从这里导入。
- `app/components/ConfirmModal.tsx`、`ConfirmProvider.tsx`、`DetailModal.tsx`、`FilterBar.tsx`、`FilterToolbar.tsx`、`Toast.tsx`、`SelectField.tsx`、`StatusBadge.tsx`、`StatusToggle.tsx`、`NumberCell.tsx`、`AmountCell.tsx`、`ColumnToggle.tsx`、`TabBar.tsx`、`DataTable.tsx`、`EditToolbar.tsx` 和 `app/hooks/useCSV.tsx`、`app/hooks/useToast.ts` 已降级为兼容 re-export。
- `app/hooks/useCompanyOptions.ts` 已降级为 `@workspace/platform/hooks` 的兼容 re-export。
- `app/hr/types.ts`、`app/hr/profile/types.ts`、`app/hr/tabConfigs.ts`、`app/hr/tab-configs/*`、`app/hr/profile/fields.ts`、`app/hr/profile/lunar-birthday.ts`、`app/hr/analytics/*`、`app/hr/profile/*`、第一批 `app/hr/components/*` HR 专用字段组件、`app/hr/code/*` 编码表实现和第一批 `app/hr/tabs/*` 大组件已迁入或降级为兼容 re-export。
- `app/api/modules/hr/roster/autocomplete`、`app/api/modules/hr/roster/companies`、`app/api/modules/hr/roster/company-relations`、`app/api/modules/hr/roster/contracts`、`app/api/modules/hr/roster/departments`、`app/api/modules/hr/roster/edps`、`app/api/modules/hr/roster/employees`、`app/api/modules/hr/roster/employee-profiles/*`、`app/api/modules/hr/roster/employments`、`app/api/modules/hr/roster/position-description-templates`、`app/api/modules/hr/roster/positions`、`app/api/modules/hr/roster` 和 `app/api/modules/hr/roster/position-descriptions` 已降级为认证/权限/响应壳，业务逻辑下沉到 `@workspace/hr/server`。
- 模块注册中的 `href` 与 `routes` 必须使用不带 basePath 的站内绝对路径，例如 `/hr/roster`；禁止写 `@workspace/...` package 名或 `/workspace/...`，这个规则由 `npm run arch:gate` 校验。
- `moduleDef.href` 必须是 L1 根路径；`children[*].href` 与 `routes` 必须留在该 L1 下。真实 app page 也必须落在注册 L1 或系统保留 route 下，不允许重新创建绕开 L1 的顶层 route shell。
- 页面源码使用 Next route groups 收口：业务页放 `app/(modules)/*`，平台/设置/管理放 `app/(system)/*`，登录放 `app/(auth)/*`，文档放 `app/(docs)/*`。这些 group 不改变 URL；不要再新增顶层 `app/<module>` 页面目录。

## 路由和服务迁移原则

- `app/(modules)/<domain>` 保留为 Next 路由壳，对外仍暴露 `/domain` URL。后续新增复杂 UI 时，优先放入对应 `packages/<domain>/ui` 后再由页面引用。
- `app/api/modules/<domain>` 保留为业务 API route 壳，只做认证、权限、参数校验、调用 package service、返回 DTO；不要新增一级业务 API 目录。
- 业务查询、导入、校验和计算必须优先进入 `packages/<domain>/server`。同一业务字段或业务动作存在多个写入入口时，必须在 `packages/<domain>/server/domain/*-validation.ts` 定义 domain command/validator，入口只做输入适配，service 只消费已验证 command。旧 `server/services/<domain>` 只作为存量兼容位置，不再作为新增业务 service 的默认落点。
- Prisma 仍使用单一 schema/client；`prisma/models/*.prisma` 继续按领域归属，不拆库。

## 依赖方向

```text
app/* route shell
  -> @workspace/platform
  -> @workspace/<domain>
  -> @workspace/core

@workspace/core
  -> no workspace package imports

@workspace/platform
  -> @workspace/core
  -> @workspace/hr | @workspace/production | @workspace/finance only through registration
  -> auth checks through packages/platform/server/auth.ts
  -> CRUD route helpers through packages/platform/server/crud-factory.ts
  -> generated Prisma client only through packages/platform/server/prisma.ts
  -> EditHistory snapshots through packages/platform/server/history.ts

@workspace/hr
@workspace/production
@workspace/finance
@workspace/work
@workspace/administration
@workspace/library
  -> @workspace/core
  -> platform contracts only when needed
```

`npm run arch:gate` 会先执行 Level 1.5 AST 扫描，再执行模块入口、资源注册、package 边界和 Level 1 检查，防止 Core 反向依赖平台或业务包，防止 Platform 直接 import 业务包实现，防止业务包之间直接互相引用，也防止 `packages/*` 反向 import `app/*` 路由壳或 app-root `lib/server/generated` runtime alias。它还会检查疑似重复基础组件文件名是否基于 Core/Platform 基建；新增例外必须写入脚本 allowlist。

Level 1/1.5 只有一个硬门禁入口：

- `npm run arch:gate`：串行执行 AST 硬扫描、dependency-cruiser DAG、模块注册锁、资源注册、package 边界和 auth/API 检查。新增 UI 库 import、新增 app 层 UI、替代权限函数、`if (user.role)`、新增 RBAC 表直查、业务包 `@/server/*` alias 绕过、跨业务包 import、循环依赖、未注册或重复 module key 都会立即 `exit 1`。历史债由 `scripts/arch/level15-baseline.json` 和 `scripts/check/level1-api-baseline.json` 锁定，只能减少，不能扩写。
- `scripts/arch/domain-validation.ts` 是唯一 gate 内的 domain validation 边界检查。第一批强制范围覆盖 HR roster 写服务：员工、雇佣、合同、员工详情合同/EDP、公司、公司关系、部门、岗位、EDP 和岗位说明书必须消费对应 `packages/hr/server/domain/*-validation.ts`，不得重新手写 FK、日期、枚举、百分比、直接上级、合同公司或归档/删除引用保护规则；相关 API route 不得直接或通过 `@workspace/hr/server` 间接 import domain validator。

`app/` 层是 routing only：

- 页面 route 可以做鉴权、必要预取和挂载 package component。
- API route 可以做认证、权限、参数校验、调用 package service 和返回 DTO。
- 新增 UI layout、filter、modal、form、table、toolbar、business rendering 都必须进入 `packages/platform/ui` 或对应 `packages/<domain>/ui`；旧 app UI 文件只作为 baseline 债务迁移，不能作为新增范式。

## Work Project 权限边界

- 模块启停优先于项目对象权限：`work` 或 `work.projects` disabled 后，项目入口、`/work/projects`、相关 API、FK 目标和 `work.projects.viewAll` 都必须统一失效。子项目不需要逐个配置 disable。
- `work.projects.access/write/delete` 是模块功能门禁，表示用户可以进入、发起或使用项目功能；它们不能被解释为查看全部项目、管理全部项目或删除全部项目。
- 项目对象权限由 `packages/work/server/access.ts` 计算：创建人、主导部门负责人、项目 RASCI 成员、显式 `work.projects.viewAll` 和 root admin 决定可见、可写、可管理、可删除。`editedBy` 是审计字段，不参与所有权和管理权判断。
- `work.projects.viewAll` 是独立资源，不使用 `parentKey: "work.projects"`，避免继承模块权限；它使用 `runtimeParentKey: "work.projects"`，保证模块 disabled 后一起失效。
- 项目 FK 候选过滤属于 Work 业务规则。`app/api/modules/work/projects/reference-options` 只做路由壳和权限壳，项目 FK 分支必须留在 `@workspace/work/server`。

## 后续拆分顺序

1. Core：逐步迁移通用字段输入、日期、FK 搜索、tag 输入、表格、筛选、确认弹窗。
2. Platform：继续收拢登录、权限、资源树、导航、审计、用户账号、Portal 和通用平台页面壳；新增资源必须先进入对应 package `resourceDefs`，再由 Platform 聚合。
3. HR：作为第一个完整样板，把 UI、server、import、types、constants 收到包边界内。
4. Production、Finance：按 HR 样板迁移。
5. 独立部署：只有当包边界稳定后再评估，不在当前阶段拆服务。
