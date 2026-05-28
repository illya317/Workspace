# Schema Changes v3 — 通用化报告 + 解耦工作清单

## 新增表

### 5-7 Project

| Field | Type | Required | Note |
|-------|------|----------|------|
| id | Int | * | 主键 |
| name | String | * | 项目名称 |
| type | String | * | `"department"` / `"project"` |
| departmentId | Int | | type=department 时关联部门 |
| description | String | | 说明 |
| createdAt | DateTime | * | @default(now()) |
| updatedAt | DateTime | | @updatedAt |
| editedBy | Int | | → User.id |
| editedAt | DateTime | | |
| version | Int | * | @default(1) |

FK: `departmentId → Department.id`, `editedBy → User.id`

### 5-8 EmployeeProject

| Field | Type | Required | Note |
|-------|------|----------|------|
| id | Int | * | 主键 |
| employeeId | Int | * | → Employee.id |
| projectId | Int | * | → Project.id |
| role | String | | 项目角色 |
| startDate | String | | |
| endDate | String | | |
| createdAt | DateTime | * | @default(now()) |
| updatedAt | DateTime | | @updatedAt |
| editedBy | Int | | → User.id |
| editedAt | DateTime | | |
| version | Int | * | @default(1) |

FK: `employeeId → Employee.id (Cascade)`, `projectId → Project.id (Cascade)`, `editedBy → User.id`
`@@unique([employeeId, projectId])`

---

## 改动表

### 3-1 ReportGroup

| 操作 | 字段 | 类型 | Note |
|------|------|------|------|
| ➖ | departmentId | Int? | 删除 |
| ➖ | department | Department? | 删除 relation |
| ➕ | periodType | String | @default("weekly"), `"daily"` / `"weekly"` / `"monthly"` |
| ➕ | targetType | String | `"project"` / `"department"` / `"position"` |
| ➕ | targetId | Int | 多态 FK（无 @relation） |

### 3-2 WeeklyReport → Report

| 操作 | 字段 | Note |
|------|------|------|
| 🔄 | 表名 | WeeklyReport → Report |
| ➖ | weekNumber | Int |
| ➖ | year | Int |
| ➖ | periodType | 移到 ReportGroup |
| ➖ | scopeType | 🗑️ 废弃 |
| ➖ | scopeId | 🗑️ 废弃 |
| ➕ | date | String, 日期（yyyy-MM-dd） |

旧 `@@unique([reportGroupId, scopeType, scopeId, periodType, year, weekNumber])`

新 `@@unique([reportGroupId, date])`

其余字段不变: `id, userId, reportGroupId, taskName, notes, version, createdAt, updatedAt`

### 3-3 ReportItem — 不动

### 3-4 ReportHistory — 不动

### 4-1 WorkItem

| 操作 | 字段 | 类型 | Note |
|------|------|------|------|
| ➖ | scopeType | String? | 废弃 `"report_group"\|"department"\|"personal"` |
| ➖ | scopeId | Int? | 废弃 |
| ➕ | targetType | String | `"project"\|"department"\|"position"\|"personal"` |
| ➕ | targetId | Int? | 多态 FK |

其余字段不变: `id, category, content, importance, urgency, isArchived, isPrivate, sortOrder, createdAt, updatedAt`

`@@index` 从 `[scopeType, scopeId, category]` 改为 `[targetType, targetId, category]`

### 4-2 WorkParticipant — 不动

---

## 不动

- Employee, Company, Department, Position, EmployeePosition, DepartmentPosition
- User, Resource, Role, UserResourceRole, PositionResourceRole, DepartmentResourceRole
- SystemConfig
- EditHistory
- ReportItem, ReportHistory, WorkParticipant

---

## 关联变更（代码）

| 模块 | 涉及 |
|------|------|
| `lib/auth.ts` | — |
| API 路由 | Report CRUD 改 field 名, 唯一键变更 |
| 前端页面 | `/reports` 周报页 → 适配 date 字段 |
| 前端页面 | `/hr` 可能增加 Project/EmployeeProject 管理 |
| 前端页面 | `/works` 工作清单 → 适配 targetType/targetId |
| seed | seed-rbac.ts |
| 迁移脚本 | scripts/migrate-scope-to-project.ts |

---

## 汇总

| # | 动作 | 表 |
|---|------|-----|
| ➕ | 新增 | Project (5-7) |
| ➕ | 新增 | EmployeeProject (5-8) |
| 🔧 | 改字段 | ReportGroup (3-1) |
| 🔄 | 重命名+改字段 | WeeklyReport → Report (3-2) |
| 🔧 | 改字段 | WorkItem (4-1) |
| ✋ | 不动 | ReportItem, ReportHistory, WorkParticipant |
