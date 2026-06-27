# 数据库表结构

> 本文档由 `scripts/generate/gen-db-docs.js` 自动生成，基于 `prisma/models/*.prisma`。

## 模型列表

### AgentProposal

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| userId | Int | - |  |
| status | String | @default("pending") | pending | confirmed | cancelled | failed |
| actionKey | String | - | 工具 key，如 hr.updateEmployee |
| targetType | String | - | 目标实体，如 Employee |
| targetId | String? | - | 目标记录标识 |
| payloadJson | String | - | 变更内容 JSON |
| diffJson | String? | - | 变更前后对比 JSON |
| resultJson | String? | - | 执行结果 JSON |
| createdAt | DateTime | @default(now()) |  |
| confirmedAt | DateTime? | - |  |

### User

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| wxUserId | String? | @unique |  |
| username | String? | @unique |  |
| password | String? | - |  |
| nickname | String | - |  |
| avatar | String? | - |  |
| routineItems | String? | - |  |
| canLogin | Boolean | @default(true) |  |
| apiKey | String? | @unique |  |
| employeeId | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| sessionVersion | Int | @default(0) |  |
| editedContracts | Contract[] | @relation("ContractEditor") |  |
| managedDepartments | Department[] | @relation("DepartmentManager") |  |
| editHistories | EditHistory[] | @relation("EditHistoryEditor") |  |
| employees | Employee[] | @relation("EmployeeUser") |  |
| editedFinanceAccounts | FinanceAccount[] | @relation("FinanceAccountEditor") |  |
| editedFinanceVouchers | FinanceVoucher[] | @relation("FinanceVoucherEditor") |  |
| editedStockFinishedGoods | StockFinishedGoods[] | @relation("StockFinishedGoodsEditor") |  |
| stockOperations | StockOperation[] | @relation("StockOperationEditor") |  |
| editedStockPackagings | StockPackaging[] | @relation("StockPackagingEditor") |  |
| editedStockRawMaterials | StockRawMaterial[] | @relation("StockRawMaterialEditor") |  |
| snapshotImports | FinanceBalanceSnapshot[] | @relation("SnapshotImporter") |  |
| snapshotEdits | FinanceBalanceSnapshot[] | @relation("SnapshotEditor") |  |
| editedLibraryDocuments | LibraryDocument[] | @relation("LibraryDocumentEditor") |  |
| resourceRoles | UserResourceRole[] | - |  |
| departmentAssignees | DepartmentWorkAssignee[] | - |  |
| projectAssignees | ProjectWorkAssignee[] | - |  |
| reviewedReclassResults | ReclassResult[] | @relation("ReclassResultReviewer") |  |
| confirmedReclassRules | FinanceReclassRule[] | @relation("FinanceReclassRuleConfirmer") |  |
| ledgerImports | FinanceLedgerImport[] | @relation("FinanceLedgerImportImporter") |  |
| editedWorkpapers | FinanceStatementWorkpaper[] | @relation("WorkpaperEditor") |  |
| editedReviews | FinanceStatementReview[] | @relation("ReviewEditor") |  |
| reviewedReviews | FinanceStatementReview[] | @relation("ReviewReviewer") |  |
| notifications | Notification[] | @relation("NotificationRecipient") |  |
| createdNotifications | Notification[] | @relation("NotificationActor") |  |
| workScopePermissions | WorkScopePermission[] | - |  |

### Resource

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| key | String | @unique |  |
| name | String | - |  |
| description | String? | - |  |
| level | Int | @default(1) |  |
| sortOrder | Int | @default(0) |  |
| parentId | Int? | - |  |
| maxRoleKey | String | @default("admin") |  |
| scopeTypes | String? | - |  |
| scopeInheritanceMode | String | @default("inherit") |  |
| departmentRoles | DepartmentResourceRole[] | - |  |
| positionRoles | PositionResourceRole[] | - |  |
| parent | Resource? | @relation("ResHierarchy", fields: [parentId], references: [id]) |  |
| children | Resource[] | @relation("ResHierarchy") |  |
| userRoles | UserResourceRole[] | - |  |

### Role

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| key | String | @unique |  |
| name | String | - |  |
| description | String? | - |  |
| sortOrder | Int | @default(0) |  |
| departmentAssignments | DepartmentResourceRole[] | - |  |
| positionAssignments | PositionResourceRole[] | - |  |
| userAssignments | UserResourceRole[] | - |  |

### UserResourceRole

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| userId | Int | - |  |
| resourceId | Int | - |  |
| roleId | Int | - |  |
| scopeId | String? | - |  |
| role | Role | @relation(fields: [roleId], references: [id], onDelete: Cascade) |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |  |

### PositionResourceRole

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| positionId | Int | - |  |
| resourceId | Int | - |  |
| roleId | Int | - |  |
| scopeId | String? | - |  |
| role | Role | @relation(fields: [roleId], references: [id], onDelete: Cascade) |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| position | Position | @relation(fields: [positionId], references: [id], onDelete: Cascade) |  |

### DepartmentResourceRole

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| departmentId | Int | - |  |
| resourceId | Int | - |  |
| roleId | Int | - |  |
| scopeId | String? | - |  |
| role | Role | @relation(fields: [roleId], references: [id], onDelete: Cascade) |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| department | Department | @relation(fields: [departmentId], references: [id], onDelete: Cascade) |  |

