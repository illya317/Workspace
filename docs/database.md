# 数据库表说明

共 19 张表，按业务模块分组。

---

## 1. 用户与认证

### User
系统登录用户表。

| 字段 | 说明 |
|------|------|
| wxUserId | 微信用户ID，唯一 |
| username/password | 账号密码登录（可选） |
| name | 用户姓名 |
| company | 所属公司 |
| departmentId/departmentName | 所属部门 |
| isWorkListAdmin | 超级管理员，可进 `/admin` |
| canAccessHR | 人事行政权限，可进 `/hr` |
| canAccessWorks | 工作清单权限 |
| canSelectAnyWeek | 可补填任意周报 |
| employeeId | 关联的员工编号 |
| canLogin | 是否允许登录 |
| apiKey | 个人 API Key |

---

## 2. 周报模块

### ReportGroup
周报分组（部门/项目组）。

| 字段 | 说明 |
|------|------|
| name | 分组名称 |
| description | 描述 |
| sortOrder | 排序 |
| departmentId | 关联的部门（可选） |

### ReportGroupAdmin
周报分组管理员（谁负责管理这个分组）。

| 字段 | 说明 |
|------|------|
| reportGroupId | 分组ID |
| userId | 用户ID |

### ReportGroupMember
周报分组成员（谁需要在这个分组下写周报）。

| 字段 | 说明 |
|------|------|
| reportGroupId | 分组ID |
| userId | 用户ID |

### ReportGroupViewer
周报分组查看者（可以看这个分组的周报，但不用写）。

| 字段 | 说明 |
|------|------|
| reportGroupId | 分组ID |
| userId | 用户ID |

### WeeklyReport
周报主表。

| 字段 | 说明 |
|------|------|
| userId | 填写人 |
| reportGroupId | 所属分组 |
| weekNumber | 周数（1-52） |
| year | 年份 |
| periodType | 周期类型（weekly） |
| scopeType/scopeId | 作用域 |
| taskName | 任务名称 |
| notes | 备注 |
| version | 版本号 |

### ReportItem
周报条目明细。

| 字段 | 说明 |
|------|------|
| reportId | 所属周报 |
| category | 分类 |
| plan | 计划内容 |
| completion | 完成情况 |
| nextGoal | 下一步目标 |
| sortOrder | 排序 |
| workItemId | 关联工作清单 |

### ReportHistory
周报修改历史（每次保存生成一个新版本）。

| 字段 | 说明 |
|------|------|
| reportId | 所属周报 |
| version | 版本号 |
| taskName | 当时的任务名 |
| notes | 当时的备注 |
| itemsJson | 当时的条目（JSON） |

---

## 3. 工作清单模块

### WorkItem
工作清单条目。

| 字段 | 说明 |
|------|------|
| departmentId | 所属部门 |
| category | 分类 |
| content | 工作内容 |
| importance | 重要度（1-5） |
| urgency | 紧急度（1-5） |
| isArchived | 是否归档 |
| sortOrder | 排序 |

### WorkParticipant
工作参与人。

| 字段 | 说明 |
|------|------|
| workItemId | 所属工作 |
| name | 参与人姓名 |
| wxUserId | 参与人微信ID |

---

## 4. 人事行政模块（HR）

### Employee
员工基础信息表（1人1条，去重）。

| 字段 | 说明 |
|------|------|
| employeeId | 业务编号（如 00108），唯一 |
| name | 姓名 |
| alias | 别名 |
| gender/ethnicity/hometown/politics | 性别/民族/籍贯/政治面貌 |
| education/title/school/major/majorRelevant | 学历/职称/院校/专业 |
| phone | 电话 |
| office1/office2/office3 | 办公区 |
| attendance1/attendance2 | 考勤信息 |
| joinDate | 进司时间 |
| nature | 性质 |
| status | 状态（在职/离职） |
| leaveDate | 离职日期 |
| deleted | 软删除标记 |
| deletedTime/deletedBy | 删除时间和操作人 |
| userId | 关联的系统用户 |

### Department
部门表。

