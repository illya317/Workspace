# 数据库表说明

共 18 张表，按业务模块分组。

---

## 1. 用户与认证

### User
系统登录用户。微信扫码或账号密码登录。

| 字段 | 说明 |
|------|------|
| wxUserId | 微信用户ID，唯一 |
| username / password | 账号密码登录（可选） |
| name | 用户姓名 |
| company | 所属公司 |
| departmentId / departmentName | 所属部门 |
| isWorkListAdmin | 超级管理员（过渡期保留，逐步迁移到 UserPermission） |
| canSelectAnyWeek | 可补填任意周报 |
| canAccessHR | 人事行政权限 |
| canAccessWorks | 工作清单权限 |
| canLogin | 是否允许登录 |
| employeeId | 关联员工编号 |
| apiKey | 个人 API Key |

---

## 2. 周报模块

### ReportGroup
周报分组（按部门/项目组织）。关联可选的 Department。

### ReportGroupAdmin
分组管理员（谁管理这个分组）。**过渡期保留，新代码用 ReportGroupMembership(role=admin)。**

### ReportGroupMember
分组填写人员。**过渡期保留，新代码用 ReportGroupMembership(role=member)。**

### ReportGroupViewer
分组查看者（只看不写）。**过渡期保留，新代码用 ReportGroupMembership(role=viewer)。**

### ReportGroupMembership
统一的分组成员关系表（替代上述三表）。

| 字段 | 说明 |
|------|------|
| userId | 用户 |
| reportGroupId | 分组 |
| role | admin / member / viewer |

### WeeklyReport
周报主表。每人每周每组一篇。

| 字段 | 说明 |
|------|------|
| userId | 填写人 |
| reportGroupId | 所属分组 |
| weekNumber / year | 周数（1-52）+ 年份 |
| scopeType / scopeId | 作用域（部门/项目） |
| taskName | 任务名称 |
| version | 当前版本号，每次保存递增 |

### ReportItem
周报条目明细。每篇周报包含多条 item。

| 字段 | 说明 |
|------|------|
| reportId | 所属周报 |
| category | 分类 |
| plan / completion / nextGoal | 计划 / 完成 / 下步目标 |
| workItemId | 关联工作清单条目 |

### ReportHistory
周报修改历史。每次保存前快照旧数据。

| 字段 | 说明 |
|------|------|
| reportId / version | 所属周报 + 版本号 |
| taskName / notes | 当时的任务名和备注 |
| itemsJson | 当时的条目（JSON 快照） |

---

## 3. 工作清单模块

### WorkItem
部门工作清单条目。

| 字段 | 说明 |
|------|------|
| departmentId | 所属部门 |
| category / content | 分类 / 内容 |
| importance / urgency | 重要度 / 紧急度（1-5） |
| isArchived | 是否归档 |

### WorkParticipant
工作参与人。

| 字段 | 说明 |
|------|------|
| workItemId | 所属工作 |
| name / wxUserId | 参与人姓名 / 微信ID |

---

## 4. 人事行政（HR）

### Employee
员工基础信息表。一人一条，employeeId 去重。

| 字段 | 说明 |
|------|------|
| employeeId | 业务编号（如 00108），唯一 |
| name / alias | 姓名 / 别名 |
| gender / ethnicity / hometown / politics | 性别 / 民族 / 籍贯 / 政治面貌 |
| education / title / school / major | 学历 / 职称 / 院校 / 专业 |
| phone | 电话 |
| office1-3 | 办公区 |
| attendance1-2 | 考勤信息 |
| joinDate / nature | 进司时间 / 性质 |
| status / leaveDate | 状态（在职/离职）/ 离职日期 |
| userId | 关联系统用户 |
| editedBy / editedAt / version | 最后编辑人 / 时间 / 版本号 |

### Department
部门表。层级结构（parentId 自关联）。

| 字段 | 说明 |
|------|------|
| code | 部门编码（5位，如 01001），唯一 |
| name | 部门名称 |
| company | 所属公司 |
| level | 层级（1=一级 2=二级 3=三级） |
| parentId | 上级部门 |
| managerId | 负责人 employeeId |

