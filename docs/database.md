# 数据库表结构

> 本文档由 `scripts/gen-db-docs.js` 自动生成，基于 `prisma/schema.prisma`。

## 模型列表

### User

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| wxUserId | String? | @unique | 微信用户ID（无微信则留空） |
| username | String? | @unique | 登录用户名（自取） |
| password | String? | - | 登录密码 |
| name | String | - | 名称 |
| avatar | String? | - | 头像URL |
| routineItems | String? | - | 日常工作模板JSON |
| canLogin | Boolean | @default(true) | 离职=停用，不删号（账号状态，非权限） |
| apiKey | String? | @unique | API密钥 |
| employeeId | String? | - | 关联员工编号 |
| createdAt | DateTime | @default(now()) | 创建时间 |
| resourceRoles | UserResourceRole[] | - |  |
| reports | Report[] | - |  |
| employees | Employee[] | @relation("EmployeeUser") |  |
| managedDepartments | Department[] | @relation("DepartmentManager") |  |
| editHistories | EditHistory[] | @relation("EditHistoryEditor") |  |
| editedFinanceAccounts | FinanceAccount[] | @relation("FinanceAccountEditor") |  |
| editedFinanceVouchers | FinanceVoucher[] | @relation("FinanceVoucherEditor") |  |
| editedStockRawMaterials | StockRawMaterial[] | @relation("StockRawMaterialEditor") |  |
| editedStockPackagings | StockPackaging[] | @relation("StockPackagingEditor") |  |
| editedStockFinishedGoods | StockFinishedGoods[] | @relation("StockFinishedGoodsEditor") |  |
| stockOperations | StockOperation[] | @relation("StockOperationEditor") |  |
| editedContracts | Contract[] | @relation("ContractEditor") |  |

### SystemConfig

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| key | String | @id | 配置键 |
| value | String | - | 配置值 |

### Resource

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| key | String | @unique | 资源标识 |
| name | String | - | 资源名称 |
| description | String? | - | 资源描述 |
| level | Int | @default(1) | 1=父权限(无parentId), 2+=子权限 |
| sortOrder | Int | @default(0) | 排序序号 |
| parentId | Int? | - | 上级资源（level≥2时必填） |
| parent | Resource? | @relation("ResHierarchy", fields: [parentId], references: [id]) |  |
| children | Resource[] | @relation("ResHierarchy") |  |
| userRoles | UserResourceRole[] | - |  |
| positionRoles | PositionResourceRole[] | - |  |
| departmentRoles | DepartmentResourceRole[] | - |  |

### Role

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| key | String | @unique | "access" | "read" | "write" | "delete" | "admin" |
| name | String | - | 角色名称 |
| description | String? | - | 角色描述 |
| sortOrder | Int | @default(0) | 排序序号 |
| userAssignments | UserResourceRole[] | - |  |
| positionAssignments | PositionResourceRole[] | - |  |
| departmentAssignments | DepartmentResourceRole[] | - |  |

### UserResourceRole

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| userId | Int | - | 用户ID |
| resourceId | Int | - | 资源ID |
| roleId | Int | - | 角色ID |
| scopeId | String? | - | null=全局, 有值=范围实例 |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| role | Role | @relation(fields: [roleId], references: [id], onDelete: Cascade) |  |

### PositionResourceRole

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| positionId | Int | - | 岗位ID |
| resourceId | Int | - | 资源ID |
| roleId | Int | - | 角色ID |
| scopeId | String? | - | null=全局, 有值=范围实例 |
| position | Position | @relation(fields: [positionId], references: [id], onDelete: Cascade) |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| role | Role | @relation(fields: [roleId], references: [id], onDelete: Cascade) |  |

### DepartmentResourceRole

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| departmentId | Int | - | 部门ID |
| resourceId | Int | - | 资源ID |
| roleId | Int | - | 角色ID |
| scopeId | String? | - | null=全局, 有值=范围实例 |
| department | Department | @relation(fields: [departmentId], references: [id], onDelete: Cascade) |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| role | Role | @relation(fields: [roleId], references: [id], onDelete: Cascade) |  |

