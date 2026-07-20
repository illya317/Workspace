# 数据库表结构

> 本文档由 `scripts/generate/gen-db-docs.js` 自动生成，基于 `prisma/models/*.prisma`。

## 模型列表

### AgentProfile

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| key | String | @unique |  |
| actorUserId | Int | @unique |  |
| displayName | String | - |  |
| roleName | String | - |  |
| responsibilities | String | - |  |
| allowedToolKeysJson | String | - |  |
| status | String | @default("active") | active | suspended |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| actorUser | User | @relation("AgentProfileActor", fields: [actorUserId], references: [id], onDelete: Restrict) |  |
| runtimeBindings | AgentRuntimeBinding[] | - |  |
| sessions | AgentSession[] | - |  |
| proposals | AgentProposal[] | - |  |
| runs | AgentRun[] | - |  |

### AgentRuntimeBinding

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| agentProfileId | Int | - |  |
| runtimeKind | String | - | workspace | codex_local | ci | server_ops |
| status | String | @default("active") | active | suspended |
| interactive | Boolean | @default(false) |  |
| capabilityKeysJson | String | - |  |
| instructions | String | - |  |
| createdBy | Int? | - |  |
| editedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| agentProfile | AgentProfile | @relation(fields: [agentProfileId], references: [id], onDelete: Restrict) |  |
| runs | AgentRun[] | - |  |

### AgentSession

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | String | @id |  |
| userId | Int | - |  |
| agentProfileId | Int? | - |  |
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
| agentProfile | AgentProfile? | @relation(fields: [agentProfileId], references: [id], onDelete: Restrict) |  |
| runs | AgentRun[] | - |  |

### AgentProposal

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| userId | Int | - |  |
| actorUserId | Int? | - |  |
| agentProfileId | Int? | - |  |
| sessionId | String? | - |  |
| status | String | @default("pending") | pending | executing | confirmed | cancelled | failed | expired |
| actionKey | String | - | 工具 key，如 hr.updateEmployee |
| toolKey | String? | - |  |
| targetType | String | - | 目标实体，如 Employee |
| targetId | String? | - | 目标记录标识 |
| payloadJson | String | - | 变更内容 JSON |
| diffJson | String? | - | 变更前后对比 JSON |
| resultJson | String? | - | 执行结果 JSON |
| executionToken | String? | - |  |
| executionStartedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| confirmedAt | DateTime? | - |  |
| agentProfile | AgentProfile? | @relation(fields: [agentProfileId], references: [id], onDelete: Restrict) |  |

### AgentRun

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | String | @id |  |
| sessionId | String | - |  |
| requesterUserId | Int | - |  |
| actorUserId | Int | - |  |
| agentProfileId | Int? | - |  |
| runtimeBindingId | Int? | - |  |
| runtimeKind | String | @default("workspace") | workspace | codex_local | ci | server_ops |
| runtimeConfigJson | String? | - |  |
| runtimeConfigHash | String? | - |  |
| status | String | @default("running") | running | succeeded | failed | aborted |
| pagePath | String? | - |  |
| toolKey | String? | - |  |
| resultType | String? | - |  |
| proposalId | Int? | - |  |
| errorMessage | String? | - |  |
| inputOtherTokens | Int? | - |  |
| inputCacheReadTokens | Int? | - |  |
| inputCacheCreationTokens | Int? | - |  |
| outputTokens | Int? | - |  |
| contextUsagePeak | Float? | - |  |
| runtimeStepCount | Int? | - |  |
| runtimeOutcome | String? | - |  |
| startedAt | DateTime | @default(now()) |  |
| finishedAt | DateTime? | - |  |
| session | AgentSession | @relation(fields: [sessionId], references: [id], onDelete: Cascade) |  |
| agentProfile | AgentProfile? | @relation(fields: [agentProfileId], references: [id], onDelete: Restrict) |  |
| runtimeBinding | AgentRuntimeBinding? | @relation(fields: [runtimeBindingId], references: [id], onDelete: Restrict) |  |

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
| agentProfile | AgentProfile? | @relation("AgentProfileActor") |  |
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
| mutationImpactBatches | MutationImpactBatch[] | @relation("MutationImpactBatchActor") |  |
| createdKpiDefinitions | WorkKpiDefinition[] | @relation("WorkKpiDefinitionCreator") |  |
| updatedKpiAssignments | WorkKpiAssignment[] | @relation("WorkKpiAssignmentUpdater") |  |
| approvedKpiResultSnapshots | WorkKpiResultSnapshot[] | @relation("WorkKpiResultSnapshotApprover") |  |

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

### FinanceAssetCard

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| assetCode | String | - |  |
| name | String | - |  |
| assetKind | String | - |  |
| category | String? | - |  |
| assetAccountCode | String | - |  |
| accumulatedAccountCode | String? | - |  |
| acquisitionDate | String? | - |  |
| depreciationStartDate | String? | - |  |
| originalCost | Decimal | @db.Decimal(20, 2) |  |
| residualRate | Decimal | @default(0) @db.Decimal(10, 6) |  |
| usefulLifeMonths | Int? | - |  |
| method | String | @default("straight_line") |  |
| openingAccumulatedAmount | Decimal | @default(0) @db.Decimal(20, 2) |  |
| openingAsOfDate | String? | - |  |
| status | String | @default("active") |  |
| nonAmortizationReason | String? | - |  |
| note | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceKey | String? | - |  |
| editedBy | Int? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| costLines | FinanceAssetCostLine[] | - |  |
| allocations | FinanceAssetExpenseAllocation[] | - |  |
| periodEntries | FinanceAssetPeriodEntry[] | - |  |
| adjustments | FinanceAssetAdjustment[] | - |  |

### FinanceAssetCostLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| assetId | Int | - |  |
| lineType | String | @default("invoice") |  |
| treatment | String | @default("included") |  |
| referenceNo | String? | - |  |
| referenceDate | String? | - |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| reason | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceKey | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| asset | FinanceAssetCard | @relation(fields: [assetId], references: [id], onDelete: Cascade) |  |

### FinanceAssetExpenseAllocation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| assetId | Int | - |  |
| expenseAccountCode | String | - |  |
| allocationRate | Decimal | @db.Decimal(10, 6) |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| asset | FinanceAssetCard | @relation(fields: [assetId], references: [id], onDelete: Cascade) |  |

### FinanceAssetImportBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| sourceFile | String | - |  |
| checksum | String | - |  |
| status | String | @default("confirmed") |  |
| cardCount | Int | @default(0) |  |
| costLineCount | Int | @default(0) |  |
| warningCount | Int | @default(0) |  |
| importedBy | Int? | - |  |
| importedAt | DateTime | @default(now()) |  |
| note | String? | - |  |

### FinanceAssetPeriodEntry

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| assetId | Int | - |  |
| periodId | Int | - |  |
| normalAmount | Decimal | @db.Decimal(20, 2) |  |
| status | String | @default("calculated") |  |
| calculationVersion | String | @default("straight-line-v1") |  |
| voucherId | Int? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| asset | FinanceAssetCard | @relation(fields: [assetId], references: [id], onDelete: Cascade) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Cascade) |  |
| voucher | FinanceVoucher? | @relation(fields: [voucherId], references: [id], onDelete: SetNull) |  |

### FinanceAssetAdjustment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| periodId | Int | - |  |
| assetId | Int? | - |  |
| accountCode | String | - |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| reason | String | - |  |
| status | String | @default("confirmed") |  |
| reversedById | Int? | - |  |
| voucherId | Int? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceKey | String? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| asset | FinanceAssetCard? | @relation(fields: [assetId], references: [id], onDelete: SetNull) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Cascade) |  |
| voucher | FinanceVoucher? | @relation(fields: [voucherId], references: [id], onDelete: SetNull) |  |

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

### FinanceCashFlowItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| sourceSystem | String | - |  |
| sourceLedger | String | - |  |
| sourceCode | String | - |  |
| sourceName | String | - |  |
| parentId | Int? | - |  |
| direction | String? | - |  |
| firstYear | Int? | - |  |
| lastYear | Int? | - |  |
| latestImportId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| latestImport | FinanceLedgerImport? | @relation(fields: [latestImportId], references: [id]) |  |
| parent | FinanceCashFlowItem? | @relation("FinanceCashFlowHierarchy", fields: [parentId], references: [id]) |  |
| children | FinanceCashFlowItem[] | @relation("FinanceCashFlowHierarchy") |  |
| allocations | FinanceCashFlowAllocation[] | - |  |

### FinanceCashFlowAllocation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| companyCode | String | - |  |
| periodId | Int | - |  |
| voucherId | Int | - |  |
| cashFlowItemId | Int | - |  |
| ownerVoucherItemId | Int? | - |  |
| counterpartItemId | Int? | - |  |
| sourceSystem | String | - |  |
| sourceDatabase | String | - |  |
| sourceKey | String | - |  |
| direction | String | - |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| voucher | FinanceVoucher | @relation(fields: [voucherId], references: [id], onDelete: Cascade) |  |
| cashFlowItem | FinanceCashFlowItem | @relation(fields: [cashFlowItemId], references: [id]) |  |
| ownerVoucherItem | FinanceVoucherItem? | @relation("FinanceCashFlowOwnerItem", fields: [ownerVoucherItemId], references: [id]) |  |
| counterpartItem | FinanceVoucherItem? | @relation("FinanceCashFlowCounterpartItem", fields: [counterpartItemId], references: [id]) |  |

### FinanceConsolidationOutputSnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | @unique |  |
| version | Int | - |  |
| inputFingerprint | String | - |  |
| outputFingerprint | String | - |  |
| reportPayload | Json | - |  |
| generatedAt | DateTime | @default(now()) |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Restrict) |  |

### FinanceConsolidationBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| parentCompanyId | Int | - |  |
| parentCompanyCode | String | - |  |
| parentCompanyName | String | - |  |
| year | Int | - |  |
| month | Int | - |  |
| version | Int | - |  |
| revision | Int | @default(1) |  |
| status | String | @default("draft") | draft | submitted | reviewed | locked | published |
| baseBatchId | Int? | - |  |
| scopeFingerprint | String | - |  |
| sourceFingerprint | String | - |  |
| rateFingerprint | String | - |  |
| createdBy | Int | - |  |
| submittedBy | Int? | - |  |
| submittedAt | DateTime? | - |  |
| reviewedBy | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| reviewNote | String? | - |  |
| lockedBy | Int? | - |  |
| lockedAt | DateTime? | - |  |
| publishedBy | Int? | - |  |
| publishedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| baseBatch | FinanceConsolidationBatch? | @relation("FinanceConsolidationBatchVersionChain", fields: [baseBatchId], references: [id], onDelete: Restrict) |  |
| derivedBatches | FinanceConsolidationBatch[] | @relation("FinanceConsolidationBatchVersionChain") |  |
| entities | FinanceConsolidationEntitySnapshot[] | - |  |
| sources | FinanceConsolidationSourceSnapshot[] | - |  |
| exchangeRates | FinanceConsolidationRateSnapshot[] | - |  |
| entries | FinanceConsolidationEntry[] | - |  |
| controlDecisions | FinanceConsolidationControlDecision[] | - |  |
| events | FinanceConsolidationBatchEvent[] | - |  |
| outputSnapshot | FinanceConsolidationOutputSnapshot? | - |  |

### FinanceConsolidationBatchEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| eventType | String | - | lifecycle | mutation |
| action | String | - | create | submit | return | review | lock | publish | entry.delete | taxEffect.delete |
| fromStatus | String | - |  |
| toStatus | String | - |  |
| note | String? | - |  |
| actorUserId | Int | - |  |
| actorName | String | - |  |
| batchRevision | Int | - |  |
| targetType | String? | - |  |
| targetId | Int? | - |  |
| snapshot | Json? | - |  |
| createdAt | DateTime | @default(now()) |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Restrict) |  |

### FinanceConsolidationControlDecision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| controlKey | String | - | scope | ownership | sources | fx | eliminations | tax |
| decision | String | - | completed | notApplicable |
| conclusion | String | - |  |
| evidence | String | - |  |
| decidedBy | Int | - |  |
| decidedAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |

### FinanceConsolidationEntitySnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| companyId | Int | - |  |
| companyCode | String | - |  |
| companyName | String | - |  |
| role | String | - | parent | subsidiary |
| directParentCompanyId | Int? | - |  |
| directParentCode | String? | - |  |
| relationId | Int? | - |  |
| relationUpdatedAt | DateTime? | - |  |
| relationEffectiveFrom | DateTime? | - |  |
| relationEffectiveTo | DateTime? | - |  |
| relationVersion | Int? | - |  |
| shareRatio | Decimal? | @db.Decimal(12, 8) |  |
| isConsolidated | Boolean | @default(true) |  |
| functionalCurrency | String? | - |  |
| currencyEvidence | String? | - |  |
| currencyDecidedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |
| sources | FinanceConsolidationSourceSnapshot[] | - |  |
| taxEffects | FinanceConsolidationTaxEffect[] | - |  |

### FinanceConsolidationSourceSnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| entitySnapshotId | Int | - |  |
| reportType | String | - | balanceSheet | incomeStatement | cashFlow |
| sourceKind | String | - | workpaper | system | missing |
| sourceStatus | String | - | submitted | draft | available | missing |
| workpaperId | Int? | - |  |
| workpaperVersion | Int? | - |  |
| sourceChecksum | String? | - |  |
| workpaperUpdatedBy | Int? | - |  |
| sourcePackageId | Int? | - |  |
| sourcePackageRevision | Int? | - |  |
| sourcePackageStatus | String? | - |  |
| sourcePackageChecksum | String? | - |  |
| sourcePackageUploadedBy | Int? | - |  |
| sourcePackageSubmittedBy | Int? | - |  |
| lineCount | Int | @default(0) |  |
| sourcedLineCount | Int | @default(0) |  |
| importedLineCount | Int | @default(0) |  |
| manualLineCount | Int | @default(0) |  |
| formulaLineCount | Int | @default(0) |  |
| reportPayload | Json | - |  |
| fingerprint | String | - |  |
| evidence | String? | - |  |
| selectedBy | Int | - |  |
| selectedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |
| entity | FinanceConsolidationEntitySnapshot | @relation(fields: [entitySnapshotId], references: [id], onDelete: Cascade) |  |

### FinanceConsolidationRateSnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| exchangeRateId | Int | - |  |
| exchangeRateVersion | Int | - |  |
| baseCurrency | String | - |  |
| quoteCurrency | String | - |  |
| rateKind | String | - |  |
| rateDate | String | - |  |
| rate | Decimal | @db.Decimal(20, 8) |  |
| sourceUrl | String | - |  |
| publishedAt | DateTime? | - |  |
| verifiedBy | Int? | - |  |
| verifiedAt | DateTime? | - |  |
| applications | Json | @default("[]") |  |
| createdAt | DateTime | @default(now()) |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |

### FinanceConsolidationEntry

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| entryNo | String | - |  |
| entryType | String | - | investmentEquity | nonControllingInterest | intercompanyBalance | internalTrading | internalLongTermAsset | incomeDividend | cashFlow |
| title | String | - |  |
| description | String? | - |  |
| evidence | String | - |  |
| matchDifference | Decimal? | @db.Decimal(20, 2) |  |
| differenceResolution | String? | - |  |
| status | String | @default("draft") | draft | submitted | approved | reversed |
| version | Int | @default(1) |  |
| supersedesEntryId | Int? | - |  |
| reversalOfEntryId | Int? | - |  |
| predecessorEntryId | Int? | @unique |  |
| preparedBy | Int | - |  |
| submittedBy | Int? | - |  |
| submittedAt | DateTime? | - |  |
| approvedBy | Int? | - |  |
| approvedAt | DateTime? | - |  |
| approvalNote | String? | - |  |
| reversedBy | Int? | - |  |
| reversedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |
| supersedes | FinanceConsolidationEntry? | @relation("FinanceConsolidationEntryRevision", fields: [supersedesEntryId], references: [id], onDelete: Restrict) |  |
| revisions | FinanceConsolidationEntry[] | @relation("FinanceConsolidationEntryRevision") |  |
| reversalOf | FinanceConsolidationEntry? | @relation("FinanceConsolidationEntryReversal", fields: [reversalOfEntryId], references: [id], onDelete: Restrict) |  |
| reversalEntries | FinanceConsolidationEntry[] | @relation("FinanceConsolidationEntryReversal") |  |
| predecessor | FinanceConsolidationEntry? | @relation("FinanceConsolidationEntryLineage", fields: [predecessorEntryId], references: [id], onDelete: Restrict) |  |
| successor | FinanceConsolidationEntry? | @relation("FinanceConsolidationEntryLineage") |  |
| lines | FinanceConsolidationEntryLine[] | - |  |
| taxEffects | FinanceConsolidationTaxEffect[] | - |  |

### FinanceConsolidationEntryLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| entryId | Int | - |  |
| lineNo | Int | - |  |
| companyId | Int | - |  |
| companyCode | String | - |  |
| statementType | String | - | balanceSheet | incomeStatement | cashFlow |
| lineCode | String | - |  |
| accountCode | String? | - |  |
| debit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| credit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| currencyCode | String | @default("CNY") |  |
| periodBasis | String | @default("current") | current | comparative |
| note | String? | - |  |
| matchSide | String? | - | left | right |
| sourceKind | String? | - | auxiliaryBalance | openItem | cashFlowAllocation | workpaper | voucher | other |
| sourceId | String? | - |  |
| sourceFingerprint | String? | - |  |
| sourceAmount | Decimal? | @db.Decimal(20, 2) |  |
| sourceCurrency | String? | - |  |
| counterpartyCompanyId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| entry | FinanceConsolidationEntry | @relation(fields: [entryId], references: [id], onDelete: Cascade) |  |

### FinanceConsolidationTaxEffect

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| entryId | Int | - |  |
| entitySnapshotId | Int? | - |  |
| effectKey | String | - |  |
| taxEffectType | String | - | deductible | taxable |
| differenceAmount | Decimal | @db.Decimal(20, 2) |  |
| taxRate | Decimal | @db.Decimal(12, 8) |  |
| recognition | String | - | asset | liability | unrecognized |
| periodBasis | String | @default("current") | current | comparative |
| jurisdiction | String? | - |  |
| recognitionLocation | String? | - | profitOrLoss | otherComprehensiveIncome | equity |
| balanceSheetLineCode | String? | - |  |
| counterpartLineCode | String? | - |  |
| reversalPeriod | String? | - |  |
| recoverabilityConclusion | String | - |  |
| evidence | String | - |  |
| preparedBy | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| entry | FinanceConsolidationEntry | @relation(fields: [entryId], references: [id], onDelete: Cascade) |  |
| entity | FinanceConsolidationEntitySnapshot? | @relation(fields: [entitySnapshotId], references: [id], onDelete: Restrict) |  |

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

### FinanceAuxiliaryMember

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| sourceSystem | String | - |  |
| sourceLedger | String | - |  |
| dimensionType | String | - |  |
| sourceCode | String | - |  |
| sourceName | String | - |  |
| shortName | String? | - |  |
| identityNumber | String? | - |  |
| contactPerson | String? | - |  |
| phone | String? | - |  |
| address | String? | - |  |
| bankName | String? | - |  |
| bankAccount | String? | - |  |
| firstYear | Int? | - |  |
| lastYear | Int? | - |  |
| latestImportId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| latestImport | FinanceLedgerImport? | @relation(fields: [latestImportId], references: [id]) |  |
| voucherLinks | FinanceVoucherItemAuxiliary[] | - |  |
| balanceLinks | FinanceAuxiliaryBalanceMember[] | - |  |
| openItemLinks | FinanceOpenItemAuxiliary[] | - |  |

### FinanceVoucherItemAuxiliary

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| itemId | Int | - |  |
| memberId | Int | - |  |
| sourceRole | String | - |  |
| item | FinanceVoucherItem | @relation(fields: [itemId], references: [id], onDelete: Cascade) |  |
| member | FinanceAuxiliaryMember | @relation(fields: [memberId], references: [id]) |  |

### FinanceAuxiliaryBalance

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| periodId | Int | - |  |
| accountId | Int | - |  |
| companyCode | String | - |  |
| sourceSystem | String | - |  |
| sourceDatabase | String | - |  |
| sourceKey | String | - |  |
| openingDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| openingCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| currentDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| currentCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| closingDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| closingCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |
| members | FinanceAuxiliaryBalanceMember[] | - |  |

### FinanceAuxiliaryBalanceMember

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| balanceId | Int | - |  |
| memberId | Int | - |  |
| sourceRole | String | - |  |
| balance | FinanceAuxiliaryBalance | @relation(fields: [balanceId], references: [id], onDelete: Cascade) |  |
| member | FinanceAuxiliaryMember | @relation(fields: [memberId], references: [id]) |  |

### FinanceOpenItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| companyCode | String | - |  |
| periodId | Int? | - |  |
| accountId | Int? | - |  |
| voucherItemId | Int? | - |  |
| sourceSystem | String | - |  |
| sourceDatabase | String | - |  |
| sourceKey | String | - |  |
| documentNo | String? | - |  |
| documentDate | String? | - |  |
| dueDate | String? | - |  |
| memo | String? | - |  |
| currencyCode | String? | - |  |
| originalDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| originalCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| outstandingDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| outstandingCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| status | String | @default("open") |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |
| period | FinancePeriod? | @relation(fields: [periodId], references: [id]) |  |
| account | FinanceAccount? | @relation(fields: [accountId], references: [id]) |  |
| voucherItem | FinanceVoucherItem? | @relation(fields: [voucherItemId], references: [id]) |  |
| members | FinanceOpenItemAuxiliary[] | - |  |

