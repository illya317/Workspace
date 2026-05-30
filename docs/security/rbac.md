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

## 工作模块数据权限（业务规则）

工作模块（汇报/清单）的数据访问不走 scope RBAC，改用业务规则 + 指派表。

### 规则

| 场景 | 可查看 | 可编辑 |
|------|--------|--------|
| 本人个人汇报/清单 | 本人 | 本人 |
| 部门汇报/清单 | 本部门成员 | 部门指派人（DepartmentWorkAssignee） |
| 项目汇报/清单 | 本项目成员 | 项目指派人（ProjectWorkAssignee） |
| 全局 | `work.admin` | `work.admin` |

### 指派表

```
DepartmentWorkAssignee(departmentId, userId, kind: "task"|"report")
ProjectWorkAssignee(projectId, userId, kind: "task"|"report")
```

指派表是业务配置，不在权限矩阵中管理。指派人配置放在人事行政/项目管理页面。

### RBAC 仅保留粗粒度

```
work.access      → 进入工作模块
work.task.admin  → 管理所有工作清单
work.report.admin → 管理所有工作汇报
```

不再对每个部门/项目做 scope 授权。

## 版本历史

- v2026-05 Batch 5.1: getUserTargets 合并 scoped 目标、项目 scope、矩阵 bypass 显示、scope 未选防误授、work.task 边界、deniedTargetIds。
- v2026-05 Batch 5: Scoped 权限。checkScopedPermission、scopeId 过滤、后台范围选择器、API scoped 校验。
- v2026-05 Batch 1-4: Resource.maxRoleKey、DB parent 链、运行时上限、systemAdminBusinessBypass 开关、员工/岗位/部门统一授权。
- v2025-05: RBAC 基础模型上线。Resource/Role/UserResourceRole 三表。