| 字段 | 说明 |
|------|------|
| code | 部门编码（5位，如 01001），唯一 |
| name | 部门名称 |
| company | 所属公司 |
| level | 层级（1=一级 2=二级 3=三级） |
| parentId | 上级部门ID |
| managerId | 负责人 employeeId |

### Position
岗位表。

| 字段 | 说明 |
|------|------|
| code | 岗位编码（5位，如 01001），唯一 |
| name | 岗位名称 |
| company | 所属公司 |

### EmployeePosition
员工岗位关联表（1人多岗）。

| 字段 | 说明 |
|------|------|
| employeeId | 员工ID |
| departmentId | 部门ID |
| positionId | 岗位ID |
| company | 业务公司 |
| center | 中心 |
| isPrimary | 是否主岗 |
| sortOrder | 排序 |

### DepartmentPosition
部门-岗位配置表（哪些岗位属于哪个部门）。

| 字段 | 说明 |
|------|------|
| departmentId | 部门ID |
| positionId | 岗位ID |

---

## 5. 权限与配置

### FieldPermission
字段级权限例外规则。

| 字段 | 说明 |
|------|------|
| field | 字段名 |
| userId | 用户ID（null 表示全局默认） |
| canRead | 是否可读 |
| canEdit | 是否可编辑 |

### DepartmentAdmin
部门管理员（谁管理哪个部门）。

| 字段 | 说明 |
|------|------|
| dept1 | 部门名称（一级部门） |
| company | 公司 |
| userId | 用户ID |

### CompanyCode
公司编码字典。

| 字段 | 说明 |
|------|------|
| code | 编码（如 01/02/03/04/05） |
| name | 公司名 |

### UserPosition
用户岗位配置表（早期设计，目前未使用）。

| 字段 | 说明 |
|------|------|
| id | 字符串ID |
| userId | 用户ID |
| companyCode | 公司编码 |
| deptCode | 部门编码 |
| positionCode | 岗位编码 |
| isPrimary | 是否主岗 |
| canSelectAnyWeek/canAccessWorks/canAccessHR | 权限标记 |

---

## 6. 表间关联关系

```
User
├── 1:N WeeklyReport        (用户写多篇周报)
├── 1:N ReportGroupAdmin    (管理哪些周报分组)
├── 1:N ReportGroupMember   (属于哪些周报分组成员)
├── 1:N ReportGroupViewer   (能看哪些周报分组)
├── 1:N DepartmentAdmin     (管理哪些部门)
├── 1:N FieldPermission     (字段权限例外)
├── 1:N UserPosition        (岗位配置，未使用)
├── 1:1 Employee            (通过 employeeId / userId 双向关联)
│   └── 1:N EmployeePosition
│       ├── N:1 Department
│       └── N:1 Position
│
ReportGroup
├── 1:N ReportGroupAdmin
├── 1:N ReportGroupMember
├── 1:N ReportGroupViewer
├── 1:N WeeklyReport
│   ├── 1:N ReportItem
│   └── 1:N ReportHistory
│   └── N:1 User
│   └── N:1 ReportGroup
│
Department
├── 1:N EmployeePosition
├── 1:N DepartmentPosition
├── 1:N ReportGroup         (可选关联)
├── N:1 Department          (parentId 自关联，层级结构)
│
Position
├── 1:N EmployeePosition
├── 1:N DepartmentPosition
│
WorkItem
└── 1:N WorkParticipant
```

---

## 7. 重复字段与耦合分析

### 7.1 双向关联耦合：User ↔ Employee

- `User.employeeId`（字符串）指向 `Employee.employeeId`
- `Employee.userId`（Int）指向 `User.id`

**问题**：两边各存一个外键，可能不一致。实际业务以 `User.employeeId` 为准，`Employee.userId` 是后加的反向关联。

### 7.2 业务键 vs 外键：DepartmentAdmin

- `DepartmentAdmin` 用 `(dept1, company)` 作为业务键
- 没有直接关联 `Department.id`

**问题**：部门改名后需要同步更新 DepartmentAdmin 的 dept1 字段。

### 7.3 冗余表：UserPosition