### FinanceOpenItemAuxiliary

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| openItemId | Int | - |  |
| memberId | Int | - |  |
| sourceRole | String | - |  |
| openItem | FinanceOpenItem | @relation(fields: [openItemId], references: [id], onDelete: Cascade) |  |
| member | FinanceAuxiliaryMember | @relation(fields: [memberId], references: [id]) |  |

### FinanceLedgerImport

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchKey | String? | @unique |  |
| type | String | - |  |
| companyCode | String | - |  |
| year | Int | - |  |
| sourceSystem | String? | - |  |
| sourceLedger | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceFile | String? | - |  |
| sourcePath | String? | - |  |
| snapshotDate | String? | - |  |
| cutoffDate | String? | - |  |
| checksum | String? | - |  |
| controlJson | Json? | - |  |
| status | String | @default("completed") |  |
| rowCount | Int | @default(0) |  |
| createdCount | Int | @default(0) |  |
| updatedCount | Int | @default(0) |  |
| skippedCount | Int | @default(0) |  |
| deletedCount | Int | @default(0) |  |
| conflictCount | Int | @default(0) |  |
| blockedCount | Int | @default(0) |  |
| warnings | String? | - |  |
| importedBy | Int? | - |  |
| importedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| importer | User? | @relation("FinanceLedgerImportImporter", fields: [importedBy], references: [id]) |  |
| vouchers | FinanceVoucher[] | - |  |
| items | FinanceVoucherItem[] | - |  |
| sourceBalances | FinanceSourceAccountBalance[] | - |  |
| auxiliaryMembers | FinanceAuxiliaryMember[] | - |  |
| auxiliaryBalances | FinanceAuxiliaryBalance[] | - |  |
| cashFlowItems | FinanceCashFlowItem[] | - |  |
| cashFlowAllocations | FinanceCashFlowAllocation[] | - |  |
| openItems | FinanceOpenItem[] | - |  |
| currencies | FinanceCurrency[] | - |  |
| bankAccounts | FinanceBankAccount[] | - |  |

### FinanceSourceAccountBalance

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| periodId | Int | - |  |
| accountId | Int | - |  |
| companyCode | String | - |  |
| sourceSystem | String | - |  |
| sourceDatabase | String | - |  |
| sourceKey | String | - |  |
| openingDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| openingCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| currentDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| currentCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| closingDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| closingCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |

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
| sourceSystem | String? | - |  |
| sourceLedger | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceKey | String? | - |  |
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
| sourceBalances | FinanceSourceAccountBalance[] | - |  |
| auxiliaryBalances | FinanceAuxiliaryBalance[] | - |  |
| openItems | FinanceOpenItem[] | - |  |
| bankAccounts | FinanceBankAccount[] | - |  |
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
| sourceSystem | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceKey | String? | - |  |
| sourceClosed | Boolean? | - |  |
| companyCode | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| balances | FinanceAccountBalance[] | - |  |
| vouchers | FinanceVoucher[] | - |  |
| reclassResults | ReclassResult[] | - |  |
| sourceBalances | FinanceSourceAccountBalance[] | - |  |
| auxiliaryBalances | FinanceAuxiliaryBalance[] | - |  |
| cashFlowAllocations | FinanceCashFlowAllocation[] | - |  |
| openItems | FinanceOpenItem[] | - |  |
| assetPeriodEntries | FinanceAssetPeriodEntry[] | - |  |
| assetAdjustments | FinanceAssetAdjustment[] | - |  |

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
| importId | Int? | - |  |
| sourceSystem | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceKey | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("FinanceVoucherEditor", fields: [editedBy], references: [id]) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| import | FinanceLedgerImport? | @relation(fields: [importId], references: [id]) |  |
| items | FinanceVoucherItem[] | - |  |
| cashFlowAllocations | FinanceCashFlowAllocation[] | - |  |
| assetPeriodEntries | FinanceAssetPeriodEntry[] | - |  |
| assetAdjustments | FinanceAssetAdjustment[] | - |  |

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
| sourceSystem | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceKey | String? | - |  |
| currencyCode | String? | - |  |
| exchangeRate | Decimal? | @db.Decimal(20, 8) |  |
| originalDebit | Decimal? | @db.Decimal(20, 2) |  |
| originalCredit | Decimal? | @db.Decimal(20, 2) |  |
| importId | Int? | - |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |
| voucher | FinanceVoucher | @relation(fields: [voucherId], references: [id], onDelete: Cascade) |  |
| reclassResults | ReclassResult[] | - |  |
| import | FinanceLedgerImport? | @relation(fields: [importId], references: [id]) |  |
| auxiliaryLinks | FinanceVoucherItemAuxiliary[] | - |  |
| cashFlowOwnerAllocations | FinanceCashFlowAllocation[] | @relation("FinanceCashFlowOwnerItem") |  |
| cashFlowCounterpartAllocations | FinanceCashFlowAllocation[] | @relation("FinanceCashFlowCounterpartItem") |  |
| openItems | FinanceOpenItem[] | - |  |

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
| sourceAccountCode | String | - |  |
| abnormalSide | String | - | debit | credit | both |
| decision | String | @default("reclassify") | reclassify | no_reclass |
| targetAccountCode | String? | - |  |
| enabled | Boolean | @default(true) |  |
| source | String | @default("manual") | 仅保留 manual；字段用于历史追溯 |
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

