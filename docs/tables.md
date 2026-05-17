# 数据库表说明

共 17 张表，全部通过 ID 外键链接，无字符串耦合。

---

## 1. 用户与认证

### User
纯认证实体。业务归属走 Employee → EmployeePosition。

| 字段 | 说明 |
|------|------|
| wxUserId | 微信用户ID，唯一 |
| username / password | 账号密码登录（用户自取） |
| name | 登录显示名 |
| departmentId | 注册时初始关联线索（非权威来源） |
| apiKey | 个人 API Key |
| canLogin | 是否允许登录（离职=false，不删号） |

> 权限全部走 `UserResourceRole`，User 表不存权限字段。

---

## 2. 周报模块

### ReportGroup
周报分组。departmentId=null 为独立项目组，非 null 为部门周报组。

| 字段 | 说明 |
|------|------|
| name | 分组名称 |
| description | 说明 |
| departmentId | 关联部门 → `Department.id`（可选） |
| sortOrder | 排序 |

### WeeklyReport
周报主表。每人每周每组一篇。

| 字段 | 说明 |
|------|------|
| userId | 填写人 → `User.id` |
| reportGroupId | 所属分组 → `ReportGroup.id` |
| weekNumber / year | 周数 + 年份 |
| taskName | 任务名称 |
| version | 版本号，每次保存递增 |

> `scopeType/scopeId` 待废弃，统一走 `reportGroupId`。

### ReportItem
周报条目明细。

| 字段 | 说明 |
|------|------|
| reportId | 所属周报 → `WeeklyReport.id` |
| category | 分类 |
| plan / completion / nextGoal | 计划 / 完成 / 下步目标 |
| workItemId | 关联工作清单 → `WorkItem.id` |

### ReportHistory
周报修改历史。每次保存前快照旧数据。

| 字段 | 说明 |
|------|------|
| reportId / version | 所属周报 + 版本号 |
| itemsJson | 当时的条目（JSON 快照） |

---

## 3. 工作清单模块（独立）

### WorkItem
工作清单条目。不依赖任何模块，通过 scopeType/scopeId 泛化归属。

| 字段 | 说明 |
|------|------|
| scopeType | 归属维度：`report_group` / `department` / `personal` |
| scopeId | ReportGroup.id / Department.id / User.id |
| category / content | 分类 / 内容 |
| importance / urgency | 重要度 / 紧急度（1-5） |
| isArchived | 是否归档 |
| isPrivate | personal 时默认仅自己可见 |

**可见性**：

| scopeType | scopeId | 可见范围 |
|-----------|---------|----------|
| `report_group` | ReportGroup.id | 该组成员 |
| `department` | Department.id | 部门成员 |
| `personal` | User.id | 默认仅自己 |

**周报导入**（`/api/reports` 创建时）：
1. 默认：`scopeType=report_group AND scopeId = 当前 ReportGroup.id`
2. 可选：`scopeType=department AND scopeId = ReportGroup.departmentId`
3. 可选：`scopeType=department AND scopeId ∈ 用户其他部门`
4. 可选：`scopeType=personal AND scopeId = 用户自己`

### WorkParticipant
工作参与人。

| 字段 | 说明 |
|------|------|
| workItemId | 所属工作 → `WorkItem.id` |
| name / wxUserId | 参与人姓名 / 微信ID |

---

## 4. 花名册与组织架构

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
| userId | 关联系统用户 → `User.id`（可选） |
| editedBy / editedAt / version | 最后编辑人 / 时间 / 版本号 |

### Department
部门表。层级结构（parentId 自关联），所有 ID 链接。

| 字段 | 说明 |
|------|------|
| code | 部门编码（5位，如 01001），唯一 |
| name | 部门名称 |
| companyCode | 所属公司编码 → `CompanyCode.code` |
| level | 层级（1=一级 2=二级 3=三级） |
| parentId | 上级部门 → `Department.id` |
| managerId | 负责人 employeeId（兼容无 User 账号） |
| managerUserId | 负责人 → `User.id`（有账号时关联） |

### Position
岗位表。

| 字段 | 说明 |
|------|------|
| code | 岗位编码（5位），唯一 |
| name | 岗位名称 |
| companyCode | 所属公司编码 → `CompanyCode.code` |

### EmployeePosition
员工岗位关联表。一人可多岗。

| 字段 | 说明 |
|------|------|
| employeeId | 员工 → `Employee.id` |
| departmentId | 部门 → `Department.id` |
| positionId | 岗位 → `Position.id` |
| companyCode | 该岗位上的业务公司编码 → `CompanyCode.code` |
| center | 中心 |
| isPrimary | 是否主岗 |
| startDate | 任职开始日期 |
| endDate | 任职结束日期（null=至今） |

