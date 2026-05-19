# HR Database Schema (25 tables)

## 1. System

### 1-1 User

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF | 主键 |
| `wxUserId` | String |  |  | 微信用户ID（无微信则留空） |
| `username` | String |  |  | 登录用户名（自取） |
| `password` | String |  |  | 登录密码 |
| `name` | String | * |  | 名称 |
| `avatar` | String |  |  | 头像URL |
| `routineItems` | String |  |  | 日常工作模板JSON |
| `canLogin` | Boolean | * |  | 离职=停用，不删号（账号状态，非权限） |
| `apiKey` | String |  |  | API密钥 |
| `createdAt` | DateTime | * |  | 创建时间 |

← Referenced by: [2-3 UserResourceRole](#userresourcerole), [3-1 Report](#report), [5-1 Employee](#employee), [5-1 Employee](#employee), [5-2 Company](#company), [5-4 Department](#department), [5-4 Department](#department), [5-5 Position](#position), [5-6 EmployeePosition](#employeeposition), [5-7 Project](#project), [5-8 EmployeeProject](#employeeproject), [6-1 PositionDescription](#positiondescription), [8-1 EditHistory](#edithistory)

### 1-2 SystemConfig

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `key` | String | * |  |  |
| `value` | String | * |  |  |

## 2. RBAC

### 2-1 Resource

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF |  |
| `key` | String | * |  |  |
| `name` | String | * |  |  |
| `description` | String |  |  |  |
| `level` | Int | * |  | 1=父权限(无parentId), 2+=子权限 |
| `sortOrder` | Int | * |  |  |
| `parentId` | Int |  | FK | 上级资源（level≥2时必填） |

→ Depends on: [2-1 Resource](#resource)

← Referenced by: [2-3 UserResourceRole](#userresourcerole), [2-4 PositionResourceRole](#positionresourcerole), [2-5 DepartmentResourceRole](#departmentresourcerole)

### 2-2 Role

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF |  |
| `key` | String | * |  | "access" | "read" | "write" | "delete" | "admin" |
| `name` | String | * |  |  |
| `description` | String |  |  |  |
| `sortOrder` | Int | * |  |  |

← Referenced by: [2-3 UserResourceRole](#userresourcerole), [2-4 PositionResourceRole](#positionresourcerole), [2-5 DepartmentResourceRole](#departmentresourcerole)

### 2-3 UserResourceRole

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  |  |
| `userId` | Int | * | PK | → User.id |
| `resourceId` | Int | * | PK | → Resource.id |
| `roleId` | Int | * | PK | → Role.id |
| `scopeId` | String |  | PK | null=全局, 有值=范围实例 |

→ Depends on: [1-1 User](#user), [2-1 Resource](#resource), [2-2 Role](#role)

### 2-4 PositionResourceRole

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  |  |
| `positionId` | Int | * | PK | → Position.id |
| `resourceId` | Int | * | PK | → Resource.id |
| `roleId` | Int | * | PK | → Role.id |
| `scopeId` | String |  | PK |  |

→ Depends on: [5-5 Position](#position), [2-1 Resource](#resource), [2-2 Role](#role)

### 2-5 DepartmentResourceRole

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  |  |
| `departmentId` | Int | * | PK | → Department.id |
| `resourceId` | Int | * | PK | → Resource.id |
| `roleId` | Int | * | PK | → Role.id |
| `scopeId` | String |  | PK |  |

→ Depends on: [5-4 Department](#department), [2-1 Resource](#resource), [2-2 Role](#role)

## 3. Reports

### 3-1 Report

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF | 主键 |
| `userId` | Int |  | PK | 用户ID |
| `targetType` | String | * | PK | "department" | "project" | "position" |
| `targetId` | Int | * | PK | 多态 FK → Department.id | Project.id | Position.id |
| `date` | String | * | PK | 日期（yyyy-MM-dd，日报=当天，周报=周一，月报=月初） |
| `taskName` | String | * |  | 任务名称 |
| `notes` | String |  |  | 备注 |
| `version` | Int | * |  | 版本号 |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime | * |  | 更新时间 |

→ Depends on: [1-1 User](#user)

← Referenced by: [3-2 ReportItem](#reportitem), [3-3 ReportHistory](#reporthistory)

### 3-2 ReportItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  | 主键 |
| `reportId` | Int | * | FK | 周报ID |
| `category` | String | * |  | 分类 |
| `plan` | String | * |  | 本周计划 |
| `completion` | String |  |  | 完成情况 |
| `nextGoal` | String |  |  | 下周目标 |
| `sortOrder` | Int | * |  | 排序序号 |
| `workItemId` | Int |  | FK | 关联工作清单条目ID |

→ Depends on: [4-1 WorkItem](#workitem), [3-1 Report](#report)

### 3-3 ReportHistory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  | 主键 |
| `reportId` | Int | * | PK | 周报ID |
| `version` | Int | * | PK | 版本号 |
| `taskName` | String | * |  | 任务名称 |
| `notes` | String |  |  | 备注 |
| `itemsJson` | String | * |  | 条目JSON快照 |
| `createdAt` | DateTime | * |  | 创建时间 |

→ Depends on: [3-1 Report](#report)

## 4. Tasks

### 4-1 WorkItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF | 主键 |
| `targetType` | String | * |  | "project" | "department" | "position" | "personal" |
| `targetId` | Int |  |  | 多态 FK |
| `category` | String | * |  | 分类 |
| `content` | String | * |  | 内容 |
| `importance` | Int | * |  | 重要度（1-5） |
| `urgency` | Int | * |  | 紧急度（1-5） |
| `isArchived` | Boolean | * |  | 是否归档 |
| `isPrivate` | Boolean | * |  | personal 时默认仅自己可见 |
| `sortOrder` | Int | * |  | 排序序号 |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime | * |  | 更新时间 |

← Referenced by: [3-2 ReportItem](#reportitem), [4-2 WorkParticipant](#workparticipant)

### 4-2 WorkParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  | 主键 |
| `workItemId` | Int | * | FK | 关联工作清单条目ID |
| `name` | String | * |  | 名称 |
| `wxUserId` | String |  |  | 微信用户ID |
| `createdAt` | DateTime | * |  | 创建时间 |

→ Depends on: [4-1 WorkItem](#workitem)

## 5. Roster & Org

### 5-1 Employee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF | 主键 |
| `employeeId` | String | * |  | 员工编号 |
| `name` | String | * |  | 名称 |
| `alias` | String |  |  | 别名 |
| `gender` | String |  |  | 性别 |
| `ethnicity` | String |  |  | 民族 |
| `hometown` | String |  |  | 籍贯 |
| `politics` | String |  |  | 政治面貌 |
| `education` | String |  |  | 学历 |
| `title` | String |  |  | 职称 |
| `school` | String |  |  | 毕业院校 |
| `major` | String |  |  | 专业 |
| `phone` | String |  |  | 电话 |
| `joinDate` | String |  |  | 进司时间 |
| `nature` | String |  |  | 性质（全职/兼职等） |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime | * |  | 更新时间 |
| `leaveDate` | String |  |  | 离职日期 |
| `status` | String |  |  | 状态 |
| `deleted` | Boolean |  |  | 是否软删除 |
| `deletedTime` | String |  |  | 删除时间 |
| `deletedBy` | String |  |  | 删除操作人 |
| `userId` | Int |  | FK | 用户ID |
| `editedBy` | Int |  | FK | 编辑人用户ID |
| `editedAt` | DateTime |  |  | 编辑时间 |
| `version` | Int | * |  | 版本号 |

→ Depends on: [1-1 User](#user), [1-1 User](#user)

← Referenced by: [5-6 EmployeePosition](#employeeposition), [5-8 EmployeeProject](#employeeproject)

### 5-2 Company

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF | 主键 |
| `code` | String | * |  | 编码 |
| `name` | String | * |  | 名称 |
| `fullName` | String |  |  | 全称 |
| `registeredCapital` | String |  |  | 注册资本 |
| `unifiedCode` | String |  |  | 统一社会信用代码 |
| `bankName` | String |  |  | 开户行 |
| `registeredAddress` | String |  |  | 办公地址 |
| `registeredDate` | String |  |  | 注册时间 |
| `legalPerson` | String |  |  | 法定代表人 |
| `managementGroup` | String |  |  | 管理体系（丰华生物体系/丰华制药） |
| `sortOrder` | Int | * |  | 排序 |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime |  |  | 更新时间 |
| `editedBy` | Int |  | FK | 编辑人用户ID |
| `editedAt` | DateTime |  |  | 编辑时间 |
| `version` | Int | * |  | 版本号 |

→ Depends on: [1-1 User](#user)

← Referenced by: [5-3 CompanyRelation](#companyrelation), [5-3 CompanyRelation](#companyrelation)

### 5-3 CompanyRelation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  |  |
| `parentId` | Int | * | PK | 持股方 |
| `childId` | Int | * | PK | 被持股方 |
| `shareRatio` | Float |  |  | 持股比例 |
| `isConsolidated` | Boolean | * |  | 是否并表 |

→ Depends on: [5-2 Company](#company), [5-2 Company](#company)

### 5-4 Department

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF | 主键 |
| `code` | String | * |  | 编码 |
| `name` | String | * |  | 名称 |
| `level` | Int | * |  | 层级 |
| `parentId` | Int |  | FK | 上级ID |
| `managerUserId` | Int |  | FK | 负责人 → User.id |
| `managementGroup` | String | * |  | 管理体系（丰华生物体系/丰华制药） |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime |  |  | 更新时间 |
| `editedBy` | Int |  | FK | 编辑人用户ID |
| `editedAt` | DateTime |  |  | 编辑时间 |
| `version` | Int | * |  | 版本号 |

→ Depends on: [5-4 Department](#department), [1-1 User](#user), [1-1 User](#user)

← Referenced by: [2-5 DepartmentResourceRole](#departmentresourcerole), [5-5 Position](#position), [5-6 EmployeePosition](#employeeposition)

### 5-5 Position

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF | 主键 |
| `code` | String | * |  | 编码 |
| `name` | String | * |  | 名称 |
| `managementGroup` | String | * |  | 管理体系（丰华生物体系/丰华制药） |
| `departmentId` | Int |  | FK | 所属部门 |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime |  |  | 更新时间 |
| `editedBy` | Int |  | FK | 编辑人用户ID |
| `editedAt` | DateTime |  |  | 编辑时间 |
| `version` | Int | * |  | 版本号 |

→ Depends on: [5-4 Department](#department), [1-1 User](#user)

← Referenced by: [2-4 PositionResourceRole](#positionresourcerole), [5-6 EmployeePosition](#employeeposition)

### 5-6 EmployeePosition

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  | 主键 |
| `employeeId` | Int | * | PK | 员工编号 |
| `departmentId` | Int | * | PK | 部门ID |
| `positionId` | Int | * | PK | 岗位ID |
| `managementGroup` | String |  |  | 管理体系（丰华生物体系/丰华制药） |
| `center` | String |  |  | 中心 |
| `isPrimary` | Boolean | * |  | 是否主岗 |
| `sortOrder` | Int | * |  | 排序序号 |
| `startDate` | String |  |  | 任职开始日期 |
| `endDate` | String |  |  | 任职结束日期（null=至今） |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime |  |  | 更新时间 |
| `editedBy` | Int |  | FK | 编辑人用户ID |
| `editedAt` | DateTime |  |  | 编辑时间 |
| `version` | Int | * |  | 版本号 |

→ Depends on: [5-1 Employee](#employee), [5-4 Department](#department), [5-5 Position](#position), [1-1 User](#user)

### 5-7 Project

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF | 主键 |
| `name` | String | * |  | 项目名称 |
| `type` | String | * |  | "department" | "project" |
| `description` | String |  |  | 说明 |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime |  |  | 更新时间 |
| `editedBy` | Int |  | FK | 编辑人用户ID |
| `editedAt` | DateTime |  |  | 编辑时间 |
| `version` | Int | * |  | 版本号 |

→ Depends on: [1-1 User](#user)

← Referenced by: [5-8 EmployeeProject](#employeeproject)

### 5-8 EmployeeProject

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  | 主键 |
| `employeeId` | Int | * | PK | 员工ID |
| `projectId` | Int | * | PK | 项目ID |
| `role` | String |  |  | 项目角色 |
| `startDate` | String |  |  | 开始日期 |
| `endDate` | String |  |  | 结束日期 |
| `createdAt` | DateTime | * |  | 创建时间 |
| `updatedAt` | DateTime |  |  | 更新时间 |
| `editedBy` | Int |  | FK | 编辑人用户ID |
| `editedAt` | DateTime |  |  | 编辑时间 |
| `version` | Int | * |  | 版本号 |

→ Depends on: [5-1 Employee](#employee), [5-7 Project](#project), [1-1 User](#user)

## 制药岗位说明书

### 6-1 PositionDescription

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | REF |  |
| `code` | String | * |  | 岗位编号（如 0101，去PPA-GW前缀） |
| `name` | String | * |  | 岗位名称 |
| `positionName` | String |  |  | 岗位名称（关联 Position.name） |
| `departmentName` | String |  |  | 所属部门名称 |
| `purpose` | String |  |  | 文档目的 |
| `scope` | String |  |  | 适用范围 |
| `reportTo` | String |  |  | 直接上级 |
| `subordinates` | String |  |  | 直接下级 |
| `headcount` | Int |  |  | 岗位编制人数 |
| `positionPurpose` | String |  |  | 岗位目的 |
| `summary` | String |  |  | 岗位职责概要 |
| `dutyOverview` | String |  |  | 职责概述 |
| `externalCollaboration` | String |  |  | 外部协作关系 |
| `qualificationsJson` | String |  |  | 任职资质 JSON |
| `conditionsJson` | String |  |  | 工作条件 JSON |
| `documentSource` | String | * |  | 原文件名 |
| `documentNumber` | String |  |  | 文档编号 |
| `version` | String |  |  | 版本号 |
| `effectiveDate` | String |  |  | 生效日期 |
| `drafter` | String |  |  | 起草人 |
| `reviewer1` | String |  |  | 审核人1 |
| `reviewer2` | String |  |  | 审核人2 |
| `approver` | String |  |  | 批准人 |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |

→ Depends on: [1-1 User](#user)

← Referenced by: [6-2 PositionDuty](#positionduty), [6-3 PositionChangeHistory](#positionchangehistory)

### 6-2 PositionDuty

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  |  |
| `positionDescriptionId` | Int | * | FK | → PositionDescription.id |
| `content` | String | * |  |  |
| `sortOrder` | Int | * |  |  |

→ Depends on: [6-1 PositionDescription](#positiondescription)

### 6-3 PositionChangeHistory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  |  |
| `positionDescriptionId` | Int | * | FK | → PositionDescription.id |
| `version` | String | * |  |  |
| `documentName` | String |  |  |  |
| `effectiveDate` | String |  |  |  |
| `approver` | String |  |  |  |
| `sortOrder` | Int | * |  |  |

→ Depends on: [6-1 PositionDescription](#positiondescription)

## 丰华制药花名册导入

### 7-1 PharmaRoster

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  |  |
| `isNew` | Boolean | * |  |  |
| `source` | String | * |  | 在职 | 离职 |
| `sequence` | Int |  |  | 序号 |
| `subSequence` | Int |  |  | 分序号 |
| `nature` | String |  |  | 性质 |
| `platform` | String |  |  | 事业部/职能平台 |
| `name` | String | * |  | 姓名 |
| `isResearch` | String |  |  | 科技研发 |
| `personnelType` | String |  |  | 人员类型 |
| `department` | String |  |  | 部门 |
| `position` | String |  |  | 职务/岗位（新） |
| `primaryPosition` | String |  |  | 主要岗位 |
| `secondaryPosition` | String |  |  | 次要岗位 |
| `rank` | String |  |  | 职级 |
| `employeeNumber` | String |  |  | 编号 |
| `hometown` | String |  |  | 籍贯 |
| `idNumber` | String |  |  | 身份证号码 |
| `politicsStatus` | String |  |  | 政治面貌 |
| `ethnicity` | String |  |  | 民族 |
| `education` | String |  |  | 学历 |
| `school` | String |  |  | 毕业院校 |
| `major` | String |  |  | 专业 |
| `majorRelevant` | String |  |  | 是否相关专业 |
| `title` | String |  |  | 职称 |
| `companyTitle` | String |  |  | 职称（公司评定） |
| `phone` | String |  |  | 电话 |
| `gender` | String |  |  | 性别 |
| `birthDate` | String |  |  | 出生年月 |
| `birthMonth` | String |  |  | 生日月份 |
| `age` | Int |  |  | 年龄 |
| `retireDate` | String |  |  | 退休日期 |
| `workStartDate` | String |  |  | 参加工作时间 |
| `joinDate` | String |  |  | 进司时间 |
| `serviceYears` | String |  |  | 司龄 |
| `serviceYearsNum` | Int |  |  | 司龄（年） |
| `leaveDate` | String |  |  | 离职时间 |
| `tenureAtCompany` | String |  |  | 在职时间 |
| `originalRow` | String |  |  | 原始行JSON（保留完整数据） |
| `createdAt` | DateTime | * |  |  |

## 6. Edit History

### 8-1 EditHistory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * |  | 主键 |
| `entityType` | String | * | PK | "employee" | "employee_position" | "code_department" | "code_position" |
| `entityId` | String | * | PK | 实体主键 |
| `version` | Int | * | PK | 版本号 |
| `dataJson` | String | * |  | 编辑前快照 |
| `editedBy` | Int | * | FK | 编辑人用户ID |
| `createdAt` | DateTime | * |  | 创建时间 |

→ Depends on: [1-1 User](#user)
