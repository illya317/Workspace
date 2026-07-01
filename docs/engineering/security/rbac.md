# RBAC 权限模型

## 角色（4 级）

| 角色 | key | 含义 | 层级 |
|------|-----|------|------|
| 访问 | `access` | 查看数据、进入页面 | 0 |
| 编辑 | `write` | 新增、修改数据 | 1 |
| 删除 | `delete` | 删除数据 | 2 |
| 管理 | `admin` | 管理该资源及子资源的授权 | 3 |

层级继承：`admin` > `delete` > `write` > `access`

- `admin` 隐含 `delete/write/access`
- `delete` 隐含 `write/access`
- `write` 隐含 `access`

## 权限动作层（第一阶段）

权限管理后台新增动作层，用于先表达和保存更细的 ERP 权限语义；现有业务 guard 仍以 `access/write/delete/admin` 为准，直到具体资源在第二阶段显式映射。

| 分组 | 动作 | 继承语义 |
|------|------|----------|
| 基础权限 | `access`, `create`, `write`, `delete` | `delete > write > create > access` |
| 流程发起 | `submit`, `withdraw` | `submit` 隐含 `withdraw/create/access` |
| 流程审批 | `approve`, `reject` | `approve` 隐含 `reject/access`，不隐含 `submit/create` |
| 生命周期 | `archive`, `revise` | 独立生命周期动作；`revise` 隐含 `write/create/access` |
| 数据交换 | `import`, `export` | 独立高风险动作，均隐含 `access` |
| 管理 | `admin` | 授权管理权，隐含全部动作 |

新增动作授权写入 `UserResourceActionGrant`、`PositionResourceActionGrant`、`DepartmentResourceActionGrant`；旧四级动作继续写入 `Role` 和三张 `*ResourceRole` 表。后台 API 统一接受 `actionKey`，`roleKey` 仅作为旧调用兼容。

第一版 SoD 只做提示：同一对象在同一资源同时拥有 `submit` 和 `approve` 时，矩阵展示风险，不阻断保存。

## 授权对象（3 类统一）

| 类型 | subjectType | 说明 |
|------|-------------|------|
| 员工 | `user` | 直接授权到个人 |
| 岗位 | `position` | 该岗位下所有人自动继承 |
| 部门 | `department` | 该部门下所有人自动继承 |

优先级：直接授权 > 岗位继承 > 部门继承。内置 `admin` 账号是 root identity，不属于 RBAC 授权对象。

## 资源树

```
  settings            access  设置
  settings.account  access  账号与接入
  settings.admin    admin   系统管理
  settings.api      access  Open API 接入控制台

settings.account.apiAccess access 个人 API 使用（capability，runtimeParentKey=settings.account）
  settings.api.manage        write  Open API Client 管理（create/write/revise action，capability，runtimeParentKey=settings.api）

agent               access  智能体（headless）

hr                  admin   人事管理
  hr.roster     admin   人事基础资料
  hr.performance admin  考勤绩效
  hr.analytics  admin   人力分析

hr.roster.generated write 花名册生成资料（capability，runtimeParentKey=hr.roster）

finance             admin   财务管理
  finance.ledger    admin   总账基础
  finance.statements admin   财务报表
  finance.budget    admin   预算管理
  finance.analysis  admin   财务分析
  finance.cost      admin   成本管理
  finance.tax       admin   税务管理
  finance.treasury  admin   司库管理
  finance.import    admin   数据导入

administration      admin   行政管理
  administration.contracts admin 合同台账

production          admin   生产管理
  production.qc   admin 批次检验

docs                access  文档中心
  docs.company      access  公司管理
  docs.expense      access  报销规范
  docs.editor       access  模板编辑器

library              write   资料库
  library.basicInfo  write   基本资料

external            access  外部关系
  external.investors access  投资人关系
  external.customers access  客户管理
  external.suppliers access  供应商管理

work                admin   工作管理
  work.projects      admin   项目
  work.tasks         admin   工作计划

work.projects.createOrg write  创建组织级项目（独立资源，runtimeParentKey=work.projects）
work.projects.viewAll access 项目全局查看（独立资源，runtimeParentKey=work.projects）
```