### FinanceStatementSourcePackage

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int | - |  |
| companyCode | String | - |  |
| companyName | String | - |  |
| year | Int | - |  |
| month | Int | - |  |
| revision | Int | - |  |
| version | Int | @default(1) |  |
| status | String | @default("draft") | draft | submitted | rejected |
| fileName | String | - |  |
| mimeType | String | - |  |
| fileSize | Int | - |  |
| fileChecksum | String | - |  |
| fileContent | Bytes | - |  |
| parsedCompanyName | String | - |  |
| note | String? | - |  |
| uploadedBy | Int | - |  |
| uploadedAt | DateTime | @default(now()) |  |
| submittedBy | Int? | - |  |
| submittedAt | DateTime? | - |  |
| rejectedBy | Int? | - |  |
| rejectedAt | DateTime? | - |  |
| rejectionReason | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| sheets | FinanceStatementSourceSheet[] | - |  |
| workpapers | FinanceStatementWorkpaper[] | - |  |

### FinanceStatementSourceSheet

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| packageId | Int | - |  |
| reportType | String | - | balanceSheet | incomeStatement | cashFlow |
| previousYear | Int | - |  |
| currentYear | Int | - |  |
| lineCount | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| sourcePackage | FinanceStatementSourcePackage | @relation(fields: [packageId], references: [id], onDelete: Cascade) |  |
| lines | FinanceStatementSourceLine[] | - |  |

### FinanceStatementSourceLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| sheetId | Int | - |  |
| lineCode | String | - |  |
| previousAmount | Decimal | @db.Decimal(20, 2) |  |
| currentAmount | Decimal | @db.Decimal(20, 2) |  |
| sourceLabel | String | - |  |
| sortOrder | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| sheet | FinanceStatementSourceSheet | @relation(fields: [sheetId], references: [id], onDelete: Cascade) |  |

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
| sourcePackageId | Int? | - |  |
| sourcePackageRevision | Int? | - |  |
| sourceChecksum | String? | - |  |
| updatedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("WorkpaperEditor", fields: [updatedBy], references: [id]) |  |
| sourcePackage | FinanceStatementSourcePackage? | @relation(fields: [sourcePackageId], references: [id], onDelete: SetNull) |  |
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

### FinanceStatementExchangeRate

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| baseCurrency | String | - |  |
| quoteCurrency | String | - |  |
| rateKind | String | - | closing | historicalInvestment | average |
| rateDate | String | - | YYYY-MM-DD |
| rate | Decimal | @db.Decimal(20, 8) | 人民币/100外币 |
| sourceName | String | @default("中国银行外汇牌价") |  |
| sourceField | String | @default("中行折算价") |  |
| sourceUrl | String | - |  |
| publishedAt | DateTime? | - |  |
| capturedAt | DateTime | @default(now()) |  |
| status | String | @default("draft") | draft | verified |
| note | String? | - |  |
| version | Int | @default(1) |  |
| updatedBy | Int? | - |  |
| verifiedBy | Int? | - |  |
| verifiedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### FinanceCurrency

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| sourceSystem | String | - |  |
| sourceLedger | String | - |  |
| sourceCode | String | - |  |
| sourceName | String | - |  |
| symbol | String? | - |  |
| decimalDigits | Int? | - |  |
| isBase | Boolean | @default(false) |  |
| latestImportId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| latestImport | FinanceLedgerImport? | @relation(fields: [latestImportId], references: [id]) |  |

