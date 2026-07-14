# 数据库表结构

> 本文档由 `scripts/generate/gen-db-docs.js` 自动生成，基于 `prisma/models/*.prisma`。

## 模型列表

### AgentSession

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | String | @id |  |
| userId | Int | - |  |
| status | String | @default("active") | active | deleted |
| pagePath | String? | - |  |
| contextLabel | String? | - |  |
| title | String? | - |  |
| storageKey | String | - |  |
| summaryShort | String? | - |  |
| summaryLongStorageKey | String? | - |  |
| messageCount | Int | @default(0) |  |
| compactedMessageCount | Int | @default(0) |  |
| byteSize | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| expiresAt | DateTime? | - |  |
| deletedAt | DateTime? | - |  |

### AgentProposal

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| userId | Int | - |  |
| sessionId | String? | - |  |
| status | String | @default("pending") | pending | confirmed | cancelled | failed |
| actionKey | String | - | 工具 key，如 hr.updateEmployee |
| targetType | String | - | 目标实体，如 Employee |
| targetId | String? | - | 目标记录标识 |
| payloadJson | String | - | 变更内容 JSON |
| diffJson | String? | - | 变更前后对比 JSON |
| resultJson | String? | - | 执行结果 JSON |
| createdAt | DateTime | @default(now()) |  |
| confirmedAt | DateTime? | - |  |