### Report

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| userId | Int? | - | 用户ID |
| targetType | String | @default("department") | "department" | "project" | "position" |
| targetId | Int | @default(0) | 多态 FK → Department.id | Project.id | Position.id |
| date | String | - | 日期（yyyy-MM-dd，日报=当天，周报=周一，月报=月初） |
| taskName | String | - | 任务名称 |
| notes | String? | - | 备注 |
| history | ReportHistory[] | - |  |
| items | ReportItem[] | - |  |
| user | User? | @relation(fields: [userId], references: [id]) |  |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### ReportItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| reportId | Int | - | 周报ID |
| category | String | - | 分类 |
| plan | String | - | 本周计划 |
| completion | String? | - | 完成情况 |
| nextGoal | String? | - | 下周目标 |
| sortOrder | Int | - | 排序序号 |
| workItemId | Int? | - | 关联工作清单条目ID |
| workItem | WorkItem? | @relation(fields: [workItemId], references: [id]) |  |
| report | Report | @relation(fields: [reportId], references: [id], onDelete: Cascade) |  |

### ReportHistory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| reportId | Int | - | 周报ID |
| version | Int | - | 版本号 |
| taskName | String | - | 任务名称 |
| notes | String? | - | 备注 |
| itemsJson | String | - | 条目JSON快照 |
| createdAt | DateTime | @default(now()) | 创建时间 |
| report | Report | @relation(fields: [reportId], references: [id], onDelete: Cascade) |  |

### WorkItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| targetType | String | @default("personal") | "project" | "department" | "position" | "personal" |
| targetId | Int? | - | 多态 FK |
| category | String | - | 分类 |
| content | String | - | 内容 |
| importance | Int | @default(3) | 重要度（1-5） |
| urgency | Int | @default(3) | 紧急度（1-5） |
| isArchived | Boolean | @default(false) | 是否归档 |
| isPrivate | Boolean | @default(false) | personal 时默认仅自己可见 |
| sortOrder | Int | @default(0) | 排序序号 |
| createdAt | DateTime | @default(now()) | 创建时间 |
| participants | WorkParticipant[] | - |  |
| reportItems | ReportItem[] | - |  |

### WorkParticipant

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| workItemId | Int | - | 关联工作清单条目ID |
| name | String | - | 名称 |
| wxUserId | String? | - | 微信用户ID |
| createdAt | DateTime | @default(now()) | 创建时间 |
| workItem | WorkItem | @relation(fields: [workItemId], references: [id], onDelete: Cascade) |  |

### Employee

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| employeeId | String | @unique | 员工编号 |
| idNumber | String? | @unique | 身份证号 |
| otherId | String? | - | 其他证件号 |
| name | String | - | 名称 |
| alias | String? | - | 别名 |
| gender | Boolean? | - | 性别（是否男） |
| birthDate | String? | - | 出生年月 |
| ethnicity | String? | - | 民族 |
| hometown | String? | - | 籍贯 |
| politics | String? | - | 政治面貌 |
| education | String? | - | 学历 |
| title | String? | - | 职称 |
| school | String? | - | 毕业院校 |
| major | String? | - | 专业 |
| phone | String? | - | 电话 |
| workStartDate | String? | - | 参加工作时间 |
| userId | Int? | - | 用户ID |
| user | User? | @relation("EmployeeUser", fields: [userId], references: [id]) |  |
| employments | Employment[] | - |  |
| positions | EDP[] | - |  |
| projects | EmployeeProject[] | - |  |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### Employment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| employeeId | Int | - | 员工ID |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |
| isActive | Boolean | @default(true) | 是否在职 |
| currentCompany | String? | - | 当前所属公司 |
| joinDate | String? | - | 入职日期 |
| leaveDate | String? | - | 离职日期 |
| leaveReason | String? | - | 离职原因 |
| officeLocation | String? | - | 办公地点 |
| attendanceType | String? | - | 考勤类型 |
| contracts | String? | - | 合同记录列表 JSON |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### Company

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| code | String | @unique | 编码 |
| name | String | @unique | 名称 |
| fullName | String? | - | 全称 |
| registeredCapital | String? | - | 注册资本 |
| unifiedCode | String? | - | 统一社会信用代码 |
| bankName | String? | - | 开户行 |
| registeredAddress | String? | - | 办公地址 |
| registeredDate | String? | - | 注册时间 |
| legalPerson | String? | - | 法定代表人 |
| queryGroup | Int? | - | 1=丰华生物体系, 2=丰华制药 |
| sortOrder | Int | @default(0) | 排序 |
| parentOfRelations | CompanyRelation[] | @relation("ParentCompany") |  |
| childOfRelations | CompanyRelation[] | @relation("ChildCompany") |  |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### CompanyRelation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| parentId | Int | - | 持股方 |
| childId | Int | - | 被持股方 |
| parent | Company | @relation("ParentCompany", fields: [parentId], references: [id], onDelete: Cascade) |  |
| child | Company | @relation("ChildCompany", fields: [childId], references: [id], onDelete: Cascade) |  |
| shareRatio | Float? | - | 持股比例 |
| isConsolidated | Boolean | @default(false) | 是否并表 |