### FinanceBankAccount

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| accountId | Int? | - |  |
| sourceSystem | String | - |  |
| sourceLedger | String | - |  |
| sourceKey | String | - |  |
| sourceCode | String? | - |  |
| sourceName | String | - |  |
| accountNo | String? | - |  |
| bankName | String? | - |  |
| currencyCode | String? | - |  |
| isActive | Boolean | @default(true) |  |
| latestImportId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| account | FinanceAccount? | @relation(fields: [accountId], references: [id]) |  |
| latestImport | FinanceLedgerImport? | @relation(fields: [latestImportId], references: [id]) |  |

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
| workEvidenceSnapshotJson | String | @default("{ |  |

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
| ownedKpiAssignments | WorkKpiAssignment[] | - |  |

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
| effectiveFrom | DateTime? | - |  |
| effectiveTo | DateTime? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
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
| enabledProjects | ProjectEnablingDepartment[] | @relation("ProjectEnablingDepartmentDepartment") |  |
| edps | EDP[] | - |  |
| positions | Position[] | - |  |
| positionReportOverrides | PositionReportOverride[] | - |  |
| ownedKpiDefinitions | WorkKpiDefinition[] | - |  |

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

### InventoryItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| code | String | - |  |
| name | String | - |  |
| itemType | String | @default("finished_goods") |  |
| specification | String? | - |  |
| baseUnit | String | - |  |
| status | String | @default("active") |  |
| note | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceKey | String? | - |  |
| editedBy | Int? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| conversions | InventoryUnitConversion[] | - |  |
| batches | InventoryBatch[] | - |  |
| documentLines | InventoryDocumentLine[] | - |  |
| ledgerEntries | InventoryLedgerEntry[] | - |  |
| stocktakeLines | InventoryStocktakeLine[] | - |  |

### InventoryUnitConversion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| itemId | Int | - |  |
| unit | String | - |  |
| factor | Decimal | @db.Decimal(20, 6) |  |
| createdAt | DateTime | @default(now()) |  |
| item | InventoryItem | @relation(fields: [itemId], references: [id], onDelete: Cascade) |  |

### InventoryWarehouse

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| code | String | - |  |
| name | String | - |  |
| status | String | @default("active") |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| batches | InventoryBatch[] | - |  |
| documentLines | InventoryDocumentLine[] | - |  |
| ledgerEntries | InventoryLedgerEntry[] | - |  |
| stocktakes | InventoryStocktake[] | - |  |
| stocktakeLines | InventoryStocktakeLine[] | - |  |

### InventoryBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| itemId | Int | - |  |
| warehouseId | Int | - |  |
| batchNo | String | - |  |
| productionDate | String? | - |  |
| expiryDate | String? | - |  |
| status | String | @default("normal") |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| item | InventoryItem | @relation(fields: [itemId], references: [id], onDelete: Cascade) |  |
| warehouse | InventoryWarehouse | @relation(fields: [warehouseId], references: [id], onDelete: Restrict) |  |
| documentLines | InventoryDocumentLine[] | - |  |
| ledgerEntries | InventoryLedgerEntry[] | - |  |
| stocktakeLines | InventoryStocktakeLine[] | - |  |

### InventoryDocument

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| documentNo | String | - |  |
| documentType | String | - |  |
| documentDate | String | - |  |
| status | String | @default("draft") |  |
| counterparty | String? | - |  |
| referenceNo | String? | - |  |
| note | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceKey | String? | - |  |
| createdBy | Int? | - |  |
| postedBy | Int? | - |  |
| postedAt | DateTime? | - |  |
| reversedById | Int? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| lines | InventoryDocumentLine[] | - |  |

### InventoryDocumentLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| documentId | Int | - |  |
| itemId | Int | - |  |
| warehouseId | Int | - |  |
| batchId | Int? | - |  |
| quantity | Decimal | @db.Decimal(20, 6) |  |
| unit | String | - |  |
| unitFactor | Decimal | @default(1) @db.Decimal(20, 6) |  |
| unitPrice | Decimal? | @db.Decimal(20, 6) |  |
| paymentStatus | String? | - |  |
| invoiceStatus | String? | - |  |
| sourceRow | Int? | - |  |
| sourceKey | String? | - |  |
| document | InventoryDocument | @relation(fields: [documentId], references: [id], onDelete: Cascade) |  |
| item | InventoryItem | @relation(fields: [itemId], references: [id], onDelete: Restrict) |  |
| warehouse | InventoryWarehouse | @relation(fields: [warehouseId], references: [id], onDelete: Restrict) |  |
| batch | InventoryBatch? | @relation(fields: [batchId], references: [id], onDelete: SetNull) |  |
| ledgerEntry | InventoryLedgerEntry? | - |  |

### InventoryLedgerEntry

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| documentLineId | Int | @unique |  |
| companyCode | String | - |  |
| itemId | Int | - |  |
| warehouseId | Int | - |  |
| batchId | Int? | - |  |
| movementDate | String | - |  |
| signedQuantity | Decimal | @db.Decimal(20, 6) |  |
| unitCost | Decimal? | @db.Decimal(20, 6) |  |
| createdAt | DateTime | @default(now()) |  |
| documentLine | InventoryDocumentLine | @relation(fields: [documentLineId], references: [id], onDelete: Restrict) |  |
| item | InventoryItem | @relation(fields: [itemId], references: [id], onDelete: Restrict) |  |
| warehouse | InventoryWarehouse | @relation(fields: [warehouseId], references: [id], onDelete: Restrict) |  |
| batch | InventoryBatch? | @relation(fields: [batchId], references: [id], onDelete: SetNull) |  |

### InventoryStocktake

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| stocktakeNo | String | - |  |
| warehouseId | Int | - |  |
| stocktakeDate | String | - |  |
| status | String | @default("draft") |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceKey | String? | - |  |
| createdBy | Int? | - |  |
| approvedBy | Int? | - |  |
| approvedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| warehouse | InventoryWarehouse | @relation(fields: [warehouseId], references: [id], onDelete: Restrict) |  |
| lines | InventoryStocktakeLine[] | - |  |

### InventoryStocktakeLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| stocktakeId | Int | - |  |
| itemId | Int | - |  |
| warehouseId | Int | - |  |
| batchId | Int? | - |  |
| bookQuantity | Decimal | @db.Decimal(20, 6) |  |
| actualQuantity | Decimal | @db.Decimal(20, 6) |  |
| note | String? | - |  |
| sourceRow | Int? | - |  |
| stocktake | InventoryStocktake | @relation(fields: [stocktakeId], references: [id], onDelete: Cascade) |  |
| item | InventoryItem | @relation(fields: [itemId], references: [id], onDelete: Restrict) |  |
| warehouse | InventoryWarehouse | @relation(fields: [warehouseId], references: [id], onDelete: Restrict) |  |
| batch | InventoryBatch? | @relation(fields: [batchId], references: [id], onDelete: SetNull) |  |

### InventoryPeriodClose

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| year | Int | - |  |
| month | Int | - |  |
| status | String | @default("open") |  |
| voucherId | Int? | - |  |
| lockedBy | Int? | - |  |
| lockedAt | DateTime? | - |  |
| unlockedBy | Int? | - |  |
| unlockedAt | DateTime? | - |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### InventoryImportBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| checksum | String | - |  |
| status | String | @default("confirmed") |  |
| itemCount | Int | @default(0) |  |
| documentCount | Int | @default(0) |  |
| rowCount | Int | @default(0) |  |
| warningCount | Int | @default(0) |  |
| importedBy | Int? | - |  |
| importedAt | DateTime | @default(now()) |  |
| note | String? | - |  |

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

### MutationImpactBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | String | @id @default(uuid()) |  |
| actorUserId | Int? | - |  |
| actorLabel | String? | - |  |
| scopeType | String? | - |  |
| scopeId | String? | - |  |
| requestId | String? | - |  |
| rootEntityType | String | - |  |
| rootEntityId | String | - |  |
| intent | String | - |  |
| policyRevision | String | - |  |
| impactFingerprint | String | - |  |
| resolutionsJson | String | @default("[]") | 仅保存 relationKey + resolution 的允许列表 |
| status | String | @default("pending") | pending, succeeded, failed, stale_confirmation |
| resultCode | String? | - |  |
| resultMessage | String? | - |  |
| sourceBatchId | String? | - | restore 批次指向其使用的 archive provenance 批次 |
| startedAt | DateTime | @default(now()) |  |
| finishedAt | DateTime? | - |  |
| actor | User? | @relation("MutationImpactBatchActor", fields: [actorUserId], references: [id], onDelete: SetNull) |  |
| sourceBatch | MutationImpactBatch? | @relation("MutationImpactBatchProvenance", fields: [sourceBatchId], references: [id], onDelete: Restrict) |  |
| derivedBatches | MutationImpactBatch[] | @relation("MutationImpactBatchProvenance") |  |
| effects | MutationImpactEffect[] | - |  |

### MutationImpactEffect

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | String | - |  |
| sequence | Int | - |  |
| relationKey | String | - |  |
| relationPathJson | String | @default("[]") | 从 root 到 effect 的 relationKey 有序列表 |
| policyKey | String | - |  |
| entityType | String | - |  |
| entityId | String | - |  |
| operation | String | - |  |
| beforeRevision | String? | - | adapter 提供的版本、updatedAt 或稳定状态指纹 |
| afterRevision | String? | - | restore 前必须与当前 revision 重新比较 |
| beforeSummaryJson | String? | - | 仅允许模块声明的非敏感摘要字段 |
| afterSummaryJson | String? | - | 仅允许模块声明的非敏感摘要字段 |
| changedInBatch | Boolean | @default(false) | false 表示已处于目标状态，本批次未改写 |
| createdAt | DateTime | @default(now()) |  |
| batch | MutationImpactBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |

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

### WorkKpiDefinition

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | - |  |
| version | Int | @default(1) |  |
| status | String | @default("draft") |  |
| name | String | - |  |
| description | String | @default("") |  |
| valueType | String | @default("number") |  |
| displayType | String | @default("number") |  |
| unit | String | @default("") |  |
| direction | String | @default("higher_is_better") |  |
| defaultScoringRuleJson | String | @default("{ |  |

### WorkKpiAssignment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workPlanId | Int | - |  |
| definitionId | Int | - |  |
| workItemId | Int | @unique |  |
| ownerEmployeeId | Int | - |  |
| sourceAssignmentId | Int? | - |  |
| relationKind | String | @default("direct") |  |
| weight | Decimal | @db.Decimal(20, 6) |  |
| baselineValue | Decimal? | @db.Decimal(20, 6) |  |
| targetValue | Decimal? | @db.Decimal(20, 6) |  |
| targetLowerBound | Decimal? | @db.Decimal(20, 6) |  |
| targetUpperBound | Decimal? | @db.Decimal(20, 6) |  |
| currentValue | Decimal? | @db.Decimal(20, 6) |  |
| definitionSnapshotJson | String | @default("{ |  |

### WorkKpiResultSnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| assignmentId | Int | - |  |
| workReportId | Int | - |  |
| version | Int | @default(1) |  |
| previousSnapshotId | Int? | - |  |
| actualValue | Decimal | @db.Decimal(20, 6) |  |
| scoreBeforeAdjustment | Decimal | @db.Decimal(20, 6) |  |
| confirmedScore | Decimal | @db.Decimal(20, 6) |  |
| adjustmentReason | String | @default("") |  |
| definitionSnapshotJson | String | @default("{ |  |

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
| version | Int | @default(1) |  |
| createdByUserId | Int? | - |  |
| updatedByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| cycle | WorkOkrCycle | @relation(fields: [cycleId], references: [id], onDelete: Cascade) |  |

### WorkOkrControlRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| version | Int | @unique |  |
| settingsJson | String | - |  |
| actorUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |

### WorkOkrControlPolicyRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| policyId | Int? | - |  |
| cycleId | Int | - |  |
| scopeType | String | - |  |
| scopeId | String | @default("") |  |
| version | Int | - |  |
| changeKind | String | @default("upsert") |  |
| snapshotJson | String | - |  |
| actorUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |

### WorkPlanGovernanceEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workPlanId | Int | - |  |
| fromMode | String | - |  |
| toMode | String | - |  |
| fromSnapshotJson | String | @default("{ |  |

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
| kpiResultSnapshots | WorkKpiResultSnapshot[] | - |  |

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
| governanceMode | String | @default("legacy_inferred") |  |
| governanceRevision | Int | @default(1) |  |
| governanceActionKey | String? | - |  |
| governanceWorkflowPolicyId | Int? | - |  |
| governanceWorkflowVersion | Int? | - |  |
| governanceActionContractVersion | Int? | - |  |
| governanceOkrControlVersion | Int? | - |  |
| governanceSnapshotJson | String | @default("{ |  |

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
| updatedAt | DateTime | @default(now()) @updatedAt |  |
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
| kpiAssignment | WorkKpiAssignment? | - |  |

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