### Notification

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| recipientUserId | Int | - |  |
| actorUserId | Int? | - |  |
| type | String | - |  |
| title | String | - |  |
| body | String | - |  |
| href | String? | - |  |
| payloadJson | String? | - |  |
| isImportant | Boolean | @default(false) |  |
| isStrongReminder | Boolean | @default(false) |  |
| requiresAcknowledgement | Boolean | @default(false) |  |
| readAt | DateTime? | - |  |
| acknowledgedAt | DateTime? | - |  |
| rejectedAt | DateTime? | - |  |
| clearedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| recipient | User | @relation("NotificationRecipient", fields: [recipientUserId], references: [id], onDelete: Cascade) |  |
| actor | User? | @relation("NotificationActor", fields: [actorUserId], references: [id], onDelete: SetNull) |  |

### Contract

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| contractNo | String? | - |  |
| name | String | - |  |
| partyA | String? | - |  |
| partyB | String? | - |  |
| shareholder | String? | - |  |
| category | String? | - |  |
| content | String? | - |  |
| handler | String? | - |  |
| signDate | String? | - |  |
| endDate | String? | - |  |
| status | String? | - |  |
| amount | Float? | - |  |
| executedAmount | Float? | - |  |
| location | String? | - |  |
| remark | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("ContractEditor", fields: [editedBy], references: [id]) |  |

### FinanceBudgetVersion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| year | Int | - |  |
| companyCode | String? | - |  |
| name | String | - | / 版本名称，如 "2026年初预算"、"2026年调整V1" |
| status | String | - | / draft | active | archived |
| type | String | - | / dept | rd | all，表示本版本包含的预算类型 |
| sourceFile | String? | - |  |
| createdBy | Int? | - | / userId |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| deptBudgets | FinanceBudgetDept[] | - |  |
| rdBudgets | FinanceBudgetRd[] | - |  |

### FinanceBudgetDept

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| versionId | Int | - |  |
| version | FinanceBudgetVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| year | Int | - |  |
| companyCode | String? | - |  |
| dept | String | - |  |
| accountName | String | - |  |
| expenseType | String | - |  |
| accountId | Int? | - |  |
| account | FinanceAccount? | @relation(fields: [accountId], references: [id]) |  |
| total | Float | @default(0) |  |
| month1 | Float | @default(0) |  |
| month2 | Float | @default(0) |  |
| month3 | Float | @default(0) |  |
| month4 | Float | @default(0) |  |
| month5 | Float | @default(0) |  |
| month6 | Float | @default(0) |  |
| month7 | Float | @default(0) |  |
| month8 | Float | @default(0) |  |
| month9 | Float | @default(0) |  |
| month10 | Float | @default(0) |  |
| month11 | Float | @default(0) |  |
| month12 | Float | @default(0) |  |
| sourceFile | String? | - |  |
| importedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### FinanceBudgetRd

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| versionId | Int | - |  |
| version | FinanceBudgetVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| year | Int | - |  |
| companyCode | String? | - |  |
| project | String | - |  |
| category | String | - |  |
| accountId | Int? | - |  |
| account | FinanceAccount? | @relation(fields: [accountId], references: [id]) |  |
| total | Float | @default(0) |  |
| month1 | Float | @default(0) |  |
| month2 | Float | @default(0) |  |
| month3 | Float | @default(0) |  |
| month4 | Float | @default(0) |  |
| month5 | Float | @default(0) |  |
| month6 | Float | @default(0) |  |
| month7 | Float | @default(0) |  |
| month8 | Float | @default(0) |  |
| month9 | Float | @default(0) |  |
| month10 | Float | @default(0) |  |
| month11 | Float | @default(0) |  |
| month12 | Float | @default(0) |  |
| sourceFile | String? | - |  |
| importedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### FinanceDataImport

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| profile | String | - |  |
| year | Int? | - |  |
| sourceFile | String | - |  |
| sourcePath | String? | - |  |
| normalizedJsonPath | String? | - |  |
| checksum | String? | - |  |
| status | String | @default("imported") |  |
| recordCount | Int | @default(0) |  |
| warningCount | Int | @default(0) |  |
| errorCount | Int | @default(0) |  |
| importedBy | String? | - |  |
| importedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| costAnalysisRows | FinanceCostAnalysisRow[] | - |  |
| costStructureRows | FinanceCostStructureRow[] | - |  |
| salesSalaries | FinanceSalesSalary[] | - |  |
| shipments | FinanceShipment[] | - |  |
| workshopReports | FinanceWorkshopReport[] | - |  |