- 字段 `companyCode / deptCode / positionCode` 与 `EmployeePosition + Department + Position` 重复
- 目前没有任何 API 查询此表

**建议**：确认无用后删除，避免与 EmployeePosition 维护两套数据。

### 7.4 公司名硬编码

- `Department.company`、`Position.company` 直接存字符串（"丰华生物"/"丰华制药"等）
- `CompanyCode` 表是独立字典，但业务表未外键关联

**问题**：公司名修改需要改多处，CompanyCode 表未真正起到字典作用。

### 7.5 通用外键：WeeklyReport.scopeType / scopeId

- `scopeType` 表示作用域类型（department/user/group）
- `scopeId` 是对应类型的 ID

**问题**：无法建立数据库级外键约束，靠业务代码保证一致性。

### 7.6 字段级权限：FieldPermission.userId 可为 null

- `userId = null` 表示全局默认规则
- `userId = 具体ID` 表示个人例外

**问题**：查询时需要先查个人规则，没有再查全局规则，逻辑较复杂。目前该功能因 HR 全员开放编辑而暂未生效。

---

## 8. 重新设计方案

目标：**所有表间关联只通过 ID**，**消除所有硬编码字符串**。

### 8.1 打破 User ↔ Employee 双向关联

**现状**：`User.employeeId` (String) ↔ `Employee.userId` (Int) 双向存储，可能不一致。

**方案**：只保留 `Employee.userId → User.id` 单向关联。

```
Before:                          After:
User.employeeId ──┐              User (无 employeeId)
                   │              Employee.userId ──→ User.id
Employee.userId ───┘              
```

**查询变化**：
- 查用户关联的员工：`Employee.findFirst({ where: { userId } })`
- 查员工关联的用户：`Employee.userId` 直接取

**影响**：所有读 `User.employeeId` 的代码需改为查 Employee 表。Prisma 中 `User.employees[]` 已存在。

---

### 8.2 DepartmentAdmin: 字符串 → ID 外键

**现状**：`dept1` (部门名称) + `company` (公司名) 作为业务键，部门改名后需同步更新。

**方案**：改为 `departmentId` 外键。

```diff
model DepartmentAdmin {
  id           Int        @id
- dept1        String
- company      String
+ departmentId Int
+ department   Department @relation(fields: [departmentId], references: [id])
  userId       Int
  user         User       @relation(...)
}
```

公司名通过 `Department.companyCode` 查询，不再冗余存储。

---

### 8.3 公司字典真正生效：company 字符串 → companyCode 外键

**现状**：
- `Department.company`、`Position.company` 存字符串（"丰华生物"等）
- `COMPANY_MAP`、`SHARED_GROUP`、`FENGHUA_ALL` 在 `app/hr/page.tsx` 硬编码
- `CompanyCode` 表有数据但未被外键关联

**方案**：

```diff
model Department {
- company    String
+ companyCode String
+ company    CompanyCode @relation(fields: [companyCode], references: [code])
}

model Position {
- company    String
+ companyCode String
+ company    CompanyCode @relation(fields: [companyCode], references: [code])
}

model EmployeePosition {
- company    String?
+ companyCode String?
}
```

前端常量从 API 动态获取：
```typescript
// Before: 硬编码
const COMPANY_MAP = { "丰华生物": "01", ... };

// After: 从 CompanyCode 表加载
const { data: companies } = await fetch("/api/company-codes");
```

---

### 8.4 删除冗余表 UserPosition

**现状**：3 条数据，零代码引用。与 `EmployeePosition` 功能重叠。

**方案**：直接删除 `UserPosition` 表。

```sql
DROP TABLE UserPosition;
```

---

### 8.5 合并 ReportGroup 三表为一表

**现状**：`ReportGroupAdmin`、`ReportGroupMember`、`ReportGroupViewer` 三个结构完全相同的表，仅含义不同。

**方案**：合并为一个 `ReportGroupMembership`，加 `role` 字段区分。