### Department

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| code | String | - | 编码 |
| name | String | - | 名称 |
| alias | String? | - | 别名 |
| level | Int | @default(1) | 层级：1=事业部，2=部门，3=子部门 |
| parentId | Int? | - | 上级ID |
| parent | Department? | @relation("DeptHierarchy", fields: [parentId], references: [id]) |  |
| children | Department[] | @relation("DeptHierarchy") |  |
| managerUserId | Int? | - | 负责人 → User.id |
| manager | User? | @relation("DepartmentManager", fields: [managerUserId], references: [id]) |  |
| positions | Position[] | - | 岗位（1:N） |
| edps | EDP[] | - |  |
| resourceRoles | DepartmentResourceRole[] | - |  |
| endDate | DateTime? | - | 截止时间（null=至今） |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### Position

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| code | String | - | 编码 |
| alias | String? | - | 别名 |
| name | String | - | 名称 |
| departmentId | Int? | - | 所属部门 |
| department | Department? | @relation(fields: [departmentId], references: [id], onDelete: SetNull) |  |
| positionDescriptionId | Int? | - | → PositionDescription.id |
| positionDescription | PositionDescription? | @relation(fields: [positionDescriptionId], references: [id], onDelete: SetNull) |  |
| edps | EDP[] | - |  |
| resourceRoles | PositionResourceRole[] | - |  |
| endDate | DateTime? | - | 截止时间（null=至今） |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### EDP

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| employeeId | Int | - | 员工编号 |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |
| departmentId | Int? | - | 部门ID |
| department | Department? | @relation(fields: [departmentId], references: [id]) |  |
| positionId | Int? | - | 岗位ID |
| position | Position? | @relation(fields: [positionId], references: [id]) |  |
| isPrimary | Boolean | @default(false) | 是否主岗 |
| startDate | String? | - | 任职开始日期 |
| endDate | String? | - | 任职结束日期（null=至今） |
| personnelType | String? | - | 人员类型 |
| rank | String? | - | 职级 |
| title | String? | - | 职称 |
| reportTo | String? | - | 直接上级 |
| reportTo2 | String? | - | 第二汇报线 |
| workPercent | String? | - | 工作占比 |
| isResearch | Boolean? | - | 是否研发 |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### Project

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| name | String | - | 项目名称 |
| type | String | @default("project") | "department" | "project" |
| description | String? | - | 说明 |
| endDate | DateTime? | - | 截止时间（null=至今） |
| employees | EmployeeProject[] | - |  |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### EmployeeProject

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| employeeId | Int | - | 员工ID |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |
| projectId | Int | - | 项目ID |
| project | Project | @relation(fields: [projectId], references: [id], onDelete: Cascade) |  |
| role | String? | - | 项目角色 |
| startDate | String? | - | 开始日期 |
| endDate | String? | - | 结束日期 |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |
| version | Int | @default(1) | 版本号 |