每行末尾是该资源的 `maxRoleKey`（可授予的最高角色）。

## Resource.maxRoleKey（最高业务权限）

`maxRoleKey` 限制该资源能授予的**业务动作**上限（access/write/delete），**不限制 admin**。

| maxRoleKey | 可授予的业务动作 | admin |
|-----------|-----------------|-------|
| `access` | 仅访问 | ✓ 始终可授予 |
| `write` | 访问、编辑 | ✓ 始终可授予 |
| `delete` | 访问、编辑、删除 | ✓ 始终可授予 |

- admin = 授权管理权，不受业务动作上限限制。例如 `docs.maxRoleKey=access` 时，仍可授予 `docs.admin` 来管理资料库权限。
- 子资源受**父资源有效上限**约束（沿 DB `parentId` 链取最严）。
- 只有内置 root admin 可修改 `maxRoleKey`。
- 后台 UI 下拉改名为"最高业务权限"，仅含 访问/编辑/删除。

## 登录 vs 权限

登录只看 `User.canLogin`（账号启停用） + `sessionVersion`。**不看 `system.access`**。

`settings.account`、`settings.admin`、`settings.api` 都是标准 L2：页面 URL、resource key、RBAC 授权矩阵和 API contract 必须一一对应。内置默认规则只补有效权限：已登录用户默认拥有 `settings.account.access`、`work.projects.access`、`work.tasks.delete`、`docs.access`、`docs.editor.access`；默认 `work.projects.access` 只表示可进入项目功能和按对象级规则发起项目，不授予全量查看、全量管理或组织级项目创建；默认 `work.tasks.delete` 只表示可进入工作计划 API 并允许个人空间完成新增、编辑、删除这类本人数据操作，部门/项目/运营委员会空间仍由 Work 业务空间权限继续计算；默认 `docs.editor.access` 只表示可进入模板编辑器，具体个人/公共/部门模板空间仍由 Docs Editor 空间权限计算；拥有任意 active resource `admin` 的用户默认拥有 `settings.admin.access`。

`system.access` 已废弃，不作为登录/后台入口/授权管理的判断条件。需要进后台管理权限时，授予对应资源的 `admin` 角色（如 `hr.admin`），系统会计算出 `settings.admin.access` 作为后台入口权限。Session 仍暴露 `manageableResourceKeys[]`，用于限制进入后台后的可管理范围。

网页登录和企业微信登录允许多端共存；登录不会递增 `sessionVersion`。改密码、管理员重置密码或账号停用会让旧会话失效。JWT 和 Cookie 默认有效期为 30 天。

## Open API 权限边界

外部开放 API 不使用内部 RBAC `Resource`。`settings.api.access` 控制 `/settings/api` 管理台读取；创建 Client 还必须授予 `settings.api.manage.create`，轮换 secret 还必须授予 `settings.api.manage.revise`，更新 scope 还必须授予 `settings.api.manage.write`。个人 API Key 使用能力归属 `settings.account.apiAccess.access`，轮换个人 Key 还必须授予 `settings.account.apiAccess.revise`，与 `settings.api` 控制台权限分离。真正的外部调用只看 `OpenApiClient`、`OpenApiScope` 和 `OpenApiClientScopeGrant`。

- 调用方使用 `Authorization: Bearer <secret>`，secret 只存 hash。
- Scope 例如 `hr.generated.roster.read`，资源组例如 `hr.generated.roster`，均写入 Open API 专用表。
- `runtimeParentResourceKey` 例如 `hr.roster` 只检查模块是否启用，不做授权继承。
- `/api/open/v1/**` 禁止调用 `authorize()`、`withAuth()` 或读取 `visibleResourceKeys`。

## 内置 root admin

`username = "admin"` 的内置账号是 root identity，用于初始化、应急维护和系统配置。它不获得任何 RBAC resource，不进入用户/岗位/部门授权矩阵，也不能通过普通 RBAC mutation 被授权或取消授权。