```diff
- model ReportGroupAdmin { ... }
- model ReportGroupMember { ... }
- model ReportGroupViewer { ... }

+ model ReportGroupMembership {
+   id            Int         @id
+   reportGroupId Int
+   userId        Int
+   role          String      // "admin" | "member" | "viewer"
+   reportGroup   ReportGroup @relation(...)
+   user          User        @relation(...)
+   @@unique([reportGroupId, userId])
+ }
```

查询示例：
```typescript
// 查成员
db.reportGroupMembership.findMany({ where: { reportGroupId, role: "member" } })
// 查管理员
db.reportGroupMembership.findMany({ where: { reportGroupId, role: "admin" } })
```

---

### 8.6 精简 User 表

**现状**：`User` 表混合了认证信息 + 业务信息 + 权限标记。

**方案**：移除可通过关联查询的冗余字段。

```diff
model User {
  id         Int    @id
  wxUserId   String @unique
  username   String? @unique
  password   String?
  name       String
- company            // 通过 departmentId → Department.companyCode 查询
- departmentName     // 通过 departmentId → Department.name 查询
- employeeId         // 通过 Employee.userId 反向查
  departmentId Int
  // 权限字段保留（核心逻辑依赖）
  isWorkListAdmin  Boolean
  canSelectAnyWeek Boolean
  canAccessHR      Boolean
  canAccessWorks   Boolean
  canLogin         Boolean
  apiKey           String?
}
```

---

### 8.7 WeeklyReport 多态关联简化

**现状**：`scopeType` + `scopeId` 多态外键，无法建数据库约束。实际 scopeType 只有 "department"。

**方案**：直接改为 `departmentId`。

```diff
model WeeklyReport {
- scopeType  String   @default("department")
- scopeId    Int
+ departmentId Int
+ department   Department? @relation(fields: [departmentId], references: [id])
}
```

旧数据兼容：迁移时 `scopeId` → `departmentId`。

---

### 8.8 FieldPermission 全局规则显式化

**现状**：`userId = null` 表示全局默认规则，查询逻辑需要两步。

**方案**：新增 `GlobalFieldPermission` 表分离全局和个人规则。

```diff
+ model GlobalFieldPermission {
+   field   String
+   canRead Boolean @default(true)
+   canEdit Boolean @default(false)
+   @@id([field])
+ }

model FieldPermission {
  field   String
- userId  Int?     // 不再允许 null
+ userId  Int       // 必须关联具体用户
+ canRead Boolean
+ canEdit Boolean
+ @@id([field, userId])
}
```

---

### 8.9 新 ER 图

```
User ──1:N── WeeklyReport ──1:N── ReportItem
  │              │                    │
  │              └──1:N── ReportHistory
  │
  ├──1:N── ReportGroupMembership (role: admin/member/viewer)
  │              │
  │              └──N:1── ReportGroup
  │                           │
  │                           └──N:1── Department (可选)
  │
  ├──1:1── Employee (通过 Employee.userId)
  │              │
  │              └──1:N── EmployeePosition
  │                            ├──N:1── Department
  │                            └──N:1── Position
  │
  ├──1:N── FieldPermission (userId NOT NULL)
  ├──1:N── DepartmentAdmin ──N:1── Department
  │
  └──N:1── Department

CompanyCode ──1:N── Department
CompanyCode ──1:N── Position
CompanyCode ──1:N── EmployeePosition

Department ──1:N── DepartmentPosition ──N:1── Position
Department ──1:N── Department (parentId 自关联)
Department ──1:N── WorkItem ──1:N── WorkParticipant
```

**表总数**：16 张（从 19 张减少 3 张）
- 删除：UserPosition
- 合并：ReportGroupAdmin + ReportGroupMember + ReportGroupViewer → ReportGroupMembership
- 新增：GlobalFieldPermission

---

### 8.10 迁移优先级