### PositionDescription

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| code | String | @unique | PPA-GW0101 |
| name | String | - | 岗位名称 |
| departmentName | String? | - | 所属部门 |
| reportTo | String? | - | 直接上级 |
| positionPurpose | String? | - | 岗位目的（一句话） |
| summary | String? | - | 职责概要（一段话） |
| headcount | Int? | - | 编制人数 |
| version | String? | - | 版本号 |
| effectiveDate | String? | - | 生效日期 |
| sourceFile | String | - | 原始JSON文件名 |
| details | String? | - | 岗位详细信息 JSON |
| positions | Position[] | - | 关联岗位 |
| editedBy | Int? | - | 编辑人用户ID |
| editedAt | DateTime? | - | 编辑时间 |

### EditHistory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| entityType | String | - | Prisma 模型名（如 Employee, Employment, Department...） |
| entityId | String | - | 实体主键 |
| version | Int | - | 版本号 |
| dataJson | String | - | 编辑后快照 |
| editedBy | Int | - | 编辑人用户ID |
| editor | User | @relation("EditHistoryEditor", fields: [editedBy], references: [id]) |  |
| tag | String? | - | V0 日期标签: "2026-05-24"，null=普通编辑版本 |
| createdAt | DateTime | @default(now()) | 创建时间 |

### LoginAttempt

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| username | String | - | 尝试登录的用户名 |
| ip | String | - | 客户端IP |
| success | Boolean | - | 是否成功 |
| createdAt | DateTime | @default(now()) | 创建时间 |

### FinanceAccount

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique | 科目编码，如 1001 |
| name | String | - | 科目名称 |
| category | String | - | asset/liability/equity/cost/revenue |
| parentId | Int? | - |  |
| parent | FinanceAccount? | @relation("AccountHierarchy", fields: [parentId], references: [id]) |  |
| children | FinanceAccount[] | @relation("AccountHierarchy") |  |
| balanceDirection | String | @default("debit") | debit/credit |
| isActive | Boolean | @default(true) |  |
| companyCode | String? | - | null=通用 |
| sortOrder | Int | @default(0) |  |
| voucherItems | FinanceVoucherItem[] | - |  |
| balances | FinanceAccountBalance[] | - |  |
| editedBy | Int? | - |  |
| editor | User? | @relation("FinanceAccountEditor", fields: [editedBy], references: [id]) |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |

### FinancePeriod

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| year | Int | - |  |
| month | Int | - |  |
| startDate | String | - |  |
| endDate | String | - |  |
| isClosed | Boolean | @default(false) |  |
| companyCode | String? | - |  |
| vouchers | FinanceVoucher[] | - |  |
| balances | FinanceAccountBalance[] | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |

### FinanceVoucher

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| voucherNo | String | @unique | 凭证号，如 V202501001 |
| date | String | - | 凭证日期 yyyy-MM-dd |
| periodId | Int | - |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| description | String | - | 摘要 |
| totalDebit | Float | @default(0) |  |
| totalCredit | Float | @default(0) |  |
| status | String | @default("draft") | draft/posted |
| companyCode | String? | - |  |
| items | FinanceVoucherItem[] | - |  |
| editedBy | Int? | - |  |
| editor | User? | @relation("FinanceVoucherEditor", fields: [editedBy], references: [id]) |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |

### FinanceVoucherItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| voucherId | Int | - |  |
| voucher | FinanceVoucher | @relation(fields: [voucherId], references: [id], onDelete: Cascade) |  |
| accountId | Int | - |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |
| debit | Float | @default(0) |  |
| credit | Float | @default(0) |  |
| description | String? | - |  |
| sortOrder | Int | @default(0) |  |

### FinanceAccountBalance

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| accountId | Int | - |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |
| periodId | Int | - |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| openingDebit | Float | @default(0) |  |
| openingCredit | Float | @default(0) |  |
| currentDebit | Float | @default(0) |  |
| currentCredit | Float | @default(0) |  |
| closingDebit | Float | @default(0) |  |
| closingCredit | Float | @default(0) |  |
| companyCode | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |

### StockRawMaterial

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| spec | String? | - |  |
| unit | String | @default("kg") |  |
| manufacturer | String? | - |  |
| status | String | @default("正常") | 正常/暂未生产/待验证 |
| lastBalance | Float | @default(0) |  |
| currentPurchase | Float | @default(0) |  |
| currentConsume | Float | @default(0) |  |
| remark | String? | - |  |
| companyCode | String? | - |  |
| editedBy | Int? | - |  |
| editor | User? | @relation("StockRawMaterialEditor", fields: [editedBy], references: [id]) |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |

### StockPackaging

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| spec | String? | - |  |
| unit | String | @default("卷") |  |
| packagingType | String | @default("小容量") | 小容量/片剂包装 |
| status | String | @default("正常") | 正常/待检/不合格 |
| lastBalance | Float | @default(0) |  |
| currentInbound | Float | @default(0) |  |
| currentOutbound | Float | @default(0) |  |
| batchNo | String? | - |  |
| expiryDate | String? | - |  |
| remark | String? | - |  |
| companyCode | String? | - |  |
| editedBy | Int? | - |  |
| editor | User? | @relation("StockPackagingEditor", fields: [editedBy], references: [id]) |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |

### StockFinishedGoods

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| packagingSpec | String? | - |  |
| unit | String | @default("件") |  |
| stockType | String | @default("正常库存") | 正常库存/退货/验证产品 |
| lastBalance | Float | @default(0) |  |
| currentInbound | Float | @default(0) |  |
| currentOutbound | Float | @default(0) |  |
| availableStock | Float | @default(0) |  |
| remark | String? | - |  |
| companyCode | String? | - |  |
| editedBy | Int? | - |  |
| editor | User? | @relation("StockFinishedGoodsEditor", fields: [editedBy], references: [id]) |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |

### StockBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| targetType | String | - | raw_material / packaging / finished_goods |
| targetId | Int | - |  |
| batchNo | String | - |  |
| quantity | Float | @default(0) |  |
| expiryDate | String? | - |  |
| status | String | @default("正常") |  |
| remark | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |

### StockOperation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| opType | String | - | purchase / inbound / outbound / consume / adjust / return |
| targetType | String | - | raw_material / packaging / finished_goods |
| targetId | Int | - |  |
| quantity | Float | @default(0) |  |
| docNo | String? | - |  |
| reason | String? | - |  |
| operatorId | Int? | - |  |
| editor | User? | @relation("StockOperationEditor", fields: [operatorId], references: [id]) |  |
| createdAt | DateTime | @default(now()) |  |

### StockReturn

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| finishedGoodsId | Int | - |  |
| returnDate | String | - |  |
| quantity | Float | @default(0) |  |
| salesman | String? | - |  |
| reason | String? | - |  |
| createdAt | DateTime | @default(now()) |  |

### Contract

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| contractNo | String? | - | 合同编号 |
| name | String | - | 合同名称 |
| partyA | String? | - | 签署方（甲方） |
| partyB | String? | - | 签署对方（乙方） |
| shareholder | String? | - | 股东方 |
| category | String? | - | 合同类型/分类 |
| content | String? | - | 合同内容 |
| handler | String? | - | 经办人 |
| signDate | String? | - | 签订日期 |
| endDate | String? | - | 结束日期 |
| status | String? | - | 状态 |
| amount | Float? | - | 合同金额 |
| executedAmount | Float? | - | 已执行金额 |
| location | String? | - | 文件位置（北京办公区/上海办公区） |
| remark | String? | - | 备注 |
| editedBy | Int? | - |  |
| editor | User? | @relation("ContractEditor", fields: [editedBy], references: [id]) |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |


### AgentProposal

> Agent 待确认变更审计记录

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) | 主键 |
| userId | Int | - | 发起用户ID |
| status | String | @default("pending") | pending/confirmed/cancelled/failed/expired |
| actionKey | String | - | 工具key，如 hr.updateEmployee |
| targetType | String | - | 目标实体，如 Employee |
| targetId | String? | - | 目标记录标识 |
| payloadJson | String | - | 变更内容JSON |
| diffJson | String? | - | 变更前后对比JSON |
| resultJson | String? | - | 执行结果JSON |
| createdAt | DateTime | @default(now()) | 创建时间 |
| confirmedAt | DateTime? | - | 确认时间 |