### DepartmentPosition
部门-岗位编制配置表。定义该部门有哪些编制岗位。

| 字段 | 说明 |
|------|------|
| departmentId | 部门 → `Department.id` |
| positionId | 岗位 → `Position.id` |

> 注：这是编制配置，不同于 EmployeePosition 的任职关系。

### CompanyCode
公司编码字典。

| 字段 | 说明 |
|------|------|
| code | 编码（01/02/03/04/05），主键 |
| name | 公司名 |

---

## 5. 权限系统（RBAC0）

详见 `docs/rbac.md`。3 张表，全部 ID 链接。

### Resource
资源注册表。定义有什么。

| key | name |
|-----|------|
| system | 系统功能 |
| module.hr | 人事行政 |
| module.works | 工作清单 |
| department | 部门 |
| report_group | 周报分组 |

### Role
角色定义表。定义能干什么。

| key | name | 说明 |
|-----|------|------|
| access | 可进入 | 系统/模块级别开关 |
| admin | 管理 | 编辑 + 分配权限 |
| write | 编辑 | 可修改数据 |
| read | 只读 | 可查看数据 |
| member | 参与 | 可提交（周报场景） |
| viewer | 查看 | 可查看（周报场景） |

### UserResourceRole
权限分配表。谁 + 在哪 + 干什么。

| 字段 | 说明 |
|------|------|
| userId | 用户 → `User.id` |
| resourceId | 资源 → `Resource.id` |
| roleId | 角色 → `Role.id` |
| scopeId | 范围（null=全局开关，有值=资源实例ID） |

**层级**：
- scopeId=null → 第 2 层（管理员 toggle）
- scopeId 有值 → 第 3 层（权限负责人分配范围）

---

## 6. 编辑历史

### EditHistory
通用编辑历史快照。独立于所有模块。

| 字段 | 说明 |
|------|------|
| entityType | 实体类型（employee / employee_position / code_department / code_position） |
| entityId | 实体主键 |
| version | 版本号，每编辑一次递增 |
| dataJson | 编辑前完整快照（JSON） |
| editedBy | 编辑人 → `User.id` |

---

## 7. 表间耦合清单

**每张表对其他表的依赖，只通过 ID 链接。**

| 表 | 字段 | 指向表 | 类型 | 用途 |
|-----|------|--------|------|------|
| User | — | — | 无外键 | 纯认证实体 |
| Employee | userId | User | 可选 | 关联系统账号 |
| EmployeePosition | employeeId | Employee | 必填 | 谁 |
| EmployeePosition | departmentId | Department | 必填 | 在哪 |
| EmployeePosition | positionId | Position | 必填 | 什么岗位 |
| Department | parentId | Department | 可选 | 层级自关联 |
| Department | managerUserId | User | 可选 | 部门负责人 |
| DepartmentPosition | departmentId | Department | 必填 | 编制对应部门 |
| DepartmentPosition | positionId | Position | 必填 | 编制对应岗位 |
| ReportGroup | departmentId | Department | 可选 | 纯部门组关联 |
| WeeklyReport | userId | User | 可选 | 填写人 |
| WeeklyReport | reportGroupId | ReportGroup | 可选 | 所属分组 |
| ReportItem | reportId | WeeklyReport | 必填 | 所属周报 |
| ReportItem | workItemId | WorkItem | 可选 | 关联工作清单 |
| ReportHistory | reportId | WeeklyReport | 必填 | 所属周报 |
| WorkItem | — | — | 无 FK | scopeType/scopeId 泛化引用 |
| WorkParticipant | workItemId | WorkItem | 必填 | 所属工作项 |
| UserResourceRole | userId | User | 必填 | 谁 |
| UserResourceRole | resourceId | Resource | 必填 | 什么资源 |
| UserResourceRole | roleId | Role | 必填 | 什么角色 |
| EditHistory | — | — | 无 FK | entityType/entityId 泛化引用 |
| CompanyCode | — | — | 无 FK | 字典表，被 code 字段引用 |

**无耦合的表**（不依赖任何其他表）：
- `User` — 纯认证
- `CompanyCode` — 字典
- `Resource` — 权限定义
- `Role` — 权限定义
- `EditHistory` — 独立快照

**单点耦合的表**（只依赖一个表）：
- `Employee` → User（可选）
- `Department` → Department（自关联）
- `Position` — 零耦合
- `ReportGroup` → Department（可选）
- `ReportItem` → WeeklyReport
- `ReportHistory` → WeeklyReport
- `WorkParticipant` → WorkItem

**桥梁表**（连接多个实体）：
- `EmployeePosition` — Employee × Department × Position
- `DepartmentPosition` — Department × Position
- `WeeklyReport` — User × ReportGroup
- `UserResourceRole` — User × Resource × Role