| 优先级 | 改动 | 理由 | 风险 |
|--------|------|------|------|
| **P0** | 删除 UserPosition | 零代码引用，零风险 | 无 |
| **P0** | DepartmentAdmin 改 departmentId | 消除部门改名不一致 | 需改 admin/page.tsx |
| **P1** | company → companyCode 外键 | 消除公司名硬编码 | 需改多处查询 |
| **P1** | 打破 Employee 双向关联 | 消除数据不一致风险 | 需改所有读 User.employeeId 处 |
| **P2** | 合并 ReportGroup 三表 | 减少表数量，简化逻辑 | 需改周报相关 API |
| **P2** | WeeklyReport scopeType/scopeId → departmentId | 消除多态外键 | 需迁移历史数据 |
| **P3** | 精简 User 表 | 减少冗余字段 | 影响面广，需逐字段确认 |
| **P3** | FieldPermission 拆全局表 | 简化查询逻辑 | 该功能当前未启用 |

---

## 9. 权限系统重新设计

目标：**权限定义与授予分离**，**新增权限只需插一行数据**，**Admin 页面自动发现**。

### 9.1 现状问题

权限散落在 **5 处**，新增权限要改 10+ 个文件：

| 存储位置 | 权限 | 问题 |
|----------|------|------|
| `User.isWorkListAdmin` | 超级管理员 | Schema+API+UI 多处硬编码 |
| `User.canSelectAnyWeek` | 补填周报 | 同上 |
| `User.canAccessHR` | 人事行政 | 同上 |
| `User.canAccessWorks` | 工作清单 | 同上 |
| `User.canLogin` | 可登录 | 同上 |
| `DepartmentAdmin` | 部门管理员 | 用 dept1 字符串而非 ID |
| `ReportGroupAdmin` | 周报分组管理员 | 三个结构完全相同的表 |
| `ReportGroupMember` | 周报填写人 | |
| `ReportGroupViewer` | 周报查看者 | |
| `FieldPermission` | 字段读写 | userId 可为 null |
| `UserPosition` | (未使用) | 冗余表 |

Admin 页面 `allPermissions` 硬编码，新权限必须改 `admin/page.tsx`、`user-permissions/route.ts`、`employee-permissions/route.ts` 等多处。

### 9.2 新设计：定义表 + 授予表分离

```
定义层（权限注册表，新增权限只插数据）
├── PermissionCategory    权限分类
└── Permission            权限定义

授予层（谁有什么权限）
├── UserPermission        用户系统/模块权限（替代 User 表 5 个 boolean）
├── ReportGroupMembership 周报分组成员（替代 ReportGroupAdmin/Member/Viewer 三表）
├── DepartmentAdmin       部门管理员（改用 departmentId）
└── FieldPermission       字段级权限
```

#### 9.2.1 定义表

```prisma
model PermissionCategory {
  id        Int          @id @default(autoincrement())
  key       String       @unique   // "system" | "module" | "report" | "dept" | "field"
  name      String                 // "系统权限" | "模块权限" | "周报权限" | "部门权限" | "字段权限"
  sortOrder Int          @default(0)
  permissions Permission[]
}

model Permission {
  id          Int                @id @default(autoincrement())
  key         String             @unique   // "system.admin" | "hr.access" | "report.member"
  categoryId  Int
  category    PermissionCategory @relation(fields: [categoryId], references: [id])
  name        String                       // 权限名称（如 "超级管理员"）
  description String?                      // 权限说明
  sortOrder   Int                @default(0)
  userGrants  UserPermission[]
}
```

#### 9.2.2 授予表

```prisma
// 系统/模块权限（替代 User 表 5 个 boolean）
model UserPermission {
  id           Int        @id @default(autoincrement())
  userId       Int
  permissionId Int
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([userId, permissionId])
}

// 周报分组权限（替代 ReportGroupAdmin/Member/Viewer 三表）
model ReportGroupMembership {
  id            Int         @id @default(autoincrement())
  userId        Int
  reportGroupId Int
  role          String      // "admin" | "member" | "viewer"
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  reportGroup   ReportGroup @relation(fields: [reportGroupId], references: [id], onDelete: Cascade)

  @@unique([userId, reportGroupId])
}

// 部门管理员
model DepartmentAdmin {
  id           Int        @id @default(autoincrement())
  userId       Int
  departmentId Int
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@unique([userId, departmentId])
}

// 字段级权限
model FieldPermission {
  id      Int     @id @default(autoincrement())
  field   String
  userId  Int
  canRead Boolean @default(true)
  canEdit Boolean @default(false)
  user    User    @relation(fields: [userId], references: [id])

  @@unique([field, userId])
}

// 全局字段默认权限
model GlobalFieldPermission {
  field   String
  canRead Boolean @default(true)
  canEdit Boolean @default(false)

  @@id([field])
}
```