- root admin 在 auth/session 层设置 `isSuperAdmin = true`。
- root admin 可绕过 RBAC 检查访问所有已启用资源；模块 disabled 仍优先生效。
- 普通自然人管理员只通过具体资源的 `admin` 角色获得授权管理能力，例如 `settings.admin.admin` 或 `work.projects.admin`；任意资源 `admin` 会默认获得 `settings.admin.access` 以进入管理后台。

## 权限判断流程

```
checkPermission(userId, resourceKey, roleKey)
  → isRootAdminUser(userId)?
    → true
  → capability?
    → owner L1/L2 未授权或已禁用 → false
  → DB 查 Resource
  → maxRoleKey 运行时截断（超过上限 → false）
  → resolveRoleKeys(roleKey): admin→[admin,delete,write,access], delete→[admin,delete], ...
  → 查 UserResourceRole（直接授权）
  → 查 PositionResourceRole（岗位继承）
  → 查 DepartmentResourceRole（部门继承）
  → 找到 → true，否则 false
```

## Resource Action Policy

新权限动作的资源映射由 `@workspace/platform/permission-resource-policy` 维护。该 catalog 只说明某个 `resourceKey` 支持哪些 action、哪些 action 可以从祖先资源继承、哪些高风险 action 必须在当前资源或 capability 上显式授权。

页面和 API 的实际授权分两层执行：

- `packages/platform/module-registry.ts` 继续登记 API 前缀、`resourceKey` 和旧四级基础动作。`api-registry` 会把它解析成 `baseAction`，例如 `GET -> access`、`POST/PUT/PATCH -> write`、`DELETE -> delete`。
- `@workspace/platform/permission-api-action-policy` 是 API 新动作注册表，只登记需要覆盖默认基础动作或需要额外业务动作的端点。`api-registry` 会把它解析成 `additionalAction`，例如导入是 `import`、QC 提交是 `submit`、审批确认是 `approve`、归档/恢复/导出是 `archive/revise/export`。

`requireApiAccess()` 先检查 `baseAction`，再检查 `additionalAction`。route 文件不得直接调用 `evaluatePermissionAction()`；新增动作必须先出现在 `permission-resource-policy` 的 resource 支持清单中，再在 `permission-api-action-policy` 登记 API 端点，由 gate 统一校验。普通请求形状仍在 route 的 Zod schema 处理，业务可写字段、状态、FK、归属和跨字段规则仍按 `Zod -> domain validator -> service/Prisma` 链路处理。

## 表结构（当前）

```prisma
model Resource {
  id              Int     @id
  key             String  @unique   // "hr.roster"
  name            String            // "人事基础资料"
  parentId        Int?              // DB 父级链
  maxRoleKey      String  @default("admin")
}

model Role {
  id   Int    @id
  key  String @unique   // "access" | "write" | "delete" | "admin"
  name String            // "可进入" | "编辑" | "可删除" | "管理"
}

model UserResourceRole {
  userId     Int
  resourceId Int
  roleId     Int
  scopeId    String?
  @@unique([userId, resourceId, roleId, scopeId])
}

model PositionResourceRole {
  positionId Int
  resourceId Int
  roleId     Int
  scopeId    String?
  @@unique([positionId, resourceId, roleId, scopeId])
}

model DepartmentResourceRole {
  departmentId Int
  resourceId   Int
  roleId       Int
  scopeId      String?
  @@unique([departmentId, resourceId, roleId, scopeId])
}

model UserResourceActionGrant {
  userId     Int
  resourceId Int
  actionKey  String
  scopeId    String?
  @@unique([userId, resourceId, actionKey, scopeId])
}

model PositionResourceActionGrant {
  positionId Int
  resourceId Int
  actionKey  String
  scopeId    String?
  @@unique([positionId, resourceId, actionKey, scopeId])
}

model DepartmentResourceActionGrant {
  departmentId Int
  resourceId   Int
  actionKey    String
  scopeId      String?
  @@unique([departmentId, resourceId, actionKey, scopeId])
}
```

## 后台矩阵 UI

