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

## 授权对象（3 类统一）

| 类型 | subjectType | 说明 |
|------|-------------|------|
| 员工 | `user` | 直接授权到个人 |
| 岗位 | `position` | 该岗位下所有人自动继承 |
| 部门 | `department` | 该部门下所有人自动继承 |

优先级：直接授权 > 岗位继承 > 部门继承。`system.admin` 额外有 bypass 开关。

## 资源树（39 个）

```
system              admin   系统管理
  system.user       admin   用户管理
  system.permission admin   权限管理
  system.audit      admin   审计日志
  system.config     admin   系统配置

people              admin   人事管理
  people.roster     admin   人事基础资料
  people.performance admin  考勤绩效
  people.analytics  admin   人力分析

finance             admin   财务管理
  finance.ledger    admin   总账基础
  finance.statement admin   财务报表
  finance.budget    admin   预算管理
  finance.analysis  admin   财务分析
  finance.cost      admin   成本管理
  finance.import    admin   数据导入

administration      admin   行政管理
  administration.contract admin 合同台账

production          admin   生产管理
  production.inventory admin 库存管理

docs                access  文档中心
  docs.positions    access  岗位说明书
  docs.company      access  公司管理
  docs.expense      access  报销规范
  docs.api          access  API 接入指南

library             access  资料库

external            delete  外部关系
  external.investor delete  投资人关系
  external.customer delete  客户管理
  external.supplier delete  供应商管理

work                admin   工作
  work.task         admin   工作清单
  work.report       admin   工作汇报

legal               access  法务
  legal.chat        access  法务咨询
  legal.document    access  法律文书
```

每行末尾是该资源的 `maxRoleKey`（可授予的最高角色）。

## Resource.maxRoleKey

DB 字段 `Resource.maxRoleKey` 限制该资源能授予的最高角色：

| maxRoleKey | 可授予 |
|-----------|--------|
| `access` | 仅访问 |
| `write` | 访问、编辑 |
| `delete` | 访问、编辑、删除 |
| `admin` | 访问、编辑、删除、管理 |

- 子资源受**父资源有效上限**约束（沿 DB `parentId` 链取最严）。
- `system` 的 `maxRoleKey` 锁定 `admin`，不可降级。
- 只有 `system.admin` 可修改 `maxRoleKey`。
- 运行时 `checkPermission` 会拒绝超过 `maxRoleKey` 的 grant。

## system.admin 与业务权限

### systemAdminBusinessBypass 开关

存储在 `SystemConfig` 表，key=`systemAdminBusinessBypass`，默认 `true`。

| 开关 | system.admin 行为 |
|------|------------------|
| ON（默认） | 对所有业务资源拥有 access/write/delete/admin |
| OFF | 只保证进入 `/admin`；业务模块需单独授权 |

### 始终保留

- `system.*` 资源不受开关影响（管理员始终能管理系统后台）。
- `/admin`、权限矩阵、用户管理、系统配置始终可进入。
- `system.admin` 不可被 `maxRoleKey` 降级。

## 权限判断流程

```
checkPermission(userId, resourceKey, roleKey)
  → isSystemAdminBypassEnabled()?
    → ON + 业务资源 → return true
    → ON/OFF + system.* → return true
  → DB 查 Resource
  → maxRoleKey 运行时截断（超过上限 → false）
  → resolveRoleKeys(roleKey): admin→[admin,delete,write,access], delete→[admin,delete], ...
  → 查 UserResourceRole（直接授权）
  → 查 PositionResourceRole（岗位继承）
  → 查 DepartmentResourceRole（部门继承）
  → 找到 → true，否则 false
```

## 表结构（当前）

```prisma
model Resource {
  id              Int     @id
  key             String  @unique   // "people.roster"
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
```

## 后台矩阵 UI

- 左侧：资源树 + 最高权限选择器（仅 system.admin 可见）
- 顶部：员工 / 岗位 / 部门切换
- 筛选：部门层级 + 姓名搜索
- 列：访问 / 编辑 / 删除 / 管理 / 最高权限
- 超过 maxRoleKey 的列显示灰色 `—`
- 支持 scoped 资源（如 `work.report`）的范围选择器

## Scoped 权限（Batch 5 / 5.1）