#### 9.2.3 User 表变化

```diff
model User {
  id         Int    @id
  wxUserId   String @unique
  username   String? @unique
  password   String?
  name       String
  departmentId Int
- isWorkListAdmin  Boolean
- canSelectAnyWeek Boolean
- canAccessHR      Boolean
- canAccessWorks   Boolean
- canLogin         Boolean
+ permissions UserPermission[]   // 通过 UserPermission 查权限
  apiKey     String?
}
```

### 9.3 权限数据（Permission 表种子数据）

#### 系统权限（system）

| key | name | description |
|-----|------|-------------|
| `system.login` | 可登录 | 是否允许登录系统 |
| `system.admin` | 超级管理员 | 管理后台全部权限，可查看所有数据 |
| `system.any_week` | 补填周报 | 可补填任意历史周的周报 |

#### 模块权限（module）

| key | name | description |
|-----|------|-------------|
| `module.hr` | 人事行政 | 访问人事行政管理 `/hr` |
| `module.works` | 工作清单 | 访问工作清单 `/works` |

#### 周报分组权限（report）

| key | name | description |
|-----|------|-------------|
| `report.admin` | 分组管理员 | 管理分组设置、成员、查看者 |
| `report.member` | 分组填写 | 填写/提交该分组的周报 |
| `report.viewer` | 分组查看 | 查看该分组的周报，不填写 |

> **注意**：这些权限通过 `ReportGroupMembership` 表授予，`reportGroupId` 指定作用范围。Permission 表的 `report.*` 用于 Admin 页面展示。

#### 部门权限（dept）

| key | name | description |
|-----|------|-------------|
| `dept.admin` | 部门管理员 | 管理部门的花名册/岗位信息 |

> 通过 `DepartmentAdmin` 表授予，`departmentId` 指定作用范围。

#### 字段权限（field）

| key | name | description |
|-----|------|-------------|
| `field.read` | 字段读取 | 可查看某字段 |
| `field.edit` | 字段编辑 | 可编辑某字段 |

> 通过 `FieldPermission` 表授予，`field` 指定字段名。

### 9.4 自动发现机制

新增权限只需 INSERT 一行，Admin 页面无需改代码：

```sql
-- 新增一个权限（只需这一条SQL）
INSERT INTO Permission (key, categoryId, name, description, sortOrder)
VALUES ('module.reports', 2, '报表查看', '可查看数据报表', 20);
```

Admin 页面加载权限列表：

```
GET /api/admin/permissions
→ {
    categories: [
      {
        key: "system", name: "系统权限",
        permissions: [
          { key: "system.login", name: "可登录", description: "..." },
          { key: "system.admin", name: "超级管理员", description: "..." },
          { key: "system.any_week", name: "补填周报", description: "..." }
        ]
      },
      {
        key: "module", name: "模块权限",
        permissions: [
          { key: "module.hr", name: "人事行政", description: "..." },
          { key: "module.works", name: "工作清单", description: "..." }
        ]
      },
      ...
    ]
  }
```

API 实现：
```typescript
// GET /api/admin/permissions
export async function GET() {
  const categories = await prisma.permissionCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      permissions: { orderBy: { sortOrder: "asc" } }
    }
  });
  return NextResponse.json({ categories });
}
```

### 9.5 Admin 页面新视图

#### 视图 1：按权限类型（by-permission-type）