### FinanceShipment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| year | Int | - |  |
| month | Int? | - |  |
| date | String? | - |  |
| customerName | String? | - |  |
| productName | String? | - |  |
| spec | String? | - |  |
| batchNo | String? | - |  |
| quantity | Float? | - |  |
| unitPrice | Float? | - |  |
| amount | Float? | - |  |
| receivedAmount | Float? | - |  |
| employeeId | Int? | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| employee | Employee? | @relation(fields: [employeeId], references: [id]) |  |
| import | FinanceDataImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceSalesSalary

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| year | Int | - |  |
| month | Int? | - |  |
| baseSalary | Float? | - |  |
| bonus | Float? | - |  |
| deduction | Float? | - |  |
| actualSalary | Float? | - |  |
| employeeId | Int? | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| employee | Employee? | @relation(fields: [employeeId], references: [id]) |  |
| import | FinanceDataImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceCostStructureRow

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| year | Int | - |  |
| month | Int? | - |  |
| productName | String? | - |  |
| category | String? | - |  |
| itemName | String? | - |  |
| amount | Float? | - |  |
| quantity | Float? | - |  |
| unit | String? | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| import | FinanceDataImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceCostAnalysisRow

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| year | Int | - |  |
| month | Int? | - |  |
| tableName | String? | - |  |
| rowLabel | String? | - |  |
| metricKey | String? | - |  |
| metricName | String? | - |  |
| value | Float? | - |  |
| textValue | String? | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| import | FinanceDataImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceWorkshopReport

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| year | Int | - |  |
| month | Int | - |  |
| productName | String? | - |  |
| batchNo | String? | - |  |
| workPoint | Float? | - |  |
| quantity | Float? | - |  |
| employeeId | Int? | - |  |
| positionId | Int? | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| position | Position? | @relation(fields: [positionId], references: [id]) |  |
| employee | Employee? | @relation(fields: [employeeId], references: [id]) |  |
| import | FinanceDataImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceAccount

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | - |  |
| name | String | - |  |
| category | String | - |  |
| parentId | Int? | - |  |
| balanceDirection | String | @default("debit") |  |
| isActive | Boolean | @default(true) |  |
| companyCode | String | - |  |
| mnemonicCode | String? | - |  |
| currency | String? | - |  |
| groupSubjectCode | String? | - |  |
| subjectLevel | Int? | - |  |
| year | Int? | - |  |
| sortOrder | Int | @default(0) |  |
| reclassTargetCode | String? | - | @deprecated 重分类目标科目编码（已迁至 FinanceReclassRule，仅保留兼容） |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("FinanceAccountEditor", fields: [editedBy], references: [id]) |  |
| parent | FinanceAccount? | @relation("AccountHierarchy", fields: [parentId], references: [id]) |  |
| children | FinanceAccount[] | @relation("AccountHierarchy") |  |
| balances | FinanceAccountBalance[] | - |  |
| voucherItems | FinanceVoucherItem[] | - |  |
| snapshotRows | FinanceBalanceSnapshotRow[] | - |  |
| deptBudgets | FinanceBudgetDept[] | - |  |
| rdBudgets | FinanceBudgetRd[] | - |  |

### FinancePeriod

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| year | Int | - |  |
| month | Int | - |  |
| startDate | String | - |  |
| endDate | String | - |  |
| isClosed | Boolean | @default(false) |  |
| companyCode | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| balances | FinanceAccountBalance[] | - |  |
| vouchers | FinanceVoucher[] | - |  |
| reclassResults | ReclassResult[] | - |  |

### FinanceVoucher

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| voucherNo | String | - |  |
| date | String | - |  |
| periodId | Int | - |  |
| description | String | - |  |
| totalDebit | Float | @default(0) |  |
| totalCredit | Float | @default(0) |  |
| status | String | @default("draft") |  |
| companyCode | String | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("FinanceVoucherEditor", fields: [editedBy], references: [id]) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| items | FinanceVoucherItem[] | - |  |

### FinanceVoucherItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| voucherId | Int | - |  |
| accountId | Int | - |  |
| debit | Float | @default(0) |  |
| credit | Float | @default(0) |  |
| description | String? | - |  |
| relatedEntity | String? | - | 正则从描述提取的关联实体 |
| sortOrder | Int | @default(0) |  |
| importFingerprint | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| importId | Int? | - |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |
| voucher | FinanceVoucher | @relation(fields: [voucherId], references: [id], onDelete: Cascade) |  |
| reclassResults | ReclassResult[] | - |  |
| import | FinanceLedgerImport? | @relation(fields: [importId], references: [id]) |  |

### FinanceLedgerImport

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| type | String | - | account | voucher | balance |
| companyCode | String | - |  |
| year | Int | - |  |
| sourceFile | String? | - |  |
| sourcePath | String? | - |  |
| checksum | String? | - |  |
| status | String | @default("completed") | completed | partial | failed |
| rowCount | Int | @default(0) |  |
| createdCount | Int | @default(0) |  |
| updatedCount | Int | @default(0) |  |
| skippedCount | Int | @default(0) |  |
| deletedCount | Int | @default(0) |  |
| conflictCount | Int | @default(0) |  |
| blockedCount | Int | @default(0) |  |
| warnings | String? | - | JSON array of warning messages |
| importedBy | Int? | - |  |
| importedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| importer | User? | @relation("FinanceLedgerImportImporter", fields: [importedBy], references: [id]) |  |
| items | FinanceVoucherItem[] | - |  |

### FinanceAccountBalance

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| accountId | Int | - |  |
| periodId | Int | - |  |
| openingDebit | Float | @default(0) |  |
| openingCredit | Float | @default(0) |  |
| currentDebit | Float | @default(0) |  |
| currentCredit | Float | @default(0) |  |
| closingDebit | Float | @default(0) |  |
| closingCredit | Float | @default(0) |  |
| companyCode | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |

### FinanceBalanceSnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| year | Int | - |  |
| snapshotType | String | @default("reconcile") | "baseline" | "reconcile" |
| isActive | Boolean | @default(false) | 同(companyCode,year)只有一个active baseline |
| sourceFile | String? | - |  |
| sourcePath | String? | - |  |
| checksum | String? | - |  |
| rowCount | Int | @default(0) |  |
| importedBy | Int? | - |  |
| importer | User? | @relation("SnapshotImporter", fields: [importedBy], references: [id]) |  |
| importedAt | DateTime | @default(now()) |  |
| note | String? | - |  |
| rows | FinanceBalanceSnapshotRow[] | - |  |
| editedBy | Int? | - |  |
| editor | User? | @relation("SnapshotEditor", fields: [editedBy], references: [id]) |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### FinanceBalanceSnapshotRow

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| snapshotId | Int | - |  |
| snapshot | FinanceBalanceSnapshot | @relation(fields: [snapshotId], references: [id], onDelete: Cascade) |  |
| accountId | Int | - |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |
| accountCode | String | - | 导入时的科目编码快照（审计追溯） |
| accountName | String | - | 导入时的科目名称快照 |
| openingDebit | Float | @default(0) |  |
| openingCredit | Float | @default(0) |  |
| currentDebit | Float | @default(0) |  |
| currentCredit | Float | @default(0) |  |
| closingDebit | Float | @default(0) |  |
| closingCredit | Float | @default(0) |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |

### FinanceReclassRule

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| year | Int | - |  |
| sourceAccountCode | String | - |  |
| abnormalSide | String | - | debit | credit | both |
| targetAccountCode | String | - |  |
| enabled | Boolean | @default(true) |  |
| source | String | @default("manual") | suggested | manual | auto | copied |
| confirmedBy | Int? | - |  |
| confirmedAt | DateTime? | - |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| confirmer | User? | @relation("FinanceReclassRuleConfirmer", fields: [confirmedBy], references: [id]) |  |
| results | ReclassResult[] | - |  |

### FinanceReclassItemRule

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| year | Int | - |  |
| sourceAccountCode | String | - |  |
| matchType | String | @default("exact_description") |  |
| matchValue | String | - |  |
| targetAccountCode | String | - |  |
| enabled | Boolean | @default(true) |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### FinanceBalanceReclassAdjustment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| periodId | Int | - |  |
| companyCode | String | - |  |
| year | Int | - |  |
| sourceAccountCode | String | - |  |
| targetAccountCode | String | - |  |
| amount | Float | - |  |
| sourceType | String | @default("balance_residual") | balance_residual | manual |
| ruleId | Int? | - |  |
| status | String | @default("approved") | approved | adjusted | rejected |
| note | String? | - |  |
| adjustedBy | Int? | - |  |
| adjustedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### ReclassResult

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| periodId | Int | - |  |
| voucherItemId | Int | - | 来源凭证明细 |
| ruleId | Int? | - | 追溯到生成此结果的规则；手工添加或历史兼容时为 null |
| sourceAccount | String | - | 原科目编码（快照，不FK） |
| targetAccount | String | - | 目标科目编码（可修改） |
| amount | Float | - | 重分类金额 |
| status | String | @default("pending") | pending|approved|adjusted|rejected |
| adjustedBy | Int? | - | 审核人 userId |
| adjustedAt | DateTime? | - |  |
| note | String? | - | 审核备注 |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| voucherItem | FinanceVoucherItem | @relation(fields: [voucherItemId], references: [id]) |  |
| rule | FinanceReclassRule? | @relation(fields: [ruleId], references: [id]) |  |
| reviewer | User? | @relation("ReclassResultReviewer", fields: [adjustedBy], references: [id]) |  |