部分资源（当前仅 `work.report`）需要将权限限定到具体数据范围，而不仅仅是资源级。例如"编辑销售部的工作汇报"而非"编辑所有工作汇报"。

### scopeId 格式

| scopeId | 含义 | UI 暴露 |
|---------|------|---------|
| `null` | 全局（适用于该资源的所有数据） | ✓ 全部 |
| `department:<id>` | 限定到某个部门的汇报 | ✓ 按部门 |
| `project:<id>` | 限定到某个项目的汇报 | ✓ 按项目 |
| `user:<id>` | 限定到某个用户的个人汇报 | 后端预留 |

### 判断逻辑

`checkScopedPermission(userId, resourceKey, roleKey, scopeId)`：

1. system.admin bypass（受 Batch 4 开关控制）
2. maxRoleKey 运行时截断
3. 查询 grant 时同时匹配 `scopeId IS NULL`（全局）或精确 `scopeId`
4. 用户 → 岗位 → 部门 三维度统一检查

### 隐式规则

- 个人汇报（`user:<id>`）：当 `userId === id` 时，用户对本人的个人汇报有隐式 access/write 权限，无需额外授权。
- 部门/项目汇报：必须通过 scoped grant 显式授权。

### 目标选择器

`getUserTargets()` 合并两类目标：
1. 成员制目标：用户所在部门、项目、岗位
2. Scoped 授权目标：从 `work.report` grant 的 `scopeId` 解析出的 `department:<id>` 和 `project:<id>`
3. 隐式目标：`user:<userId>`（本人的个人汇报）

TargetSwitcher 显示 `按部门 / 按项目 / 按岗位`；`user:<id>` 后端预留，不在 UI 暴露。

### 后台 UI

进入 `work.report` 时，矩阵上方显示范围选择器：

```
权限范围：○ 全部  ○ 按部门  ○ 按项目
```

- **全部**：管理全局授权（scopeId=null）
- **按部门**：选择目标部门，管理该部门的 scoped 授权
- **按项目**：选择目标项目，管理该项目的 scoped 授权
- 未选择具体部门/项目时矩阵禁用，防止误授全局权限

授权对象（员工/岗位/部门）不变，范围控制的是"被访问的汇报数据"，行控制的是"谁被授权"。

### system.admin 矩阵显示

`computePermissionState` 受 `systemAdminBusinessBypass` 开关影响：
- ON：system.admin 在业务资源矩阵中显示全有
- OFF：system.admin 仅在 `system.*` 资源显示全有，业务资源走正常 grant 检查

### 权限边界

- **work.report** vs **work.task**：工作汇报和工作清单是独立资源。
  - 汇报 API 使用 `work.report` scoped 权限（scope 支持 `null` / `department:<id>` / `project:<id>`）。
  - 工作清单 API 暂未 scoped：当前保留成员制（自己部门）或全局 `work.task.access`。scoped `work.task` 待后续批次实现。
- workItem 导入：无 `work.task.access` 或被成员制拒绝时，导入列表为空；历史 report item 只显示快照文本。

### API 影响

- `GET /api/reports`：逐个校验 targetIds，响应含 `deniedTargetIds`（部分拒绝时）
- `POST /api/reports`：使用 resolved `finalTargetType/finalTargetId` 做校验和创建
- `GET /api/admin/permission-grants?scopeId=department:12`：按 scope 筛选 grant
- `PUT /api/admin/permission-grants`：body 新增 `scopeId` 字段
- `GET /api/admin/permission-grants`：响应新增 `systemAdminBusinessBypass`

## 版本历史

- v2026-05 Batch 5.1: getUserTargets 合并 scoped 目标、项目 scope、矩阵 bypass 显示、scope 未选防误授、work.task 边界、deniedTargetIds。
- v2026-05 Batch 5: Scoped 权限。checkScopedPermission、scopeId 过滤、后台范围选择器、API scoped 校验。
- v2026-05 Batch 1-4: Resource.maxRoleKey、DB parent 链、运行时上限、systemAdminBusinessBypass 开关、员工/岗位/部门统一授权。
- v2025-05: RBAC 基础模型上线。Resource/Role/UserResourceRole 三表。