```
┌──────────────────────────────────────────────┐
│ [系统权限] [模块权限] [周报权限] [部门权限] [字段权限]  │  ← 一级：分类卡
├──────────────────────────────────────────────┤
│                                              │
│  ▼ 系统权限                                  │  ← 点击展开
│    ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│    │ 可登录    │ │ 超级管理  │ │ 补填周报    │ │  ← 二级：具体权限卡
│    │ 共 85 人  │ │ 共 3 人  │ │ 共 12 人   │ │
│    └──────────┘ └──────────┘ └────────────┘ │
│                                              │
│  ▼ 模块权限                                  │
│    ┌──────────┐ ┌──────────┐                │
│    │ 人事行政  │ │ 工作清单  │                │
│    └──────────┘ └──────────┘                │
│                                              │
└──────────────────────────────────────────────┘
```

点击"超级管理员"卡片 → 展开拥有该权限的用户列表（可搜索、可赋予/取消）。

#### 视图 2：按员工（by-user）

```
┌──────────────────────────────────────────────┐
│ 搜索员工: [张三________________]              │
├──────────────────────────────────────────────┤
│ 张三 (zhangsan) · 研发部                      │
│                                              │
│ ▶ 系统权限 (3)                               │  ← 一级：分类分组
│   [可登录 ✓] [超级管理员 ✗] [补填周报 ✓]     │  ← 二级：具体权限
│                                              │
│ ▶ 模块权限 (2)                               │
│   [人事行政 ✓] [工作清单 ✓]                   │
│                                              │
│ ▶ 周报权限 (2 个分组)                        │
│   [研发部周报-管理员] [项目组周报-填写]       │
│                                              │
│ ▶ 部门权限 (1)                               │
│   [研发部-管理员]                             │
│                                              │
│ ▶ 字段权限 (3)                               │
│   [phone:读/写] [salary:读] [address:读]     │
└──────────────────────────────────────────────┘
```

### 9.6 权限校验变化

```typescript
// Before: 读 User 表 boolean
const user = await prisma.user.findUnique({ where: { id } });
if (user?.isWorkListAdmin) { ... }

// After: 查 UserPermission 表
const hasPermission = await checkPermission(userId, "system.admin");

// lib/auth.ts 新增 helper
export async function checkPermission(userId: number, permKey: string): Promise<boolean> {
  const perm = await prisma.userPermission.findUnique({
    where: { userId_permissionId: { userId, permissionId: permKey } },
  });
  return !!perm;
}

export async function getUserPermissions(userId: number) {
  return prisma.userPermission.findMany({
    where: { userId },
    include: { permission: { include: { category: true } } },
    orderBy: { permission: { category: { sortOrder: "asc" } } },
  });
}
```

向后兼容：保留 `isWorkListAdmin` 作为 `checkPermission(userId, "system.admin")` 的别名。

### 9.7 迁移步骤

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 创建 `PermissionCategory` + `Permission` 表，插入种子数据 | 权限注册表 |
| 2 | 创建 `UserPermission` 表 | 新的授予表 |
| 3 | 将 `User` 表 5 个 boolean 迁移到 `UserPermission` | `isWorkListAdmin` → `system.admin` 等 |
| 4 | 合并 ReportGroupAdmin/Member/Viewer → `ReportGroupMembership` | 添加 `role` 字段 |
| 5 | 更新 `DepartmentAdmin` 改用 `departmentId` | 消除 dept1 字符串 |
| 6 | 更新 `lib/auth.ts` 权限校验函数 | 查新表 |
| 7 | 改造 Admin 页面 | 动态加载权限定义 |
| 8 | 删除 `User` 表 5 个 boolean 字段 | 最后一步，确保无遗漏 |

### 9.8 权限表总览

| 表 | 用途 | 记录数 |
|----|------|--------|
| `PermissionCategory` | 权限分类定义 | ~5 行 |
| `Permission` | 权限定义注册表 | ~10 行 |
| `UserPermission` | 用户系统/模块权限 | N × M |
| `ReportGroupMembership` | 周报分组权限 | 替代原 3 表 |
| `DepartmentAdmin` | 部门管理员 | 少量 |
| `FieldPermission` | 字段级个人例外 | 少量 |
| `GlobalFieldPermission` | 字段级全局默认 | 按字段数 |

**总计**：7 张权限相关表（定义 2 张 + 授予 5 张），替代原有散落在 User + 4 处的混乱结构。