### FinanceStatementAccountMapping

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| year | Int | - |  |
| statementType | String | @default("balance") | balance | income | cashflow |
| lineCode | String | - | 报表项目 lineCode |
| accountCode | String | - | 科目编码 |
| includeChildren | Boolean | @default(true) |  |
| operator | String | @default("add") | add | subtract |
| source | String | @default("default") | default | manual | copied | migrated |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### FinanceStatementLineConfig

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| year | Int | - |  |
| reportType | String | @default("balanceSheet") | balanceSheet | incomeStatement | cashFlow |
| lineCode | String | - | unique line identifier |
| label | String | - | display label |
| displayCode | String | @default("") | display code hint |
| section | String | - | currentAssets | nonCurrentAssets | currentLiabilities | nonCurrentLiabilities | equity |
| side | String | @default("debit") | debit | credit |
| sortOrder | Int | @default(0) |  |
| prefixesJson | String | @default("[]") | JSON array of account code prefixes |
| subtractPrefixesJson | String | @default("[]") | JSON array of subtract prefixes (e.g. accumulated depreciation) |
| formulaJson | String | @default("{ |  |

### FinanceStatementWorkpaper

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| year | Int | - |  |
| month | Int | - |  |
| reportType | String | - | incomeStatement | cashFlow |
| status | String | @default("draft") | draft | submitted |
| note | String? | - |  |
| updatedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("WorkpaperEditor", fields: [updatedBy], references: [id]) |  |
| lines | FinanceStatementWorkpaperLine[] | - |  |
| review | FinanceStatementReview? | - |  |

### FinanceStatementWorkpaperLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workpaperId | Int | - |  |
| lineCode | String | - |  |
| manualAmount | Float | @default(0) |  |
| importedAmount | Float | @default(0) |  |
| formulaText | String? | - |  |
| note | String? | - |  |
| source | String? | - |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| workpaper | FinanceStatementWorkpaper | @relation(fields: [workpaperId], references: [id], onDelete: Cascade) |  |

### FinanceStatementReview

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workpaperId | Int | @unique |  |
| companyCode | String | - |  |
| year | Int | - |  |
| month | Int | - |  |
| reportType | String | - | incomeStatement | cashFlow |
| status | String | @default("draft") | draft | confirmed | voided |
| generatedFromVersion | Int | - |  |
| reviewedBy | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| note | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| workpaper | FinanceStatementWorkpaper | @relation(fields: [workpaperId], references: [id]) |  |
| editor | User? | @relation("ReviewEditor", fields: [editedBy], references: [id]) |  |
| reviewer | User? | @relation("ReviewReviewer", fields: [reviewedBy], references: [id]) |  |
| lines | FinanceStatementReviewLine[] | - |  |

### FinanceStatementReviewLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| reviewId | Int | - |  |
| lineCode | String | - |  |
| label | String | - | 创建 review 时的项目名称快照 |
| sortOrder | Int | - | 创建 review 时的排序快照 |
| systemAmount | Float | @default(0) |  |
| workpaperAmount | Float | @default(0) |  |
| adjustedAmount | Float? | - |  |
| finalAmount | Float | @default(0) |  |
| status | String | @default("pending") | pending | confirmed | adjusted | flagged |
| comment | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| review | FinanceStatementReview | @relation(fields: [reviewId], references: [id], onDelete: Cascade) |  |

### DepartmentDescription

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| departmentId | Int | - |  |
| code | String | - |  |
| name | String | - |  |
| sourceFile | String | - |  |
| codeRaw | String? | - |  |
| details | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| department | Department | @relation(fields: [departmentId], references: [id], onDelete: Cascade) |  |

### PositionDescription

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| departmentName | String? | - |  |
| reportTo | String? | - |  |
| positionPurpose | String? | - |  |
| summary | String? | - |  |
| headcount | Int? | - |  |
| version | String? | - |  |
| effectiveDate | String? | - |  |
| sourceFile | String | - |  |
| details | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| positions | Position[] | - |  |

### Employee

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | String | @unique |  |
| idNumber | String? | @unique |  |
| otherId | String? | - |  |
| name | String | - |  |
| alias | String? | - |  |
| gender | Boolean? | - |  |
| birthDate | String? | - |  |
| ethnicity | String? | - |  |
| hometown | String? | - |  |
| politics | String? | - |  |
| education | String? | - |  |
| title | String? | - |  |
| school | String? | - |  |
| major | String? | - |  |
| phone | String? | - |  |
| workStartDate | String? | - |  |
| userId | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| user | User? | @relation("EmployeeUser", fields: [userId], references: [id]) |  |
| positions | EDP[] | - |  |
| projects | EmployeeProject[] | - |  |
| projectTasks | ProjectTask[] | @relation("ProjectTaskOwner") |  |
| projectTaskAssignments | ProjectTaskAssignment[] | - |  |
| ownedWorkItems | WorkItem[] | @relation("WorkItemOwner") |  |
| employments | Employment[] | - |  |
| financeSalesSalaries | FinanceSalesSalary[] | - |  |
| financeShipments | FinanceShipment[] | - |  |
| financeWorkshopReports | FinanceWorkshopReport[] | - |  |

### Employment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | Int | - |  |
| isActive | Boolean | @default(true) |  |
| currentCompany | String? | - |  |
| joinDate | String? | - |  |
| leaveDate | String? | - |  |
| leaveReason | String? | - |  |
| leaveNote | String? | - |  |
| officeLocation | String? | - |  |
| attendanceType | String? | - |  |
| personnelType | String? | - |  |
| rank | String? | - |  |
| title | String? | - |  |
| contracts | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |

### Company

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | @unique |  |
| fullName | String? | - |  |
| registeredCapital | String? | - |  |
| unifiedCode | String? | - |  |
| bankName | String? | - |  |
| registeredAddress | String? | - |  |
| registeredDate | String? | - |  |
| legalPerson | String? | - |  |
| managementGroup | String | @default("常规体系") |  |
| codePoolCode | String? | - |  |
| isActive | Boolean | @default(true) |  |
| sortOrder | Int | @default(0) |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| childOfRelations | CompanyRelation[] | @relation("ChildCompany") |  |
| parentOfRelations | CompanyRelation[] | @relation("ParentCompany") |  |

### CompanyRelation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| parentId | Int | - |  |
| childId | Int | - |  |
| shareRatio | Float? | - |  |
| isConsolidated | Boolean | @default(false) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| child | Company | @relation("ChildCompany", fields: [childId], references: [id], onDelete: Cascade) |  |
| parent | Company | @relation("ParentCompany", fields: [parentId], references: [id], onDelete: Cascade) |  |

### Department

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | - |  |
| name | String | - |  |
| alias | String? | - |  |
| level | Int | @default(1) |  |
| parentId | Int? | - |  |
| managerUserId | Int? | - |  |
| isArchived | Boolean | @default(false) |  |
| archivedAt | DateTime? | - |  |
| endDate | DateTime? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| manager | User? | @relation("DepartmentManager", fields: [managerUserId], references: [id]) |  |
| parent | Department? | @relation("DeptHierarchy", fields: [parentId], references: [id]) |  |
| children | Department[] | @relation("DeptHierarchy") |  |
| descriptions | DepartmentDescription[] | - |  |
| resourceRoles | DepartmentResourceRole[] | - |  |
| workAssignees | DepartmentWorkAssignee[] | - |  |
| leadingProjects | Project[] | @relation("ProjectLeadingDepartment") |  |
| edps | EDP[] | - |  |
| positions | Position[] | - |  |

### Position

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | - |  |
| alias | String? | - |  |
| name | String | - |  |
| departmentId | Int? | - |  |
| positionDescriptionId | Int? | - |  |
| isArchived | Boolean | @default(false) |  |
| archivedAt | DateTime? | - |  |
| endDate | DateTime? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| edps | EDP[] | - |  |
| financeWorkshopReports | FinanceWorkshopReport[] | - |  |
| positionDescription | PositionDescription? | @relation(fields: [positionDescriptionId], references: [id]) |  |
| department | Department? | @relation(fields: [departmentId], references: [id]) |  |
| resourceRoles | PositionResourceRole[] | - |  |

### EDP

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | Int | - |  |
| departmentId | Int? | - |  |
| positionId | Int? | - |  |
| isPrimary | Boolean | @default(false) |  |
| startDate | String? | - |  |
| endDate | String? | - |  |
| reportTo | String? | - |  |
| workPercent | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| position | Position? | @relation(fields: [positionId], references: [id]) |  |
| department | Department? | @relation(fields: [departmentId], references: [id]) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |

### EditHistory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| entityType | String | - |  |
| entityId | String | - |  |
| version | Int | - |  |
| dataJson | String | - |  |
| editedBy | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| tag | String? | - |  |
| editor | User | @relation("EditHistoryEditor", fields: [editedBy], references: [id]) |  |

### StockRawMaterial

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| spec | String? | - |  |
| unit | String | @default("kg") |  |
| manufacturer | String? | - |  |
| status | String | @default("正常") |  |
| lastBalance | Float | @default(0) |  |
| currentPurchase | Float | @default(0) |  |
| currentConsume | Float | @default(0) |  |
| remark | String? | - |  |
| companyCode | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("StockRawMaterialEditor", fields: [editedBy], references: [id]) |  |

### StockPackaging

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| spec | String? | - |  |
| unit | String | @default("卷") |  |
| packagingType | String | @default("小容量") |  |
| status | String | @default("正常") |  |
| lastBalance | Float | @default(0) |  |
| currentInbound | Float | @default(0) |  |
| currentOutbound | Float | @default(0) |  |
| batchNo | String? | - |  |
| expiryDate | String? | - |  |
| remark | String? | - |  |
| companyCode | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("StockPackagingEditor", fields: [editedBy], references: [id]) |  |

### StockFinishedGoods

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| packagingSpec | String? | - |  |
| unit | String | @default("件") |  |
| stockType | String | @default("正常库存") |  |
| lastBalance | Float | @default(0) |  |
| currentInbound | Float | @default(0) |  |
| currentOutbound | Float | @default(0) |  |
| availableStock | Float | @default(0) |  |
| remark | String? | - |  |
| companyCode | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("StockFinishedGoodsEditor", fields: [editedBy], references: [id]) |  |

### StockBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| targetType | String | - |  |
| targetId | Int | - |  |
| batchNo | String | - |  |
| quantity | Float | @default(0) |  |
| expiryDate | String? | - |  |
| status | String | @default("正常") |  |
| remark | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### StockOperation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| opType | String | - |  |
| targetType | String | - |  |
| targetId | Int | - |  |
| quantity | Float | @default(0) |  |
| docNo | String? | - |  |
| reason | String? | - |  |
| operatorId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| editor | User? | @relation("StockOperationEditor", fields: [operatorId], references: [id]) |  |

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

### LibraryDocument

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| stableKey | String | @unique |  |
| rootKey | String | @default("default") |  |
| relativePath | String | - |  |
| fileName | String | - |  |
| extension | String? | - |  |
| mimeType | String? | - |  |
| fileSizeBytes | Int? | - |  |
| fileMtime | DateTime? | - |  |
| checksumSha256 | String? | - |  |
| categoryCode | String? | - |  |
| categoryName | String? | - |  |
| subcategoryPath | String? | - |  |
| directoryPath | String? | - |  |
| title | String? | - |  |
| summary | String? | - |  |
| docId | String? | @unique |  |
| tags | LibraryDocumentTag[] | - |  |
| confidentialityLevel | Int | @default(2) |  |
| status | String | @default("active") |  |
| origin | String | @default("uploaded") |  |
| generatorKey | String? | - |  |
| versionLabel | String? | - |  |
| gitRepo | String? | - |  |
| gitCommit | String? | - |  |
| gitPath | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("LibraryDocumentEditor", fields: [editedBy], references: [id]) |  |
| versions | LibraryDocumentVersion[] | - |  |
| materialSelections | DueDiligenceMaterialSelection[] | - |  |

### LibraryDocumentVersion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| documentId | Int | - |  |
| versionNo | Int | - |  |
| relativePath | String | - |  |
| fileSizeBytes | Int? | - |  |
| fileMtime | DateTime? | - |  |
| checksumSha256 | String? | - |  |
| gitCommit | String? | - |  |
| changeNote | String? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| document | LibraryDocument | @relation(fields: [documentId], references: [id], onDelete: Cascade) |  |
| selections | DueDiligenceMaterialSelection[] | - |  |

### DueDiligenceParty

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| name | String | - |  |
| contact | String? | - |  |
| type | String? | - |  |
| ndaStatus | String | @default("none") |  |
| notes | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| requests | DueDiligenceRequest[] | - |  |

### DueDiligenceRequest

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| partyId | Int | - |  |
| title | String | - |  |
| receivedAt | DateTime? | - |  |
| status | String | @default("draft") |  |
| defaultConfidentialityLevel | Int | @default(2) |  |
| archivedAt | DateTime? | - |  |
| archivedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| party | DueDiligenceParty | @relation(fields: [partyId], references: [id], onDelete: Cascade) |  |
| questions | DueDiligenceQuestion[] | - |  |

### DueDiligenceQuestion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| requestId | Int | - |  |
| questionText | String | - |  |
| categoryHint | String? | - |  |
| answerDraft | String? | - |  |
| status | String | @default("draft") |  |
| notes | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| request | DueDiligenceRequest | @relation(fields: [requestId], references: [id], onDelete: Cascade) |  |
| materials | DueDiligenceMaterialSelection[] | - |  |

### DueDiligenceMaterialSelection

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| questionId | Int | - |  |
| documentId | Int | - |  |
| documentVersionId | Int? | - |  |
| matchScore | Float? | - |  |
| reason | String? | - |  |
| selected | Boolean | @default(false) |  |
| selectedBy | Int? | - |  |
| selectedAt | DateTime? | - |  |
| question | DueDiligenceQuestion | @relation(fields: [questionId], references: [id], onDelete: Cascade) |  |
| document | LibraryDocument | @relation(fields: [documentId], references: [id], onDelete: Cascade) |  |
| documentVersion | LibraryDocumentVersion? | @relation(fields: [documentVersionId], references: [id], onDelete: SetNull) |  |

### LibraryGeneratedSource

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| key | String | @unique |  |
| name | String | - |  |
| outputCategory | String? | - |  |
| defaultConfidentialityLevel | Int | @default(2) |  |
| enabled | Boolean | @default(false) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### LibraryDocumentTag

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| documentId | Int | - |  |
| tag | String | - |  |
| document | LibraryDocument | @relation(fields: [documentId], references: [id], onDelete: Cascade) |  |

### OpenApiClient

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| name | String | - |  |
| description | String? | - |  |
| keyHash | String | @unique |  |
| status | String | @default("active") |  |
| ownerUserId | Int? | - |  |
| expiresAt | DateTime? | - |  |
| lastUsedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| grants | OpenApiClientScopeGrant[] | - |  |
| accessLogs | OpenApiAccessLog[] | - |  |

### OpenApiResource

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| key | String | @unique |  |
| label | String | - |  |
| registrationKey | String | - |  |
| runtimeParentResourceKey | String? | - |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| scopes | OpenApiScope[] | - |  |

### OpenApiScope

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| key | String | @unique |  |
| label | String | - |  |
| action | String | - |  |
| resourceId | Int | - |  |
| registrationKey | String | - |  |
| runtimeParentResourceKey | String? | - |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| resource | OpenApiResource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| grants | OpenApiClientScopeGrant[] | - |  |

### OpenApiClientScopeGrant

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| clientId | Int | - |  |
| scopeId | Int | - |  |
| action | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| client | OpenApiClient | @relation(fields: [clientId], references: [id], onDelete: Cascade) |  |
| scope | OpenApiScope | @relation(fields: [scopeId], references: [id], onDelete: Cascade) |  |

### OpenApiAccessLog

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| clientId | Int? | - |  |
| clientName | String? | - |  |
| endpointKey | String | - |  |
| scopeKey | String | - |  |
| method | String | - |  |
| path | String | - |  |
| status | Int | - |  |
| durationMs | Int | - |  |
| errorCode | String? | - |  |
| ip | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| client | OpenApiClient? | @relation(fields: [clientId], references: [id], onDelete: SetNull) |  |

### SystemConfig

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| key | String | @id |  |
| value | String | - |  |

### LoginAttempt

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| username | String | - |  |
| ip | String | - |  |
| success | Boolean | - |  |
| createdAt | DateTime | @default(now()) |  |

### Project

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String? | @unique |  |
| name | String | - |  |
| description | String? | - |  |
| projectLevel | String | @default("普通") |  |
| plan | String? | - |  |
| goal | String? | - |  |
| milestones | String? | - |  |
| budgetAmount | Float? | - |  |
| budgetNote | String? | - |  |
| riskNote | String? | - |  |
| remark | String? | - |  |
| startDate | DateTime? | - |  |
| endDate | DateTime? | - |  |
| completionPercent | Float? | - |  |
| closureType | String? | - |  |
| leadingDepartmentId | Int? | - |  |
| isArchived | Boolean | @default(false) |  |
| archivedAt | DateTime? | - |  |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| leadingDepartment | Department? | @relation("ProjectLeadingDepartment", fields: [leadingDepartmentId], references: [id], onDelete: SetNull) |  |
| employees | EmployeeProject[] | - |  |
| tasks | ProjectTask[] | - |  |
| planPhases | ProjectPlanPhase[] | @relation("ProjectPlanPhases") |  |
| planDependencies | ProjectPlanDependency[] | @relation("ProjectPlanDependencies") |  |
| planBaselines | ProjectPlanBaseline[] | @relation("ProjectPlanBaselines") |  |
| workAssignees | ProjectWorkAssignee[] | - |  |
| linkedWorkItems | WorkItem[] | @relation("WorkItemLinkedProject") |  |

### EmployeeProject

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | Int | - |  |
| projectId | Int | - |  |
| role | String? | - |  |
| startDate | String? | - |  |
| endDate | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| project | Project | @relation(fields: [projectId], references: [id], onDelete: Cascade) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |

### ProjectPlanPhase

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| projectId | Int | - |  |
| sequenceNo | Int | - |  |
| name | String | - |  |
| startDate | DateTime? | - |  |
| endDate | DateTime? | - |  |
| note | String? | - |  |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| project | Project | @relation("ProjectPlanPhases", fields: [projectId], references: [id], onDelete: Cascade) |  |
| tasks | ProjectTask[] | @relation("ProjectTaskPlanPhase") |  |

### ProjectPlanDependency

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| projectId | Int | - |  |
| predecessorKind | String | - |  |
| predecessorId | Int | - |  |
| successorKind | String | - |  |
| successorId | Int | - |  |
| dependencyType | String | @default("finish_start") |  |
| lagDays | Int | @default(1) |  |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| project | Project | @relation("ProjectPlanDependencies", fields: [projectId], references: [id], onDelete: Cascade) |  |

### ProjectPlanBaseline

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| projectId | Int | - |  |
| name | String | - |  |
| note | String? | - |  |
| isActive | Boolean | @default(false) |  |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| project | Project | @relation("ProjectPlanBaselines", fields: [projectId], references: [id], onDelete: Cascade) |  |
| items | ProjectPlanBaselineItem[] | - |  |

### ProjectPlanBaselineItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| baselineId | Int | - |  |
| itemKind | String | - |  |
| itemId | Int | - |  |
| parentKind | String? | - |  |
| parentId | Int? | - |  |
| phaseId | Int? | - |  |
| name | String | - |  |
| status | String? | - |  |
| isMilestone | Boolean | @default(false) |  |
| startDate | DateTime? | - |  |
| endDate | DateTime? | - |  |
| baseline | ProjectPlanBaseline | @relation(fields: [baselineId], references: [id], onDelete: Cascade) |  |

### ProjectTask

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| projectId | Int | - |  |
| planPhaseId | Int? | - |  |
| name | String | @default("") |  |
| isMilestone | Boolean | @default(false) |  |
| ownerEmployeeId | Int? | - |  |
| description | String | @default("") |  |
| baselineStartDate | DateTime? | - |  |
| baselineEndDate | DateTime? | - |  |
| startDate | DateTime? | - |  |
| endDate | DateTime? | - |  |
| sortOrder | Int | @default(0) |  |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| project | Project | @relation(fields: [projectId], references: [id], onDelete: Cascade) |  |
| planPhase | ProjectPlanPhase? | @relation("ProjectTaskPlanPhase", fields: [planPhaseId], references: [id], onDelete: SetNull) |  |
| owner | Employee? | @relation("ProjectTaskOwner", fields: [ownerEmployeeId], references: [id], onDelete: SetNull) |  |
| assignees | ProjectTaskAssignment[] | - |  |
| linkedWorkItems | WorkItem[] | @relation("WorkItemLinkedProjectTask") |  |

### ProjectTaskAssignment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| taskId | Int | - |  |
| employeeId | Int | - |  |
| role | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| task | ProjectTask | @relation(fields: [taskId], references: [id], onDelete: Cascade) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |

### WorkItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| targetType | String | @default("personal") |  |
| targetId | Int? | - |  |
| category | String | - |  |
| content | String | - |  |
| description | String | @default("") |  |
| importance | Int | @default(3) |  |
| urgency | Int | @default(3) |  |
| status | String? | - |  |
| ownerEmployeeId | Int? | - |  |
| startDate | DateTime? | - |  |
| dueDate | DateTime? | - |  |
| linkedProjectId | Int? | - |  |
| linkedProjectTaskId | Int? | - |  |
| parentWorkItemId | Int? | - |  |
| isArchived | Boolean | @default(false) |  |
| isPrivate | Boolean | @default(false) |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| participants | WorkParticipant[] | - |  |
| owner | Employee? | @relation("WorkItemOwner", fields: [ownerEmployeeId], references: [id], onDelete: SetNull) |  |
| linkedProject | Project? | @relation("WorkItemLinkedProject", fields: [linkedProjectId], references: [id], onDelete: SetNull) |  |
| linkedProjectTask | ProjectTask? | @relation("WorkItemLinkedProjectTask", fields: [linkedProjectTaskId], references: [id], onDelete: SetNull) |  |
| parentWorkItem | WorkItem? | @relation("WorkItemHierarchy", fields: [parentWorkItemId], references: [id], onDelete: SetNull) |  |
| childWorkItems | WorkItem[] | @relation("WorkItemHierarchy") |  |

### WorkParticipant

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workItemId | Int | - |  |
| name | String | - |  |
| wxUserId | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| workItem | WorkItem | @relation(fields: [workItemId], references: [id], onDelete: Cascade) |  |

### DepartmentWorkAssignee

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| departmentId | Int | - |  |
| userId | Int | - |  |
| kind | String | - | "task" |
| department | Department | @relation(fields: [departmentId], references: [id], onDelete: Cascade) |  |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |  |

### ProjectWorkAssignee

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| projectId | Int | - |  |
| userId | Int | - |  |
| kind | String | - | "task" |
| project | Project | @relation(fields: [projectId], references: [id], onDelete: Cascade) |  |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |  |

### WorkScopePermission

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| targetType | String | - |  |
| targetId | Int | - |  |
| userId | Int | - |  |
| role | String | - |  |
| kind | String | @default("task") |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |  |