- 左侧：资源树；最高业务权限在资源级工具栏维护（仅内置 root admin 可见）
- 顶部：员工 / 岗位 / 部门切换
- 筛选：部门层级 + 姓名搜索
- 列：授权对象 / 基础权限 / 流程权限 / 生命周期 / 数据交换 / 管理 / 风险 / 展开
- 行：收起态显示 summary；展开态显示动作树、来源、隐含关系和 SoD 提示
- 超过 maxRoleKey 的列显示灰色 `—`

## 工作模块数据权限（业务规则）

工作模块（汇报/工作计划）的数据访问不走 scope RBAC，改用业务规则 + 指派表。

模块 disabled 优先于所有业务对象权限：`work` disabled 后 `/work` 及子页面、`/api/modules/work/*`、Work FK 目标和 Work 资源均不可用；`work.projects` disabled 后项目入口、项目页面、项目 API、项目 FK 和 `work.projects.viewAll` 一起失效。

### 项目资料（/work/projects）

项目资料使用对象级权限，不使用模块权限放大全量项目范围。`work.projects.access` 只表示可以进入项目功能和发起普通项目；`work.projects.write` 不再作为组织级项目创建开关。运营委员会项目创建必须显式授予 `work.projects.createOrg.write`，部门项目创建由目标部门负责人自然权限控制。查看全部项目必须显式授予 `work.projects.viewAll`，root admin 例外。

| 能力 | 来源 |
|------|------|
| 可查看 | 创建人、主导部门负责人、项目 RASCI 成员、`work.projects.viewAll`、root admin |
| 可编辑内容 | 可管理者、项目执行负责/支持协作等编辑角色、root admin |
| 可管理 | 创建人、主导部门负责人、项目负责人/负责人、root admin |
| 可删除 | 创建人、主导部门负责人、项目负责人/负责人 |
| 创建普通项目 | 在职员工 + `work.projects.access` |
| 创建部门项目 | 目标部门负责人或 root admin |
| 创建运营委员会项目 | 显式 `work.projects.createOrg.write` 或 root admin |
| 查看全部 | 显式 `work.projects.viewAll` 或 root admin |

`editedBy` 仅用于审计最近编辑人，不代表项目所有权、管理权或可见性。`work.projects.viewAll` 和 `work.projects.createOrg` 不设置 `parentKey`，避免继承 `work.projects` 模块权限；它们通过 `runtimeParentKey: "work.projects"` 随项目模块启停。

### 规则

| 场景 | 可查看 | 可编辑 |
|------|--------|--------|
| 本人个人工作计划 | 本人 | 本人 |
| 部门工作计划 | 本部门成员 | 部门指派人（DepartmentWorkAssignee） |
| 项目工作计划 | 本项目成员 | 项目指派人（ProjectWorkAssignee） |
| 全局 | `work.admin` | `work.admin` |

### 指派表

```
DepartmentWorkAssignee(departmentId, userId, kind: "task")
ProjectWorkAssignee(projectId, userId, kind: "task")
```

指派表是业务配置，不在权限矩阵中管理。指派人配置放在人事行政/项目管理页面。

### RBAC 仅保留粗粒度

```
work.tasks.delete  → 默认工作计划入口和本人个人空间操作
work.tasks.admin   → 管理所有工作计划
```

权限矩阵中 `work.tasks` 的访问、编辑、删除列可来自默认规则；直接、岗位、部门授权仍作为额外来源叠加显示。
数据访问（谁能看/写某个部门或项目）由业务规则决定：成员关系 + 指派人表。
不再对每个部门/项目做 scope 授权。

## 版本历史

- v2026-05 Batch 5.1: getUserTargets 合并 scoped 目标、项目 scope、矩阵 bypass 显示、scope 未选防误授、work.tasks 边界、deniedTargetIds。
- v2026-05 Batch 5: Scoped 权限。checkScopedPermission、scopeId 过滤、后台范围选择器、API scoped 校验。
- v2026-05 Batch 1-4: Resource.maxRoleKey、DB parent 链、运行时上限、员工/岗位/部门统一授权。
- v2025-05: RBAC 基础模型上线。Resource/Role/UserResourceRole 三表。