### ApprovalRequest

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| resourceKey | String | - |  |
| scopeId | String? | - |  |
| businessActionKey | String | @default("legacy.approval") |  |
| flowType | String | @default("approval") |  |
| separationPolicy | String | @default("auto_pass_if_authorized") |  |
| handlerSource | String | @default("permission") |  |
| workflowNodesJson | String | @default("[]") |  |
| activeWorkflowNodeKey | String? | - |  |
| activeWorkflowNodeKeysJson | String | @default("[]") |  |
| workflowJoinStateJson | String | @default("{ |  |

### ApprovalEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| requestId | Int | - |  |
| sequence | Int | - |  |
| eventType | String | - |  |
| actorUserId | Int | - |  |
| workflowNodeKey | String? | - |  |
| fromStatus | String? | - |  |
| toStatus | String? | - |  |
| comment | String? | - |  |
| payloadJson | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| request | ApprovalRequest | @relation(fields: [requestId], references: [id], onDelete: Cascade) |  |
| actor | User | @relation("ApprovalEventActor", fields: [actorUserId], references: [id], onDelete: Cascade) |  |

### WorkflowPolicy

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| businessActionKey | String | - |  |
| scopeType | String | - |  |
| scopeId | String | @default("") |  |
| mode | String | @default("optional") |  |
| flowType | String | @default("approval") |  |
| separationPolicy | String | @default("auto_pass_if_authorized") |  |
| handlerSource | String | @default("permission") |  |
| workflowNodesJson | String | @default("[]") |  |
| handlerCanRevise | Boolean | @default(true) |  |
| requestCanWithdraw | Boolean | @default(true) |  |
| requestCanResubmit | Boolean | @default(true) |  |
| requestCanCancel | Boolean | @default(true) |  |
| requestCanRevise | Boolean | @default(true) |  |
| version | Int | @default(1) |  |
| createdByUserId | Int? | - |  |
| updatedByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### User

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| wxUserId | String? | @unique |  |
| username | String | @unique |  |
| password | String? | - |  |
| avatar | String? | - |  |
| alias | String? | - |  |
| phone | String? | - |  |
| routineItems | String? | - |  |
| preferredDepartmentIds | String? | - |  |
| preferredProjectIds | String? | - |  |
| portalSlots | String? | - |  |
| canLogin | Boolean | @default(true) |  |
| apiKeyHash | String? | @unique(map: "User_apiKey_key") @map("apiKey") |  |
| employeeId | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| sessionVersion | Int | @default(0) |  |
| editedContracts | Contract[] | @relation("ContractEditor") |  |
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
| ownedLibraryDocuments | LibraryDocument[] | @relation("LibraryDocumentOwner") |  |
| reviewedLibraryDocuments | LibraryDocument[] | @relation("LibraryDocumentReviewer") |  |
| createdLibraryVersions | LibraryDocumentVersion[] | @relation("LibraryDocumentVersionCreator") |  |
| createdLibraryDocumentTags | LibraryDocumentTag[] | @relation("LibraryDocumentTagCreator") |  |
| reviewedLibraryTagCandidates | LibraryTagCandidate[] | @relation("LibraryTagCandidateReviewer") |  |
| reviewedLibraryMetadataCandidates | LibraryMetadataCandidate[] | @relation("LibraryMetadataCandidateReviewer") |  |
| requestedLibraryExports | LibraryExportJob[] | @relation("LibraryExportRequester") |  |
| createdLibraryEvaluationCases | LibraryEvaluationCase[] | @relation("LibraryEvaluationCaseCreator") |  |
| reviewedLibraryEvaluationCases | LibraryEvaluationCase[] | @relation("LibraryEvaluationCaseReviewer") |  |
| resourceActionGrants | UserResourceActionGrant[] | - |  |
| departmentAssignees | DepartmentWorkAssignee[] | - |  |
| projectAssignees | ProjectWorkAssignee[] | - |  |
| createdDepartmentCollaborations | DepartmentCollaboration[] | @relation("DepartmentCollaborationCreator") |  |
| departmentCollaborationResponses | DepartmentCollaborationDepartment[] | @relation("DepartmentCollaborationResponder") |  |
| reviewedReclassResults | ReclassResult[] | @relation("ReclassResultReviewer") |  |
| confirmedReclassRules | FinanceReclassRule[] | @relation("FinanceReclassRuleConfirmer") |  |
| ledgerImports | FinanceLedgerImport[] | @relation("FinanceLedgerImportImporter") |  |
| editedWorkpapers | FinanceStatementWorkpaper[] | @relation("WorkpaperEditor") |  |
| notifications | Notification[] | @relation("NotificationRecipient") |  |
| createdNotifications | Notification[] | @relation("NotificationActor") |  |
| permissionGrantLedgerEvents | PermissionGrantLedgerEvent[] | @relation("PermissionGrantLedgerActor") |  |
| submittedApprovalRequests | ApprovalRequest[] | @relation("ApprovalRequestSubmitter") |  |
| resolvedApprovalRequests | ApprovalRequest[] | @relation("ApprovalRequestResolver") |  |
| approvalEvents | ApprovalEvent[] | @relation("ApprovalEventActor") |  |
| workReports | WorkReport[] | @relation("WorkReportSubmitter") |  |
| ownedMeetings | Meeting[] | @relation("MeetingOwner") |  |
| secretariedMeetings | Meeting[] | @relation("MeetingSecretary") |  |
| meetingParticipations | MeetingParticipant[] | @relation("MeetingParticipantUser") |  |
| meetingVotes | MeetingVote[] | @relation("MeetingVoteUser") |  |

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
| scopeTypes | String? | - |  |
| scopeInheritanceMode | String | @default("inherit") |  |
| departmentActionGrants | DepartmentResourceActionGrant[] | - |  |
| positionActionGrants | PositionResourceActionGrant[] | - |  |
| parent | Resource? | @relation("ResHierarchy", fields: [parentId], references: [id]) |  |
| children | Resource[] | @relation("ResHierarchy") |  |
| userActionGrants | UserResourceActionGrant[] | - |  |
| permissionGrantLedgerEvents | PermissionGrantLedgerEvent[] | - |  |

### PermissionActionNormalization

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| key | String | @id |  |
| appliedAt | DateTime | @default(now()) |  |

### UserResourceActionGrant

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| userId | Int | - |  |
| resourceId | Int | - |  |
| actionKey | String | - |  |
| scopeId | String? | - |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |  |

### PositionResourceActionGrant

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| positionId | Int | - |  |
| resourceId | Int | - |  |
| actionKey | String | - |  |
| scopeId | String? | - |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| position | Position | @relation(fields: [positionId], references: [id], onDelete: Cascade) |  |

### DepartmentResourceActionGrant

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| departmentId | Int | - |  |
| resourceId | Int | - |  |
| actionKey | String | - |  |
| scopeId | String? | - |  |
| resource | Resource | @relation(fields: [resourceId], references: [id], onDelete: Cascade) |  |
| department | Department | @relation(fields: [departmentId], references: [id], onDelete: Cascade) |  |

### PermissionGrantLedgerEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| eventType | String | - |  |
| actorUserId | Int? | - |  |
| actorLabel | String? | - |  |
| actorSnapshotJson | String? | - |  |
| subjectType | String | - |  |
| subjectId | Int | - |  |
| subjectLabel | String? | - |  |
| subjectSnapshotJson | String? | - |  |
| resourceId | Int? | - |  |
| resourceKey | String | - |  |
| resourceName | String? | - |  |
| actionKey | String | - |  |
| scopeId | String? | - |  |
| beforeValue | Boolean | - |  |
| afterValue | Boolean | - |  |
| source | String | @default("permission_request") |  |
| reason | String? | - |  |
| batchId | String? | - |  |
| metadataJson | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| actor | User? | @relation("PermissionGrantLedgerActor", fields: [actorUserId], references: [id], onDelete: SetNull) |  |
| resource | Resource? | @relation(fields: [resourceId], references: [id], onDelete: SetNull) |  |

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

### DocumentTemplateSpace

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| targetType | String | - |  |
| targetId | Int | - |  |
| title | String | - |  |
| description | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| deletedAt | DateTime? | - |  |
| templates | DocumentTemplate[] | - |  |

### DocumentTemplate

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| title | String | - |  |
| type | String | - |  |
| status | String | @default("draft") |  |
| ownerUserId | Int? | - |  |
| spaceId | Int | - |  |
| documentContentRef | String? | - |  |
| fieldModelContentRef | String? | - |  |
| sourceKind | String? | - |  |
| sourceProductKey | String? | - |  |
| sourceStageKeys | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| deletedAt | DateTime? | - |  |
| publishedAt | DateTime? | - |  |
| publishedByUserId | Int? | - |  |
| space | DocumentTemplateSpace | @relation(fields: [spaceId], references: [id], onDelete: Cascade) |  |

### ExternalParty

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| subjectType | String | @default("organization") |  |
| relatedPartyType | String | @default("unrelated") |  |
| name | String | - |  |
| fullName | String? | - |  |
| identityNumber | String | - |  |
| legalRepresentative | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| roles | ExternalPartyRole[] | - |  |

### ExternalPartyRole

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| partyId | Int | - |  |
| category | String | - |  |
| code | String | - |  |
| classification | String? | - |  |
| contactPerson | String? | - |  |
| phone | String? | - |  |
| email | String? | - |  |
| bankName | String? | - |  |
| bankAccount | String? | - |  |
| address | String? | - |  |
| invoiceTitle | String? | - |  |
| invoiceAddressPhone | String? | - |  |
| settlementTerms | String? | - |  |
| creditLimit | Float? | - |  |
| creditDays | Int? | - |  |
| taxRate | Float? | - |  |
| remark | String? | - |  |
| isActive | Boolean | @default(true) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| party | ExternalParty | @relation(fields: [partyId], references: [id], onDelete: Cascade) |  |

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
| sourceType | String | @default("balance_residual") | balance_residual | auxiliary_balance | reference_workpaper | manual |
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
| voucherItemId | Int? | - | 当前来源凭证明细；历史来源已删除时为 null |
| voucherItemIdSnapshot | Int | - | 生成时的来源凭证明细 ID 快照，永不因父记录删除而丢失 |
| ruleId | Int? | - | 当前规则；手工添加、规则已删除或历史兼容时为 null |
| ruleIdSnapshot | Int? | - | 生成时的规则 ID 快照 |
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
| voucherItem | FinanceVoucherItem? | @relation(fields: [voucherItemId], references: [id], onDelete: SetNull) |  |
| rule | FinanceReclassRule? | @relation(fields: [ruleId], references: [id], onDelete: SetNull) |  |
| reviewer | User? | @relation("ReclassResultReviewer", fields: [adjustedBy], references: [id]) |  |

### FinanceStatementWorkpaper

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| year | Int | - |  |
| month | Int | - |  |
| reportType | String | - | balanceSheet | incomeStatement | cashFlow |
| status | String | @default("draft") | draft | submitted |
| note | String? | - |  |
| updatedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("WorkpaperEditor", fields: [updatedBy], references: [id]) |  |
| lines | FinanceStatementWorkpaperLine[] | - |  |

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

### DepartmentDescription

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| departmentId | Int | - |  |
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
| responsibilityNodes | PositionResponsibilityNode[] | - |  |

### HrPerformanceReview

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | Int | - |  |
| okrCycleId | Int | - |  |
| approvalRequestId | Int? | - |  |
| selfScore | Int? | - |  |
| selfComment | String | @default("") |  |
| managerScore | Int? | - |  |
| managerComment | String | @default("") |  |
| finalScore | Int | - |  |
| finalGrade | String | - |  |
| hrComment | String | @default("") |  |
| okrSnapshotJson | String | @default("{ |  |

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
| ownedWorkItems | WorkItem[] | @relation("WorkItemOwner") |  |
| ownedWorkPlans | WorkPlan[] | @relation("WorkPlanOwner") |  |
| managedDepartments | DepartmentManagerEmployee[] | - |  |
| employments | Employment[] | - |  |
| financeSalesSalaries | FinanceSalesSalary[] | - |  |
| financeShipments | FinanceShipment[] | - |  |
| financeWorkshopReports | FinanceWorkshopReport[] | - |  |
| performanceReviews | HrPerformanceReview[] | - |  |

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
| positionReportOverrides | PositionReportOverride[] | - |  |
| reportingEdps | EDP[] | @relation("EDPReportingCompany") |  |

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
| hierarchyKind | String | @default("M") |  |
| level | Int | @default(1) |  |
| parentId | Int? | - |  |
| managerPositionId | Int? | - |  |
| isArchived | Boolean | @default(false) |  |
| archivedAt | DateTime? | - |  |
| endDate | DateTime? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| managerPosition | Position? | @relation("DepartmentManagerPosition", fields: [managerPositionId], references: [id]) |  |
| parent | Department? | @relation("DeptHierarchy", fields: [parentId], references: [id]) |  |
| children | Department[] | @relation("DeptHierarchy") |  |
| descriptions | DepartmentDescription[] | - |  |
| managerEmployees | DepartmentManagerEmployee[] | - |  |
| resourceActionGrants | DepartmentResourceActionGrant[] | - |  |
| workAssignees | DepartmentWorkAssignee[] | - |  |
| responsibleCollaborations | DepartmentCollaboration[] | @relation("DepartmentCollaborationResponsibleDepartment") |  |
| enabledCollaborations | DepartmentCollaborationDepartment[] | @relation("DepartmentCollaborationEnablingDepartment") |  |
| sourceWorkPlans | WorkPlan[] | @relation("WorkPlanSourceDepartment") |  |
| sourceWorkItems | WorkItem[] | @relation("WorkItemSourceDepartment") |  |
| leadingProjects | Project[] | @relation("ProjectLeadingDepartment") |  |
| owningProjects | Project[] | @relation("ProjectOwningDepartment") |  |
| enabledProjects | ProjectEnablingDepartment[] | @relation("ProjectEnablingDepartmentDepartment") |  |
| edps | EDP[] | - |  |
| positions | Position[] | - |  |
| positionReportOverrides | PositionReportOverride[] | - |  |

### DepartmentManagerEmployee

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| departmentId | Int | - |  |
| employeeId | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| department | Department | @relation(fields: [departmentId], references: [id], onDelete: Cascade) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |

### Position

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | - |  |
| alias | String? | - |  |
| name | String | - |  |
| departmentId | Int? | - |  |
| positionDescriptionId | Int? | - |  |
| reportToPositionId | Int? | - |  |
| isArchived | Boolean | @default(false) |  |
| archivedAt | DateTime? | - |  |
| endDate | DateTime? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| edps | EDP[] | - |  |
| financeWorkshopReports | FinanceWorkshopReport[] | - |  |
| positionDescription | PositionDescription? | @relation(fields: [positionDescriptionId], references: [id]) |  |
| reportToPosition | Position? | @relation("PositionReportTo", fields: [reportToPositionId], references: [id]) |  |
| directReportPositions | Position[] | @relation("PositionReportTo") |  |
| department | Department? | @relation(fields: [departmentId], references: [id]) |  |
| managedDepartments | Department[] | @relation("DepartmentManagerPosition") |  |
| resourceActionGrants | PositionResourceActionGrant[] | - |  |
| reportOverrides | PositionReportOverride[] | @relation("PositionReportOverrideSource") |  |
| reportedReportOverrides | PositionReportOverride[] | @relation("PositionReportOverrideReportTo") |  |
| collaborationPositions | DepartmentCollaborationPosition[] | - |  |

### EDP

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | Int | - |  |
| reportingCompanyId | Int? | - |  |
| departmentId | Int? | - |  |
| positionId | Int? | - |  |
| positionReportOverrideId | Int? | - |  |
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
| reportingCompany | Company? | @relation("EDPReportingCompany", fields: [reportingCompanyId], references: [id], onDelete: SetNull) |  |
| positionReportOverride | PositionReportOverride? | @relation(fields: [positionReportOverrideId], references: [id], onDelete: SetNull) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |

### PositionReportOverride

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| positionId | Int | - |  |
| companyId | Int | - |  |
| departmentId | Int | - |  |
| reportToPositionId | Int? | - |  |
| headcount | Int? | - |  |
| isActive | Boolean | @default(true) |  |
| remark | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| position | Position | @relation("PositionReportOverrideSource", fields: [positionId], references: [id], onDelete: Cascade) |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Cascade) |  |
| department | Department | @relation(fields: [departmentId], references: [id], onDelete: Cascade) |  |
| reportToPosition | Position? | @relation("PositionReportOverrideReportTo", fields: [reportToPositionId], references: [id]) |  |
| edps | EDP[] | - |  |

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

### LibraryTagCandidate

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| candidateUid | String | @unique @default(uuid()) |  |
| documentId | Int | - |  |
| versionId | Int | - |  |
| tagId | Int? | - |  |
| dimension | String | - |  |
| proposedKey | String | - |  |
| proposedName | String | - |  |
| confidence | Float | - |  |
| evidenceJson | String | - |  |
| providerKey | String | - |  |
| modelKey | String | - |  |
| promptVersion | String | - |  |
| status | String | @default("pending") |  |
| reviewedBy | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| reviewNote | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| document | LibraryDocument | @relation(fields: [documentId], references: [id], onDelete: Cascade) |  |
| version | LibraryDocumentVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| tag | LibraryTag? | @relation(fields: [tagId], references: [id], onDelete: SetNull) |  |
| reviewer | User? | @relation("LibraryTagCandidateReviewer", fields: [reviewedBy], references: [id], onDelete: SetNull) |  |

### LibraryEntityMention

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| mentionUid | String | @unique @default(uuid()) |  |
| versionId | Int | - |  |
| chunkId | Int? | - |  |
| entityType | String | - |  |
| canonicalValue | String | - |  |
| observedText | String | - |  |
| locatorJson | String | - |  |
| confidence | Float? | - |  |
| source | String | - |  |
| providerKey | String? | - |  |
| modelKey | String? | - |  |
| status | String | @default("extracted") |  |
| createdAt | DateTime | @default(now()) |  |
| version | LibraryDocumentVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| chunk | LibraryContentChunk? | @relation(fields: [chunkId], references: [id], onDelete: SetNull) |  |

### LibraryMetadataCandidate

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| candidateUid | String | @unique @default(uuid()) |  |
| documentId | Int | - |  |
| versionId | Int | - |  |
| title | String? | - |  |
| summary | String? | - |  |
| keywordsJson | String | - |  |
| entitiesJson | String | - |  |
| keyPassagesJson | String | - |  |
| fileFactsJson | String | - |  |
| source | String | - |  |
| providerKey | String | - |  |
| modelKey | String | - |  |
| promptVersion | String | - |  |
| status | String | @default("pending") |  |
| reviewedBy | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| reviewNote | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| document | LibraryDocument | @relation(fields: [documentId], references: [id], onDelete: Cascade) |  |
| version | LibraryDocumentVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| reviewer | User? | @relation("LibraryMetadataCandidateReviewer", fields: [reviewedBy], references: [id], onDelete: SetNull) |  |

### LibraryEvaluationCase

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| caseUid | String | @unique @default(uuid()) |  |
| kind | String | - |  |
| question | String | - |  |
| expectedAnswer | String? | - |  |
| expectedBehavior | String | @default("answer") |  |
| minConfidentiality | Int | @default(0) |  |
| status | String | @default("draft") |  |
| createdBy | Int | - |  |
| reviewedBy | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| creator | User | @relation("LibraryEvaluationCaseCreator", fields: [createdBy], references: [id], onDelete: Restrict) |  |
| reviewer | User? | @relation("LibraryEvaluationCaseReviewer", fields: [reviewedBy], references: [id], onDelete: SetNull) |  |
| evidence | LibraryEvaluationEvidence[] | - |  |

### LibraryEvaluationEvidence

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| evidenceUid | String | @unique @default(uuid()) |  |
| caseId | Int | - |  |
| versionId | Int | - |  |
| locatorJson | String | - |  |
| quote | String | - |  |
| required | Boolean | @default(true) |  |
| createdAt | DateTime | @default(now()) |  |
| evaluationCase | LibraryEvaluationCase | @relation(fields: [caseId], references: [id], onDelete: Cascade) |  |
| version | LibraryDocumentVersion | @relation(fields: [versionId], references: [id], onDelete: Restrict) |  |

### LibraryProcessingJob

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| jobUid | String | @unique @default(uuid()) |  |
| versionId | Int | - |  |
| kind | String | - |  |
| status | String | @default("queued") |  |
| priority | Int | @default(0) |  |
| attempt | Int | @default(0) |  |
| maxAttempts | Int | @default(3) |  |
| idempotencyKey | String | @unique |  |
| inputChecksum | String | - |  |
| pipelineVersion | String | - |  |
| providerKey | String? | - |  |
| modelKey | String? | - |  |
| errorCode | String? | - |  |
| errorMessage | String? | - |  |
| metricsJson | String? | - |  |
| queuedAt | DateTime | @default(now()) |  |
| startedAt | DateTime? | - |  |
| finishedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| version | LibraryDocumentVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| artifacts | LibraryArtifact[] | - |  |

### LibraryArtifact

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| artifactUid | String | @unique @default(uuid()) |  |
| versionId | Int | - |  |
| jobId | Int? | - |  |
| kind | String | - |  |
| status | String | @default("ready") |  |
| storagePath | String | - |  |
| mimeType | String? | - |  |
| fileSizeBytes | Int | - |  |
| checksumSha256 | String | - |  |
| pageCount | Int? | - |  |
| locatorSchemaVersion | String | @default("v1") |  |
| toolchainJson | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| version | LibraryDocumentVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| job | LibraryProcessingJob? | @relation(fields: [jobId], references: [id], onDelete: SetNull) |  |
| chunks | LibraryContentChunk[] | - |  |
| indexes | LibrarySearchIndex[] | - |  |

### LibraryContentChunk

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| chunkUid | String | @unique @default(uuid()) |  |
| versionId | Int | - |  |
| artifactId | Int? | - |  |
| ordinal | Int | - |  |
| content | String | - |  |
| contentSha256 | String | - |  |
| locatorJson | String | - |  |
| headingPathJson | String? | - |  |
| tokenCount | Int? | - |  |
| language | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| version | LibraryDocumentVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| artifact | LibraryArtifact? | @relation(fields: [artifactId], references: [id], onDelete: SetNull) |  |
| entityMentions | LibraryEntityMention[] | - |  |

### LibrarySearchIndex

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| indexUid | String | @unique @default(uuid()) |  |
| versionId | Int | - |  |
| artifactId | Int? | - |  |
| kind | String | - |  |
| engineKey | String | - |  |
| modelKey | String? | - |  |
| embeddingDimensions | Int? | - |  |
| generation | Int | - |  |
| status | String | @default("building") |  |
| active | Boolean | @default(false) |  |
| indexChecksum | String? | - |  |
| builtAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| version | LibraryDocumentVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| artifact | LibraryArtifact? | @relation(fields: [artifactId], references: [id], onDelete: SetNull) |  |

### LibraryExportJob

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| exportUid | String | @unique @default(uuid()) |  |
| requestedBy | Int | - |  |
| status | String | @default("queued") |  |
| selectionJson | String | - |  |
| optionsJson | String | - |  |
| manifestSha256 | String? | - |  |
| storagePath | String? | - |  |
| fileSizeBytes | Int? | - |  |
| errorCode | String? | - |  |
| errorMessage | String? | - |  |
| expiresAt | DateTime? | - |  |
| startedAt | DateTime? | - |  |
| finishedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| requester | User | @relation("LibraryExportRequester", fields: [requestedBy], references: [id], onDelete: Restrict) |  |

### LibraryDocument

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| documentUid | String | @unique @default(uuid()) |  |
| docId | String | @unique |  |
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
| categoryId | Int? | - |  |
| currentDirectoryId | Int? | - |  |
| categorySource | String | @default("folder") |  |
| currentVersionId | Int? | @unique |  |
| confidentialityLevel | Int | @default(2) |  |
| status | String | @default("active") |  |
| origin | String | @default("uploaded") |  |
| generatorKey | String? | - |  |
| versionLabel | String? | - |  |
| ownerUserId | Int? | - |  |
| asOfDate | DateTime? | - |  |
| reviewStatus | String | @default("pending") |  |
| reviewedAt | DateTime? | - |  |
| reviewedBy | Int? | - |  |
| gitRepo | String? | - |  |
| gitCommit | String? | - |  |
| gitPath | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("LibraryDocumentEditor", fields: [editedBy], references: [id]) |  |
| owner | User? | @relation("LibraryDocumentOwner", fields: [ownerUserId], references: [id], onDelete: SetNull) |  |
| reviewer | User? | @relation("LibraryDocumentReviewer", fields: [reviewedBy], references: [id], onDelete: SetNull) |  |
| category | LibraryCategory? | @relation(fields: [categoryId], references: [id], onDelete: SetNull) |  |
| currentDirectory | LibraryDirectory? | @relation(fields: [currentDirectoryId], references: [id], onDelete: SetNull) |  |
| currentVersion | LibraryDocumentVersion? | @relation("LibraryDocumentCurrentVersion", fields: [currentVersionId], references: [id], onDelete: SetNull) |  |
| versions | LibraryDocumentVersion[] | @relation("LibraryDocumentVersions") |  |
| tags | LibraryDocumentTag[] | - |  |
| tagCandidates | LibraryTagCandidate[] | - |  |
| metadataCandidates | LibraryMetadataCandidate[] | - |  |
| materialSelections | DueDiligenceMaterialSelection[] | - |  |

### LibraryDocumentVersion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| versionUid | String | @unique @default(uuid()) |  |
| documentId | Int | - |  |
| versionNo | Int | - |  |
| versionLabel | String? | - |  |
| fileName | String | - |  |
| storagePath | String | - |  |
| storageFileName | String? | - |  |
| storageMimeType | String? | - |  |
| storageFileSizeBytes | Int? | - |  |
| storageChecksumSha256 | String? | - |  |
| relativePath | String | - |  |
| extension | String? | - |  |
| mimeType | String? | - |  |
| fileSizeBytes | Int? | - |  |
| sourceModifiedAt | DateTime? | - |  |
| checksumSha256 | String? | - |  |
| gitCommit | String? | - |  |
| changeNote | String? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| document | LibraryDocument | @relation("LibraryDocumentVersions", fields: [documentId], references: [id], onDelete: Cascade) |  |
| currentForDocument | LibraryDocument? | @relation("LibraryDocumentCurrentVersion") |  |
| creator | User? | @relation("LibraryDocumentVersionCreator", fields: [createdBy], references: [id], onDelete: SetNull) |  |
| selections | DueDiligenceMaterialSelection[] | - |  |
| processingJobs | LibraryProcessingJob[] | - |  |
| artifacts | LibraryArtifact[] | - |  |
| chunks | LibraryContentChunk[] | - |  |
| searchIndexes | LibrarySearchIndex[] | - |  |
| tagCandidates | LibraryTagCandidate[] | - |  |
| metadataCandidates | LibraryMetadataCandidate[] | - |  |
| entityMentions | LibraryEntityMention[] | - |  |
| evaluationEvidence | LibraryEvaluationEvidence[] | - |  |

### LibraryCategory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| categoryUid | String | @unique @default(uuid()) |  |
| parentId | Int? | - |  |
| code | String? | @unique |  |
| name | String | - |  |
| fullPath | String | @unique |  |
| status | String | @default("active") |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| parent | LibraryCategory? | @relation("LibraryCategoryTree", fields: [parentId], references: [id], onDelete: SetNull) |  |
| children | LibraryCategory[] | @relation("LibraryCategoryTree") |  |
| documents | LibraryDocument[] | - |  |

### LibraryDirectory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| directoryUid | String | @unique @default(uuid()) |  |
| rootKey | String | @default("default") |  |
| relativePath | String | - |  |
| name | String | - |  |
| status | String | @default("active") |  |
| lastScannedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| documents | LibraryDocument[] | - |  |

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

### LibraryTag

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| tagUid | String | @unique @default(uuid()) |  |
| key | String | @unique |  |
| name | String | - |  |
| dimension | String | @default("theme") |  |
| taxonomyVersion | String | @default("v1") |  |
| status | String | @default("active") |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| documents | LibraryDocumentTag[] | - |  |
| candidates | LibraryTagCandidate[] | - |  |

### LibraryDocumentTag

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| documentId | Int | - |  |
| tagId | Int | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| document | LibraryDocument | @relation(fields: [documentId], references: [id], onDelete: Cascade) |  |
| tag | LibraryTag | @relation(fields: [tagId], references: [id], onDelete: Cascade) |  |
| creator | User? | @relation("LibraryDocumentTagCreator", fields: [createdBy], references: [id], onDelete: SetNull) |  |

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

### DepartmentCollaboration

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| title | String | - |  |
| description | String | @default("") |  |
| collaborationType | String | @default("routine") |  |
| triggerRule | String | @default("") |  |
| scopeDescription | String | @default("") |  |
| inputRequirement | String | @default("") |  |
| deliverable | String | @default("") |  |
| acceptanceCriteria | String | @default("") |  |
| responseTargetHours | Int? | - |  |
| deliveryTargetDays | Int? | - |  |
| effectiveFrom | DateTime? | - |  |
| effectiveTo | DateTime? | - |  |
| escalationPolicy | String | @default("") |  |
| responsibleDepartmentId | Int | - |  |
| status | String | @default("active") |  |
| isArchived | Boolean | @default(false) |  |
| createdByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| responsibleDepartment | Department | @relation("DepartmentCollaborationResponsibleDepartment", fields: [responsibleDepartmentId], references: [id], onDelete: Restrict) |  |
| createdBy | User? | @relation("DepartmentCollaborationCreator", fields: [createdByUserId], references: [id], onDelete: SetNull) |  |
| enablingDepartments | DepartmentCollaborationDepartment[] | - |  |
| positions | DepartmentCollaborationPosition[] | - |  |
| workPlans | WorkPlan[] | - |  |
| workItems | WorkItem[] | - |  |

### DepartmentCollaborationDepartment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| collaborationId | Int | - |  |
| departmentId | Int | - |  |
| responseStatus | String | @default("pending") |  |
| responseNote | String | @default("") |  |
| respondedByUserId | Int? | - |  |
| respondedAt | DateTime? | - |  |
| invitedAt | DateTime | @default(now()) |  |
| collaboration | DepartmentCollaboration | @relation(fields: [collaborationId], references: [id], onDelete: Cascade) |  |
| department | Department | @relation("DepartmentCollaborationEnablingDepartment", fields: [departmentId], references: [id], onDelete: Restrict) |  |
| respondedBy | User? | @relation("DepartmentCollaborationResponder", fields: [respondedByUserId], references: [id], onDelete: SetNull) |  |

### DepartmentCollaborationPosition

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| collaborationId | Int | - |  |
| kind | String | - |  |
| positionId | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| collaboration | DepartmentCollaboration | @relation(fields: [collaborationId], references: [id], onDelete: Cascade) |  |
| position | Position | @relation(fields: [positionId], references: [id], onDelete: Cascade) |  |

### MeetingType

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| key | String | @unique |  |
| name | String | - |  |
| description | String | @default("") |  |
| defaultVisibility | String | @default("participants_only") |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| series | MeetingSeries[] | - |  |
| meetings | Meeting[] | - |  |

### MeetingSeries

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| typeId | Int | - |  |
| title | String | - |  |
| description | String | @default("") |  |
| cadence | String? | - |  |
| defaultVisibility | String | @default("participants_only") |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| type | MeetingType | @relation(fields: [typeId], references: [id], onDelete: Restrict) |  |
| meetings | Meeting[] | - |  |

### Meeting

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| typeId | Int | - |  |
| seriesId | Int? | - |  |
| title | String | - |  |
| description | String | @default("") |  |
| startAt | DateTime? | - |  |
| endAt | DateTime? | - |  |
| location | String | @default("") |  |
| visibility | String | @default("participants_only") |  |
| status | String | @default("scheduled") |  |
| ownerUserId | Int? | - |  |
| secretaryUserId | Int? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| type | MeetingType | @relation(fields: [typeId], references: [id], onDelete: Restrict) |  |
| series | MeetingSeries? | @relation(fields: [seriesId], references: [id], onDelete: SetNull) |  |
| owner | User? | @relation("MeetingOwner", fields: [ownerUserId], references: [id], onDelete: SetNull) |  |
| secretary | User? | @relation("MeetingSecretary", fields: [secretaryUserId], references: [id], onDelete: SetNull) |  |
| participants | MeetingParticipant[] | - |  |
| agendaItems | MeetingAgendaItem[] | - |  |
| minuteEntries | MeetingMinuteEntry[] | - |  |
| proposals | MeetingProposal[] | - |  |
| decisions | MeetingDecision[] | - |  |
| actionCandidates | MeetingActionCandidate[] | - |  |
| sourceWorkItems | WorkItem[] | @relation("WorkItemSourceMeeting") |  |
| sourceWorkPlans | WorkPlan[] | @relation("WorkPlanSourceMeeting") |  |

### MeetingParticipant

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| meetingId | Int | - |  |
| userId | Int | - |  |
| role | String | @default("participant") |  |
| canVote | Boolean | @default(false) |  |
| attendanceStatus | String | @default("invited") |  |
| createdAt | DateTime | @default(now()) |  |
| meeting | Meeting | @relation(fields: [meetingId], references: [id], onDelete: Cascade) |  |
| user | User | @relation("MeetingParticipantUser", fields: [userId], references: [id], onDelete: Cascade) |  |

### MeetingAgendaItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| meetingId | Int | - |  |
| title | String | - |  |
| description | String | @default("") |  |
| presenterUserId | Int? | - |  |
| sortOrder | Int | @default(0) |  |
| status | String | @default("open") |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| meeting | Meeting | @relation(fields: [meetingId], references: [id], onDelete: Cascade) |  |
| minuteEntries | MeetingMinuteEntry[] | - |  |
| proposals | MeetingProposal[] | - |  |
| decisions | MeetingDecision[] | - |  |
| actionCandidates | MeetingActionCandidate[] | - |  |

### MeetingMinuteEntry

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| meetingId | Int | - |  |
| agendaItemId | Int? | - |  |
| content | String | - |  |
| kind | String | @default("note") |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| meeting | Meeting | @relation(fields: [meetingId], references: [id], onDelete: Cascade) |  |
| agendaItem | MeetingAgendaItem? | @relation(fields: [agendaItemId], references: [id], onDelete: SetNull) |  |

### MeetingProposal

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| meetingId | Int | - |  |
| agendaItemId | Int? | - |  |
| title | String | - |  |
| content | String | @default("") |  |
| status | String | @default("open") |  |
| voteVisibility | String | @default("named") |  |
| minVotesRequired | Int? | - |  |
| createdBy | Int? | - |  |
| closedBy | Int? | - |  |
| closedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| meeting | Meeting | @relation(fields: [meetingId], references: [id], onDelete: Cascade) |  |
| agendaItem | MeetingAgendaItem? | @relation(fields: [agendaItemId], references: [id], onDelete: SetNull) |  |
| votes | MeetingVote[] | - |  |
| decisions | MeetingDecision[] | - |  |

### MeetingVote

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| proposalId | Int | - |  |
| voterUserId | Int | - |  |
| choice | String | - |  |
| note | String | @default("") |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| proposal | MeetingProposal | @relation(fields: [proposalId], references: [id], onDelete: Cascade) |  |
| voter | User | @relation("MeetingVoteUser", fields: [voterUserId], references: [id], onDelete: Cascade) |  |

### MeetingDecision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| meetingId | Int | - |  |
| agendaItemId | Int? | - |  |
| proposalId | Int? | - |  |
| kind | String | @default("decision") |  |
| title | String | - |  |
| content | String | @default("") |  |
| status | String | @default("active") |  |
| effectiveDate | DateTime? | - |  |
| decidedAt | DateTime | @default(now()) |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| meeting | Meeting | @relation(fields: [meetingId], references: [id], onDelete: Cascade) |  |
| agendaItem | MeetingAgendaItem? | @relation(fields: [agendaItemId], references: [id], onDelete: SetNull) |  |
| proposal | MeetingProposal? | @relation(fields: [proposalId], references: [id], onDelete: SetNull) |  |
| actionCandidates | MeetingActionCandidate[] | - |  |
| sourceWorkItems | WorkItem[] | @relation("WorkItemSourceMeetingDecision") |  |
| sourceWorkPlans | WorkPlan[] | @relation("WorkPlanSourceMeetingDecision") |  |

### MeetingActionCandidate

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| meetingId | Int | - |  |
| agendaItemId | Int? | - |  |
| decisionId | Int? | - |  |
| title | String | - |  |
| description | String | @default("") |  |
| targetKind | String | @default("work_item") |  |
| status | String | @default("candidate") |  |
| linkedWorkItemId | Int? | - |  |
| linkedWorkPlanId | Int? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| meeting | Meeting | @relation(fields: [meetingId], references: [id], onDelete: Cascade) |  |
| agendaItem | MeetingAgendaItem? | @relation(fields: [agendaItemId], references: [id], onDelete: SetNull) |  |
| decision | MeetingDecision? | @relation(fields: [decisionId], references: [id], onDelete: SetNull) |  |
| linkedWorkItem | WorkItem? | @relation("MeetingActionCandidateWorkItem", fields: [linkedWorkItemId], references: [id], onDelete: SetNull) |  |
| linkedWorkPlan | WorkPlan? | @relation("MeetingActionCandidateWorkPlan", fields: [linkedWorkPlanId], references: [id], onDelete: SetNull) |  |
| sourceWorkItems | WorkItem[] | @relation("WorkItemSourceMeetingActionCandidate") |  |
| sourceWorkPlans | WorkPlan[] | @relation("WorkPlanSourceMeetingActionCandidate") |  |

### WorkPlanAlignment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| childPlanId | Int | - |  |
| sourceType | String | - |  |
| sourcePlanId | Int? | - |  |
| sourceWorkItemId | Int? | - |  |
| relationKind | String | @default("decompose") |  |
| note | String | @default("") |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| childPlan | WorkPlan | @relation("WorkPlanAlignmentChildPlan", fields: [childPlanId], references: [id], onDelete: Cascade) |  |
| sourcePlan | WorkPlan? | @relation("WorkPlanAlignmentSourcePlan", fields: [sourcePlanId], references: [id], onDelete: SetNull) |  |
| sourceWorkItem | WorkItem? | @relation("WorkPlanAlignmentSourceItem", fields: [sourceWorkItemId], references: [id], onDelete: SetNull) |  |

### WorkOkrCycle

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| periodType | String | - |  |
| code | String | @unique |  |
| label | String | - |  |
| year | Int | - |  |
| sequence | Int | - |  |
| parentId | Int? | - |  |
| startDate | DateTime | - |  |
| endDate | DateTime | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| parent | WorkOkrCycle? | @relation("WorkOkrCycleHierarchy", fields: [parentId], references: [id], onDelete: SetNull) |  |
| children | WorkOkrCycle[] | @relation("WorkOkrCycleHierarchy") |  |
| plans | WorkPlan[] | - |  |
| policies | WorkOkrControlPolicy[] | - |  |

### WorkOkrControlPolicy

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| cycleId | Int | - |  |
| scopeType | String | @default("global") |  |
| scopeId | String | @default("") |  |
| isLocked | Boolean | @default(false) |  |
| objectiveSubmitDeadline | DateTime? | - |  |
| krReviewOpensAt | DateTime? | - |  |
| krSubmitDeadline | DateTime? | - |  |
| createdByUserId | Int? | - |  |
| updatedByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| cycle | WorkOkrCycle | @relation(fields: [cycleId], references: [id], onDelete: Cascade) |  |

### Project

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String? | @unique |  |
| name | String | - |  |
| description | String? | - |  |
| projectType | String | @default("department") |  |
| projectLevel | String | @default("普通") |  |
| plan | String? | - |  |
| goal | String? | - |  |
| milestones | String? | - |  |
| budgetAmount | Float? | - |  |
| budgetNote | String? | - |  |
| riskNote | String? | - |  |
| remark | String? | - |  |
| status | String | @default("pending") |  |
| plannedStartDate | DateTime? | - |  |
| plannedEndDate | DateTime? | - |  |
| actualStartDate | DateTime? | - |  |
| actualEndDate | DateTime? | - |  |
| completionPercent | Float? | - |  |
| closureType | String? | - |  |
| leadingDepartmentId | Int? | - |  |
| owningDepartmentId | Int? | - |  |
| workspaceEnabled | Boolean | @default(false) |  |
| isArchived | Boolean | @default(false) |  |
| archivedAt | DateTime? | - |  |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| leadingDepartment | Department? | @relation("ProjectLeadingDepartment", fields: [leadingDepartmentId], references: [id], onDelete: SetNull) |  |
| owningDepartment | Department? | @relation("ProjectOwningDepartment", fields: [owningDepartmentId], references: [id], onDelete: SetNull) |  |
| employees | EmployeeProject[] | - |  |
| enablingDepartments | ProjectEnablingDepartment[] | - |  |
| planPhases | ProjectPlanPhase[] | @relation("ProjectPlanPhases") |  |
| planDependencies | ProjectPlanDependency[] | @relation("ProjectPlanDependencies") |  |
| planBaselines | ProjectPlanBaseline[] | @relation("ProjectPlanBaselines") |  |
| workAssignees | ProjectWorkAssignee[] | - |  |
| linkedWorkItems | WorkItem[] | @relation("WorkItemLinkedProject") |  |
| linkedWorkPlans | WorkPlan[] | @relation("WorkPlanLinkedProject") |  |

### ProjectEnablingDepartment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| projectId | Int | - |  |
| departmentId | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| project | Project | @relation(fields: [projectId], references: [id], onDelete: Cascade) |  |
| department | Department | @relation("ProjectEnablingDepartmentDepartment", fields: [departmentId], references: [id], onDelete: Cascade) |  |

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
| plannedStartDate | DateTime? | - |  |
| plannedEndDate | DateTime? | - |  |
| note | String? | - |  |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| project | Project | @relation("ProjectPlanPhases", fields: [projectId], references: [id], onDelete: Cascade) |  |
| linkedWorkItems | WorkItem[] | @relation("WorkItemLinkedProjectPhase") |  |
| linkedWorkPlans | WorkPlan[] | @relation("WorkPlanLinkedProjectPhase") |  |

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
| plannedStartDate | DateTime? | - |  |
| plannedEndDate | DateTime? | - |  |
| baseline | ProjectPlanBaseline | @relation(fields: [baselineId], references: [id], onDelete: Cascade) |  |

### WorkReport

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| targetType | String | - |  |
| targetId | Int | - |  |
| periodType | String | @default("weekly") |  |
| reportStage | String | @default("final") |  |
| periodStart | DateTime | - |  |
| periodEnd | DateTime | - |  |
| submittedBy | Int | - |  |
| submittedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| submitter | User | @relation("WorkReportSubmitter", fields: [submittedBy], references: [id], onDelete: Cascade) |  |
| items | WorkReportItem[] | - |  |

### WorkReportItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| reportId | Int | - |  |
| workPlanId | Int? | - |  |
| workItemId | Int? | - |  |
| title | String | - |  |
| workPlanTitleSnapshot | String | @default("") |  |
| workPlanKindSnapshot | String | @default("") |  |
| workItemTypeSnapshot | String | @default("") |  |
| parentWorkItemIdSnapshot | Int? | - |  |
| parentTitleSnapshot | String | @default("") |  |
| objectiveTitleSnapshot | String | @default("") |  |
| keyResultTitleSnapshot | String | @default("") |  |
| reportItemKindSnapshot | String | @default("") |  |
| workItemStatusSnapshot | String | @default("") |  |
| snapshotPlannedStartDate | DateTime? | - |  |
| snapshotPlannedEndDate | DateTime? | - |  |
| snapshotActualEndDate | DateTime? | - |  |
| snapshotCompletedAt | DateTime? | - |  |
| previousPlanSnapshot | String | @default("") |  |
| doneThisWeek | String | @default("") |  |
| planNextWeek | String | @default("") |  |
| note | String | @default("") |  |
| selfScore | Int? | - |  |
| performanceScore | Int? | - |  |
| sortOrder | Int | @default(0) |  |
| report | WorkReport | @relation(fields: [reportId], references: [id], onDelete: Cascade) |  |
| workPlan | WorkPlan? | @relation(fields: [workPlanId], references: [id], onDelete: SetNull) |  |
| workItem | WorkItem? | @relation(fields: [workItemId], references: [id], onDelete: SetNull) |  |

### PositionResponsibilityNode

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| positionDescriptionId | Int | - |  |
| parentId | Int? | - |  |
| nodeKey | String | @unique |  |
| nodeType | String | - |  |
| title | String | - |  |
| content | String | @default("") |  |
| pathLabel | String | @default("") |  |
| sourcePath | String | @default("") |  |
| sourceHash | String | - |  |
| descriptionVersion | String? | - |  |
| descriptionUpdatedAt | DateTime? | - |  |
| sortOrder | Int | @default(0) |  |
| isActive | Boolean | @default(true) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| positionDescription | PositionDescription | @relation(fields: [positionDescriptionId], references: [id], onDelete: Cascade) |  |
| parent | PositionResponsibilityNode? | @relation("PositionResponsibilityNodeTree", fields: [parentId], references: [id], onDelete: SetNull) |  |
| children | PositionResponsibilityNode[] | @relation("PositionResponsibilityNodeTree") |  |
| workReferences | WorkResponsibilityReference[] | - |  |

### WorkResponsibilityReference

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| targetKind | String | - |  |
| referenceRole | String | - |  |
| workItemId | Int | - |  |
| responsibilityNodeId | Int? | - |  |
| lockedEmployeeId | Int | - |  |
| lockedPositionId | Int? | - |  |
| lockedEmployeePositionId | Int? | - |  |
| positionDescriptionId | Int | - |  |
| positionDescriptionVersionSnapshot | String? | - |  |
| positionDescriptionUpdatedAtSnapshot | DateTime? | - |  |
| nodeKeySnapshot | String | - |  |
| nodeTypeSnapshot | String | - |  |
| parentNodeKeySnapshot | String? | - |  |
| pathLabelSnapshot | String | @default("") |  |
| titleSnapshot | String | - |  |
| contentSnapshot | String | @default("") |  |
| snapshotJson | String | @default("{ |  |

### WorkPlan

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| targetType | String | @default("personal") |  |
| targetId | Int | - |  |
| kind | String | @default("okr") |  |
| title | String | - |  |
| description | String | @default("") |  |
| status | String | @default("active") |  |
| isArchived | Boolean | @default(false) |  |
| okrStage | String | @default("objective_draft") |  |
| objectiveSubmittedAt | DateTime? | - |  |
| objectiveApprovedAt | DateTime? | - |  |
| objectiveApprovedByUserId | Int? | - |  |
| krReviewOpensAt | DateTime? | - |  |
| krSubmittedAt | DateTime? | - |  |
| krApprovedAt | DateTime? | - |  |
| krApprovedByUserId | Int? | - |  |
| ownerEmployeeId | Int? | - |  |
| collaborationId | Int? | - |  |
| okrCycleId | Int? | - |  |
| sourcePlanId | Int? | - |  |
| parentPeriodPlanId | Int? | - |  |
| previousPeriodPlanId | Int? | - |  |
| okrControlScopeType | String? | - |  |
| okrControlScopeId | String? | - |  |
| objectiveApprovalSnapshotJson | String | @default("{ |  |

### WorkItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| planId | Int? | - |  |
| targetType | String | @default("personal") |  |
| targetId | Int? | - |  |
| category | String | - |  |
| itemType | String | @default("task") |  |
| content | String | - |  |
| description | String | @default("") |  |
| importance | Int | @default(3) |  |
| urgency | Int | @default(3) |  |
| status | String? | - |  |
| completedAt | DateTime? | - |  |
| krStartValue | Float? | - |  |
| krTargetValue | Float? | - |  |
| krCurrentValue | Float? | - |  |
| krUnit | String? | - |  |
| routineTaskType | String? | - |  |
| routineRecurrenceType | String? | - |  |
| routineRecurrenceTime | String? | - |  |
| routineRecurrenceWeekday | Int? | - |  |
| routineRecurrenceMonthDay | Int? | - |  |
| routineRecurrenceQuarterDay | Int? | - |  |
| routineRecurrenceYearMonth | Int? | - |  |
| routineRecurrenceYearDay | Int? | - |  |
| ownerEmployeeId | Int? | - |  |
| collaborationId | Int? | - |  |
| actualStartDate | DateTime? | - |  |
| actualEndDate | DateTime? | - |  |
| plannedStartDate | DateTime? | - |  |
| plannedEndDate | DateTime? | - |  |
| isMilestone | Boolean | @default(false) |  |
| milestoneDate | DateTime? | - |  |
| periodType | String? | - |  |
| periodStart | DateTime? | - |  |
| periodEnd | DateTime? | - |  |
| sourceType | String | @default("other") |  |
| sourceKind | String? | - |  |
| sourceMeetingId | Int? | - |  |
| sourceMeetingDecisionId | Int? | - |  |
| sourceMeetingActionCandidateId | Int? | - |  |
| sourceDepartmentId | Int? | - |  |
| linkedProjectId | Int? | - |  |
| linkedProjectPhaseId | Int? | - |  |
| parentWorkItemId | Int? | - |  |
| parentPeriodWorkItemId | Int? | - |  |
| previousPeriodWorkItemId | Int? | - |  |
| isArchived | Boolean | @default(false) |  |
| isPrivate | Boolean | @default(false) |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| plan | WorkPlan? | @relation(fields: [planId], references: [id], onDelete: Cascade) |  |
| participants | WorkParticipant[] | - |  |
| owner | Employee? | @relation("WorkItemOwner", fields: [ownerEmployeeId], references: [id], onDelete: SetNull) |  |
| collaboration | DepartmentCollaboration? | @relation(fields: [collaborationId], references: [id], onDelete: SetNull) |  |
| linkedProject | Project? | @relation("WorkItemLinkedProject", fields: [linkedProjectId], references: [id], onDelete: SetNull) |  |
| linkedProjectPhase | ProjectPlanPhase? | @relation("WorkItemLinkedProjectPhase", fields: [linkedProjectPhaseId], references: [id], onDelete: SetNull) |  |
| sourceMeeting | Meeting? | @relation("WorkItemSourceMeeting", fields: [sourceMeetingId], references: [id], onDelete: SetNull) |  |
| sourceMeetingDecision | MeetingDecision? | @relation("WorkItemSourceMeetingDecision", fields: [sourceMeetingDecisionId], references: [id], onDelete: SetNull) |  |
| sourceMeetingActionCandidate | MeetingActionCandidate? | @relation("WorkItemSourceMeetingActionCandidate", fields: [sourceMeetingActionCandidateId], references: [id], onDelete: SetNull) |  |
| sourceDepartment | Department? | @relation("WorkItemSourceDepartment", fields: [sourceDepartmentId], references: [id], onDelete: SetNull) |  |
| parentWorkItem | WorkItem? | @relation("WorkItemHierarchy", fields: [parentWorkItemId], references: [id], onDelete: SetNull) |  |
| childWorkItems | WorkItem[] | @relation("WorkItemHierarchy") |  |
| parentPeriodWorkItem | WorkItem? | @relation("WorkItemParentPeriod", fields: [parentPeriodWorkItemId], references: [id], onDelete: SetNull) |  |
| childPeriodWorkItems | WorkItem[] | @relation("WorkItemParentPeriod") |  |
| previousPeriodWorkItem | WorkItem? | @relation("WorkItemPreviousPeriod", fields: [previousPeriodWorkItemId], references: [id], onDelete: SetNull) |  |
| nextPeriodWorkItems | WorkItem[] | @relation("WorkItemPreviousPeriod") |  |
| sourcePlanAlignments | WorkPlanAlignment[] | @relation("WorkPlanAlignmentSourceItem") |  |
| meetingActionCandidates | MeetingActionCandidate[] | @relation("MeetingActionCandidateWorkItem") |  |
| reportItems | WorkReportItem[] | - |  |
| krEvidenceTasks | WorkKrEvidence[] | @relation("WorkKrEvidenceKr") |  |
| taskEvidenceForKrs | WorkKrEvidence[] | @relation("WorkKrEvidenceTask") |  |
| responsibilityReferences | WorkResponsibilityReference[] | - |  |

### WorkKrEvidence

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| krWorkItemId | Int | - |  |
| taskWorkItemId | Int | - |  |
| note | String | @default("") |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| krWorkItem | WorkItem | @relation("WorkKrEvidenceKr", fields: [krWorkItemId], references: [id], onDelete: Cascade) |  |
| taskWorkItem | WorkItem | @relation("WorkKrEvidenceTask", fields: [taskWorkItemId], references: [id], onDelete: Cascade) |  |

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