### Position
岗位表。

| 字段 | 说明 |
|------|------|
| code | 岗位编码（5位），唯一 |
| name | 岗位名称 |
| company | 所属公司 |

### EmployeePosition
员工岗位关联表。一人可多岗。

| 字段 | 说明 |
|------|------|
| employeeId | 员工 |
| departmentId | 部门 |
| positionId | 岗位 |
| company | 该岗位上的业务公司 |
| center | 中心 |
| isPrimary | 是否主岗 |

### DepartmentPosition
部门-岗位配置表。定义哪些岗位属于哪个部门。

| 字段 | 说明 |
|------|------|
| departmentId | 部门 |
| positionId | 岗位 |

### CompanyCode
公司编码字典。

| 字段 | 说明 |
|------|------|
| code | 编码（01/02/03/04/05） |
| name | 公司名 |

---

## 5. 权限系统（RBAC0）

详见 `docs/rbac.md`。3 张表替代旧 7 张。

### Resource
资源注册表。定义有什么（系统功能、模块入口、部门、周报分组、字段）。

| 字段 | 说明 |
|------|------|
| key | 资源标识（如 system / module.hr / department / field） |
| name / description | 名称 / 说明 |

种子数据：

| key | name |
|-----|------|
| system | 系统功能 |
| module.hr | 人事行政 |
| module.works | 工作清单 |
| department | 部门 |
| report_group | 周报分组 |
| field | 字段 |

### Role
角色定义表。定义能干什么。

| key | name | 说明 |
|-----|------|------|
| access | 可进入 | 系统/模块级别开关 |
| admin | 管理 | 可分配资源权限给他人 |
| write | 编辑 | 可修改数据 |
| read | 只读 | 可查看数据 |
| member | 参与 | 可提交周报 |
| viewer | 查看 | 可查看周报 |

### UserResourceRole
权限分配表。谁（userId）在哪个范围（scopeId）干什么（role）。

| 字段 | 说明 |
|------|------|
| userId | 用户 |
| resourceId | 资源 |
| roleId | 角色 |
| scopeId | 范围（null=全局开关，有值=资源实例如 departmentId / fieldName） |

**层级区分**：
- scopeId=null → 第 2 层权限（toggle 开关）
- scopeId 有值 → 第 3 层权限（范围分配）

**旧表迁移**：
| 旧表 | → 新 |
|------|------|
| Permission | → Resource |
| — | → Role |
| UserPermission | → UserResourceRole (scopeId=null) |
| DepartmentAdmin | → UserResourceRole (resource=department, role=admin, scopeId=departmentId) |
| ReportGroupMembership | → UserResourceRole (resource=report_group, scopeId=reportGroupId) |
| FieldPermission | → UserResourceRole (resource=field, role=read/write, scopeId=fieldName) |
| GlobalFieldPermission | → UserResourceRole (userId=0) |

---

## 6. 编辑历史

### EditHistory
通用编辑历史快照。每次修改 Employee/EmployeePosition/Department/Position 前自动记录。

| 字段 | 说明 |
|------|------|
| entityType | 实体类型（employee / employee_position / code_department / code_position） |
| entityId | 实体主键 |
| version | 版本号，每编辑一次递增 |
| dataJson | 编辑前的完整数据快照（JSON） |
| editedBy | 编辑人 userId |

---

## 7. 表间关系速查

```
User
├── 1:N WeeklyReport
├── 1:N UserResourceRole → Resource + Role
├── 1:N ReportGroupMembership → ReportGroup
├── 1:1 Employee（通过 Employee.userId）
│   └── 1:N EmployeePosition
│       ├── N:1 Department
│       └── N:1 Position

ReportGroup
├── 1:N ReportGroupMembership
├── 1:N WeeklyReport
│   ├── 1:N ReportItem
│   └── 1:N ReportHistory

Department
├── 1:N EmployeePosition
├── 1:N DepartmentPosition → Position
├── 1:N Department（parentId 自关联）
├── 1:N WorkItem → WorkParticipant

EditHistory（独立快照表，不关联实体）
```
