# HR Database Schema (149 tables)

## 

### 1-1 AgentSession

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | String | * | PK |  |
| `userId` | Int | * |  |  |
| `status` | String | * |  | active | deleted |
| `pagePath` | String |  |  |  |
| `contextLabel` | String |  |  |  |
| `title` | String |  |  |  |
| `storageKey` | String | * |  |  |
| `summaryShort` | String |  |  |  |
| `summaryLongStorageKey` | String |  |  |  |
| `messageCount` | Int | * |  |  |
| `compactedMessageCount` | Int | * |  |  |
| `byteSize` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `expiresAt` | DateTime |  |  |  |
| `deletedAt` | DateTime |  |  |  |

### 1-2 AgentProposal

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `userId` | Int | * |  |  |
| `sessionId` | String |  |  |  |
| `status` | String | * |  | pending | confirmed | cancelled | failed |
| `actionKey` | String | * |  | 工具 key，如 hr.updateEmployee |
| `targetType` | String | * |  | 目标实体，如 Employee |
| `targetId` | String |  |  | 目标记录标识 |
| `payloadJson` | String | * |  | 变更内容 JSON |
| `diffJson` | String |  |  | 变更前后对比 JSON |
| `resultJson` | String |  |  | 执行结果 JSON |
| `createdAt` | DateTime | * |  |  |
| `confirmedAt` | DateTime |  |  |  |

### 1-3 ApprovalRequest

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `resourceKey` | String | * |  |  |
| `scopeId` | String |  |  |  |
| `businessActionKey` | String | * |  |  |
| `flowType` | String | * |  |  |
| `separationPolicy` | String | * |  |  |
| `handlerSource` | String | * |  |  |
| `workflowNodesJson` | String | * |  |  |
| `activeWorkflowNodeKey` | String |  |  |  |
| `activeWorkflowNodeKeysJson` | String | * |  |  |
| `workflowJoinStateJson` | String | * |  |  |
| `handlerCanRevise` | Boolean | * |  |  |
| `requestCanWithdraw` | Boolean | * |  |  |
| `requestCanResubmit` | Boolean | * |  |  |
| `requestCanCancel` | Boolean | * |  |  |
| `requestCanRevise` | Boolean | * |  |  |
| `subjectType` | String | * |  |  |
| `subjectId` | String |  |  |  |
| `operation` | String | * |  |  |
| `status` | String | * |  |  |
| `latestPayloadJson` | String | * |  |  |
| `submitterUserId` | Int | * | FK | → User.id |
| `submittedAt` | DateTime |  |  |  |
| `resolvedByUserId` | Int |  | FK | → User.id |
| `resolvedAt` | DateTime |  |  |  |
| `committedEntityType` | String |  |  |  |
| `committedEntityId` | String |  |  |  |
| `committedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-6 User](#user)

← Referenced by: [1-4 ApprovalEvent](#approvalevent)

### 1-4 ApprovalEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `requestId` | Int | * | cUK+FK | → ApprovalRequest.id |
| `sequence` | Int | * | cUK |  |
| `eventType` | String | * |  |  |
| `actorUserId` | Int | * | FK | → User.id |
| `workflowNodeKey` | String |  |  |  |
| `fromStatus` | String |  |  |  |
| `toStatus` | String |  |  |  |
| `comment` | String |  |  |  |
| `payloadJson` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-3 ApprovalRequest](#approvalrequest), [1-6 User](#user)

### 1-5 WorkflowPolicy

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `businessActionKey` | String | * | cUK |  |
| `scopeType` | String | * | cUK |  |
| `scopeId` | String | * | cUK |  |
| `mode` | String | * |  |  |
| `flowType` | String | * |  |  |
| `separationPolicy` | String | * |  |  |
| `handlerSource` | String | * |  |  |
| `workflowNodesJson` | String | * |  |  |
| `handlerCanRevise` | Boolean | * |  |  |
| `requestCanWithdraw` | Boolean | * |  |  |
| `requestCanResubmit` | Boolean | * |  |  |
| `requestCanCancel` | Boolean | * |  |  |
| `requestCanRevise` | Boolean | * |  |  |
| `version` | Int | * |  |  |
| `createdByUserId` | Int |  |  |  |
| `updatedByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-6 User

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `wxUserId` | String |  | UK |  |
| `username` | String | * | UK |  |
| `password` | String |  |  |  |
| `avatar` | String |  |  |  |
| `alias` | String |  |  |  |
| `phone` | String |  |  |  |
| `routineItems` | String |  |  |  |
| `preferredDepartmentIds` | String |  |  |  |
| `preferredProjectIds` | String |  |  |  |
| `portalSlots` | String |  |  |  |
| `canLogin` | Boolean | * |  |  |
| `apiKeyHash` | String |  | UK |  |
| `employeeId` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `sessionVersion` | Int | * |  |  |

← Referenced by: [1-3 ApprovalRequest](#approvalrequest), [1-3 ApprovalRequest](#approvalrequest), [1-4 ApprovalEvent](#approvalevent), [1-9 UserResourceActionGrant](#userresourceactiongrant), [1-12 PermissionGrantLedgerEvent](#permissiongrantledgerevent), [1-13 Notification](#notification), [1-13 Notification](#notification), [1-14 Contract](#contract), [1-42 FinanceLedgerImport](#financeledgerimport), [1-44 FinanceAccount](#financeaccount), [1-46 FinanceVoucher](#financevoucher), [1-49 FinanceBalanceSnapshot](#financebalancesnapshot), [1-49 FinanceBalanceSnapshot](#financebalancesnapshot), [1-51 FinanceReclassRule](#financereclassrule), [1-54 ReclassResult](#reclassresult), [1-55 FinanceStatementWorkpaper](#financestatementworkpaper), [1-62 Employee](#employee), [1-71 EditHistory](#edithistory), [1-83 StockRawMaterial](#stockrawmaterial), [1-84 StockPackaging](#stockpackaging), [1-85 StockFinishedGoods](#stockfinishedgoods), [1-87 StockOperation](#stockoperation), [1-89 LibraryTagCandidate](#librarytagcandidate), [1-91 LibraryMetadataCandidate](#librarymetadatacandidate), [1-92 LibraryEvaluationCase](#libraryevaluationcase), [1-92 LibraryEvaluationCase](#libraryevaluationcase), [1-98 LibraryExportJob](#libraryexportjob), [1-99 LibraryDocument](#librarydocument), [1-99 LibraryDocument](#librarydocument), [1-99 LibraryDocument](#librarydocument), [1-100 LibraryDocumentVersion](#librarydocumentversion), [1-109 LibraryDocumentTag](#librarydocumenttag), [1-117 DepartmentCollaboration](#departmentcollaboration), [1-118 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-122 Meeting](#meeting), [1-122 Meeting](#meeting), [1-123 MeetingParticipant](#meetingparticipant), [1-127 MeetingVote](#meetingvote), [1-140 WorkReport](#workreport), [1-148 DepartmentWorkAssignee](#departmentworkassignee), [1-149 ProjectWorkAssignee](#projectworkassignee)

### 1-7 Resource

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `key` | String | * | UK |  |
| `name` | String | * |  |  |
| `description` | String |  |  |  |
| `level` | Int | * |  |  |
| `sortOrder` | Int | * |  |  |
| `parentId` | Int |  | FK | → Resource.id |
| `scopeTypes` | String |  |  |  |
| `scopeInheritanceMode` | String | * |  |  |

→ Depends on: [1-7 Resource](#resource)

← Referenced by: [1-9 UserResourceActionGrant](#userresourceactiongrant), [1-10 PositionResourceActionGrant](#positionresourceactiongrant), [1-11 DepartmentResourceActionGrant](#departmentresourceactiongrant), [1-12 PermissionGrantLedgerEvent](#permissiongrantledgerevent)

### 1-8 PermissionActionNormalization

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `key` | String | * |  |  |
| `appliedAt` | DateTime | * |  |  |

### 1-9 UserResourceActionGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `userId` | Int | * | cUK+FK | → User.id |
| `resourceId` | Int | * | cUK+FK | → Resource.id |
| `actionKey` | String | * | cUK |  |
| `scopeId` | String |  | cUK |  |

→ Depends on: [1-7 Resource](#resource), [1-6 User](#user)

### 1-10 PositionResourceActionGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `positionId` | Int | * | cUK+FK | → Position.id |
| `resourceId` | Int | * | cUK+FK | → Resource.id |
| `actionKey` | String | * | cUK |  |
| `scopeId` | String |  | cUK |  |

→ Depends on: [1-7 Resource](#resource), [1-68 Position](#position)

### 1-11 DepartmentResourceActionGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `resourceId` | Int | * | cUK+FK | → Resource.id |
| `actionKey` | String | * | cUK |  |
| `scopeId` | String |  | cUK |  |

→ Depends on: [1-7 Resource](#resource), [1-66 Department](#department)

### 1-12 PermissionGrantLedgerEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `eventType` | String | * |  |  |
| `actorUserId` | Int |  | FK | → User.id |
| `actorLabel` | String |  |  |  |
| `actorSnapshotJson` | String |  |  |  |
| `subjectType` | String | * |  |  |
| `subjectId` | Int | * |  |  |
| `subjectLabel` | String |  |  |  |
| `subjectSnapshotJson` | String |  |  |  |
| `resourceId` | Int |  | FK | → Resource.id |
| `resourceKey` | String | * |  |  |
| `resourceName` | String |  |  |  |
| `actionKey` | String | * |  |  |
| `scopeId` | String |  |  |  |
| `beforeValue` | Boolean | * |  |  |
| `afterValue` | Boolean | * |  |  |
| `source` | String | * |  |  |
| `reason` | String |  |  |  |
| `batchId` | String |  |  |  |
| `metadataJson` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-7 Resource](#resource)

### 1-13 Notification

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `recipientUserId` | Int | * | FK | → User.id |
| `actorUserId` | Int |  | FK | → User.id |
| `type` | String | * |  |  |
| `title` | String | * |  |  |
| `body` | String | * |  |  |
| `href` | String |  |  |  |
| `payloadJson` | String |  |  |  |
| `isImportant` | Boolean | * |  |  |
| `isStrongReminder` | Boolean | * |  |  |
| `requiresAcknowledgement` | Boolean | * |  |  |
| `readAt` | DateTime |  |  |  |
| `acknowledgedAt` | DateTime |  |  |  |
| `rejectedAt` | DateTime |  |  |  |
| `clearedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-6 User](#user)

### 1-14 Contract

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `contractNo` | String |  |  |  |
| `name` | String | * |  |  |
| `partyA` | String |  |  |  |
| `partyB` | String |  |  |  |
| `shareholder` | String |  |  |  |
| `category` | String |  |  |  |
| `content` | String |  |  |  |
| `handler` | String |  |  |  |
| `signDate` | String |  |  |  |
| `endDate` | String |  |  |  |
| `status` | String |  |  |  |
| `amount` | Float |  |  |  |
| `executedAmount` | Float |  |  |  |
| `location` | String |  |  |  |
| `remark` | String |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

### 1-15 DocumentTemplateSpace

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `targetType` | String | * | cUK |  |
| `targetId` | Int | * | cUK |  |
| `title` | String | * |  |  |
| `description` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `deletedAt` | DateTime |  |  |  |

← Referenced by: [1-16 DocumentTemplate](#documenttemplate)

### 1-16 DocumentTemplate

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `title` | String | * |  |  |
| `type` | String | * |  |  |
| `status` | String | * |  |  |
| `ownerUserId` | Int |  |  |  |
| `spaceId` | Int | * | FK | → DocumentTemplateSpace.id |
| `documentContentRef` | String |  |  |  |
| `fieldModelContentRef` | String |  |  |  |
| `sourceKind` | String |  |  |  |
| `sourceProductKey` | String |  |  |  |
| `sourceStageKeys` | String |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `deletedAt` | DateTime |  |  |  |
| `publishedAt` | DateTime |  |  |  |
| `publishedByUserId` | Int |  |  |  |

→ Depends on: [1-15 DocumentTemplateSpace](#documenttemplatespace)

### 1-17 ExternalParty

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `subjectType` | String | * | cUK |  |
| `relatedPartyType` | String | * |  |  |
| `name` | String | * |  |  |
| `fullName` | String |  |  |  |
| `identityNumber` | String | * | cUK |  |
| `legalRepresentative` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-18 ExternalPartyRole](#externalpartyrole)

### 1-18 ExternalPartyRole

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `partyId` | Int | * | cUK+FK | → ExternalParty.id |
| `category` | String | * | cUK |  |
| `code` | String | * | cUK |  |
| `classification` | String |  |  |  |
| `contactPerson` | String |  |  |  |
| `phone` | String |  |  |  |
| `email` | String |  |  |  |
| `bankName` | String |  |  |  |
| `bankAccount` | String |  |  |  |
| `address` | String |  |  |  |
| `invoiceTitle` | String |  |  |  |
| `invoiceAddressPhone` | String |  |  |  |
| `settlementTerms` | String |  |  |  |
| `creditLimit` | Float |  |  |  |
| `creditDays` | Int |  |  |  |
| `taxRate` | Float |  |  |  |
| `remark` | String |  |  |  |
| `isActive` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-17 ExternalParty](#externalparty)

### 1-19 FinanceAssetCard

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `assetCode` | String | * | cUK |  |
| `name` | String | * |  |  |
| `assetKind` | String | * |  |  |
| `category` | String |  |  |  |
| `assetAccountCode` | String | * |  |  |
| `accumulatedAccountCode` | String |  |  |  |
| `acquisitionDate` | String |  |  |  |
| `depreciationStartDate` | String |  |  |  |
| `originalCost` | Decimal | * |  |  |
| `residualRate` | Decimal | * |  |  |
| `usefulLifeMonths` | Int |  |  |  |
| `method` | String | * |  |  |
| `openingAccumulatedAmount` | Decimal | * |  |  |
| `openingAsOfDate` | String |  |  |  |
| `status` | String | * |  |  |
| `nonAmortizationReason` | String |  |  |  |
| `note` | String |  |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `sourceKey` | String |  | cUK |  |
| `editedBy` | Int |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-20 FinanceAssetCostLine](#financeassetcostline), [1-21 FinanceAssetExpenseAllocation](#financeassetexpenseallocation), [1-23 FinanceAssetPeriodEntry](#financeassetperiodentry), [1-24 FinanceAssetAdjustment](#financeassetadjustment)

### 1-20 FinanceAssetCostLine

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `assetId` | Int | * | cUK+FK | → FinanceAssetCard.id |
| `lineType` | String | * |  |  |
| `treatment` | String | * |  |  |
| `referenceNo` | String |  |  |  |
| `referenceDate` | String |  |  |  |
| `amount` | Decimal | * |  |  |
| `reason` | String |  |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `sourceKey` | String |  | cUK |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-19 FinanceAssetCard](#financeassetcard)

### 1-21 FinanceAssetExpenseAllocation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `assetId` | Int | * | cUK+FK | → FinanceAssetCard.id |
| `expenseAccountCode` | String | * | cUK |  |
| `allocationRate` | Decimal | * |  |  |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-19 FinanceAssetCard](#financeassetcard)

### 1-22 FinanceAssetImportBatch

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `sourceFile` | String | * |  |  |
| `checksum` | String | * | cUK |  |
| `status` | String | * |  |  |
| `cardCount` | Int | * |  |  |
| `costLineCount` | Int | * |  |  |
| `warningCount` | Int | * |  |  |
| `importedBy` | Int |  |  |  |
| `importedAt` | DateTime | * |  |  |
| `note` | String |  |  |  |

### 1-23 FinanceAssetPeriodEntry

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `assetId` | Int | * | cUK+FK | → FinanceAssetCard.id |
| `periodId` | Int | * | cUK+FK | → FinancePeriod.id |
| `normalAmount` | Decimal | * |  |  |
| `status` | String | * |  |  |
| `calculationVersion` | String | * |  |  |
| `voucherId` | Int |  | FK | → FinanceVoucher.id |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-19 FinanceAssetCard](#financeassetcard), [1-45 FinancePeriod](#financeperiod), [1-46 FinanceVoucher](#financevoucher)

### 1-24 FinanceAssetAdjustment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `periodId` | Int | * | FK | → FinancePeriod.id |
| `assetId` | Int |  | FK | → FinanceAssetCard.id |
| `accountCode` | String | * |  |  |
| `amount` | Decimal | * |  |  |
| `reason` | String | * |  |  |
| `status` | String | * |  |  |
| `reversedById` | Int |  |  |  |
| `voucherId` | Int |  | FK | → FinanceVoucher.id |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `sourceKey` | String |  | cUK |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-19 FinanceAssetCard](#financeassetcard), [1-45 FinancePeriod](#financeperiod), [1-46 FinanceVoucher](#financevoucher)

### 1-25 FinanceBudgetVersion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `year` | Int | * |  |  |
| `companyCode` | String |  |  |  |
| `name` | String | * |  | / 版本名称，如 "2026年初预算"、"2026年调整V1" |
| `status` | String | * |  | / draft | active | archived |
| `type` | String | * |  | / dept | rd | all，表示本版本包含的预算类型 |
| `sourceFile` | String |  |  |  |
| `createdBy` | Int |  |  | / userId |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-26 FinanceBudgetDept](#financebudgetdept), [1-27 FinanceBudgetRd](#financebudgetrd)

### 1-26 FinanceBudgetDept

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `versionId` | Int | * | cUK+FK | → FinanceBudgetVersion.id |
| `year` | Int | * |  |  |
| `companyCode` | String |  |  |  |
| `dept` | String | * | cUK |  |
| `accountName` | String | * | cUK |  |
| `expenseType` | String | * |  |  |
| `accountId` | Int |  | FK | → FinanceAccount.id |
| `total` | Float | * |  |  |
| `month1` | Float | * |  |  |
| `month2` | Float | * |  |  |
| `month3` | Float | * |  |  |
| `month4` | Float | * |  |  |
| `month5` | Float | * |  |  |
| `month6` | Float | * |  |  |
| `month7` | Float | * |  |  |
| `month8` | Float | * |  |  |
| `month9` | Float | * |  |  |
| `month10` | Float | * |  |  |
| `month11` | Float | * |  |  |
| `month12` | Float | * |  |  |
| `sourceFile` | String |  |  |  |
| `importedAt` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-25 FinanceBudgetVersion](#financebudgetversion), [1-44 FinanceAccount](#financeaccount)

### 1-27 FinanceBudgetRd

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `versionId` | Int | * | cUK+FK | → FinanceBudgetVersion.id |
| `year` | Int | * |  |  |
| `companyCode` | String |  |  |  |
| `project` | String | * | cUK |  |
| `category` | String | * | cUK |  |
| `accountId` | Int |  | FK | → FinanceAccount.id |
| `total` | Float | * |  |  |
| `month1` | Float | * |  |  |
| `month2` | Float | * |  |  |
| `month3` | Float | * |  |  |
| `month4` | Float | * |  |  |
| `month5` | Float | * |  |  |
| `month6` | Float | * |  |  |
| `month7` | Float | * |  |  |
| `month8` | Float | * |  |  |
| `month9` | Float | * |  |  |
| `month10` | Float | * |  |  |
| `month11` | Float | * |  |  |
| `month12` | Float | * |  |  |
| `sourceFile` | String |  |  |  |
| `importedAt` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-25 FinanceBudgetVersion](#financebudgetversion), [1-44 FinanceAccount](#financeaccount)

### 1-28 FinanceCashFlowItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `sourceSystem` | String | * | cUK |  |
| `sourceLedger` | String | * | cUK |  |
| `sourceCode` | String | * | cUK |  |
| `sourceName` | String | * |  |  |
| `parentId` | Int |  | FK | → FinanceCashFlowItem.id |
| `direction` | String |  |  |  |
| `firstYear` | Int |  |  |  |
| `lastYear` | Int |  |  |  |
| `latestImportId` | Int |  | FK | → FinanceLedgerImport.id |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 FinanceLedgerImport](#financeledgerimport), [1-28 FinanceCashFlowItem](#financecashflowitem)

← Referenced by: [1-29 FinanceCashFlowAllocation](#financecashflowallocation)

### 1-29 FinanceCashFlowAllocation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceLedgerImport.id |
| `companyCode` | String | * |  |  |
| `periodId` | Int | * | FK | → FinancePeriod.id |
| `voucherId` | Int | * | FK | → FinanceVoucher.id |
| `cashFlowItemId` | Int | * | FK | → FinanceCashFlowItem.id |
| `ownerVoucherItemId` | Int |  | FK | → FinanceVoucherItem.id |
| `counterpartItemId` | Int |  | FK | → FinanceVoucherItem.id |
| `sourceSystem` | String | * | cUK |  |
| `sourceDatabase` | String | * | cUK |  |
| `sourceKey` | String | * | cUK |  |
| `direction` | String | * |  |  |
| `amount` | Decimal | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 FinanceLedgerImport](#financeledgerimport), [1-45 FinancePeriod](#financeperiod), [1-46 FinanceVoucher](#financevoucher), [1-28 FinanceCashFlowItem](#financecashflowitem), [1-47 FinanceVoucherItem](#financevoucheritem), [1-47 FinanceVoucherItem](#financevoucheritem)

### 1-30 FinanceDataImport

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `profile` | String | * |  |  |
| `year` | Int |  |  |  |
| `sourceFile` | String | * |  |  |
| `sourcePath` | String |  |  |  |
| `normalizedJsonPath` | String |  |  |  |
| `checksum` | String |  |  |  |
| `status` | String | * |  |  |
| `recordCount` | Int | * |  |  |
| `warningCount` | Int | * |  |  |
| `errorCount` | Int | * |  |  |
| `importedBy` | String |  |  |  |
| `importedAt` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-31 FinanceShipment](#financeshipment), [1-32 FinanceSalesSalary](#financesalessalary), [1-33 FinanceCostStructureRow](#financecoststructurerow), [1-34 FinanceCostAnalysisRow](#financecostanalysisrow), [1-35 FinanceWorkshopReport](#financeworkshopreport)

### 1-31 FinanceShipment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceDataImport.id |
| `year` | Int | * |  |  |
| `month` | Int |  |  |  |
| `date` | String |  |  |  |
| `customerName` | String |  |  |  |
| `productName` | String |  |  |  |
| `spec` | String |  |  |  |
| `batchNo` | String |  |  |  |
| `quantity` | Float |  |  |  |
| `unitPrice` | Float |  |  |  |
| `amount` | Float |  |  |  |
| `receivedAmount` | Float |  |  |  |
| `employeeId` | Int |  | FK | → Employee.id |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-62 Employee](#employee), [1-30 FinanceDataImport](#financedataimport)

### 1-32 FinanceSalesSalary

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceDataImport.id |
| `year` | Int | * |  |  |
| `month` | Int |  |  |  |
| `baseSalary` | Float |  |  |  |
| `bonus` | Float |  |  |  |
| `deduction` | Float |  |  |  |
| `actualSalary` | Float |  |  |  |
| `employeeId` | Int |  | FK | → Employee.id |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-62 Employee](#employee), [1-30 FinanceDataImport](#financedataimport)

### 1-33 FinanceCostStructureRow

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceDataImport.id |
| `year` | Int | * |  |  |
| `month` | Int |  |  |  |
| `productName` | String |  |  |  |
| `category` | String |  |  |  |
| `itemName` | String |  |  |  |
| `amount` | Float |  |  |  |
| `quantity` | Float |  |  |  |
| `unit` | String |  |  |  |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-30 FinanceDataImport](#financedataimport)

### 1-34 FinanceCostAnalysisRow

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceDataImport.id |
| `year` | Int | * |  |  |
| `month` | Int |  |  |  |
| `tableName` | String |  |  |  |
| `rowLabel` | String |  |  |  |
| `metricKey` | String |  |  |  |
| `metricName` | String |  |  |  |
| `value` | Float |  |  |  |
| `textValue` | String |  |  |  |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-30 FinanceDataImport](#financedataimport)

### 1-35 FinanceWorkshopReport

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceDataImport.id |
| `year` | Int | * |  |  |
| `month` | Int | * |  |  |
| `productName` | String |  |  |  |
| `batchNo` | String |  |  |  |
| `workPoint` | Float |  |  |  |
| `quantity` | Float |  |  |  |
| `employeeId` | Int |  | FK | → Employee.id |
| `positionId` | Int |  | FK | → Position.id |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-68 Position](#position), [1-62 Employee](#employee), [1-30 FinanceDataImport](#financedataimport)

### 1-36 FinanceAuxiliaryMember

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `sourceSystem` | String | * | cUK |  |
| `sourceLedger` | String | * | cUK |  |
| `dimensionType` | String | * | cUK |  |
| `sourceCode` | String | * | cUK |  |
| `sourceName` | String | * |  |  |
| `shortName` | String |  |  |  |
| `identityNumber` | String |  |  |  |
| `contactPerson` | String |  |  |  |
| `phone` | String |  |  |  |
| `address` | String |  |  |  |
| `bankName` | String |  |  |  |
| `bankAccount` | String |  |  |  |
| `firstYear` | Int |  |  |  |
| `lastYear` | Int |  |  |  |
| `latestImportId` | Int |  | FK | → FinanceLedgerImport.id |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 FinanceLedgerImport](#financeledgerimport)

← Referenced by: [1-37 FinanceVoucherItemAuxiliary](#financevoucheritemauxiliary), [1-39 FinanceAuxiliaryBalanceMember](#financeauxiliarybalancemember), [1-41 FinanceOpenItemAuxiliary](#financeopenitemauxiliary)

### 1-37 FinanceVoucherItemAuxiliary

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `itemId` | Int | * | cUK+FK | → FinanceVoucherItem.id |
| `memberId` | Int | * | cUK+FK | → FinanceAuxiliaryMember.id |
| `sourceRole` | String | * | cUK |  |

→ Depends on: [1-47 FinanceVoucherItem](#financevoucheritem), [1-36 FinanceAuxiliaryMember](#financeauxiliarymember)

### 1-38 FinanceAuxiliaryBalance

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `importId` | Int | * | FK | → FinanceLedgerImport.id |
| `periodId` | Int | * | FK | → FinancePeriod.id |
| `accountId` | Int | * | FK | → FinanceAccount.id |
| `companyCode` | String | * |  |  |
| `sourceSystem` | String | * | cUK |  |
| `sourceDatabase` | String | * | cUK |  |
| `sourceKey` | String | * | cUK |  |
| `openingDebit` | Decimal | * |  |  |
| `openingCredit` | Decimal | * |  |  |
| `currentDebit` | Decimal | * |  |  |
| `currentCredit` | Decimal | * |  |  |
| `closingDebit` | Decimal | * |  |  |
| `closingCredit` | Decimal | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 FinanceLedgerImport](#financeledgerimport), [1-45 FinancePeriod](#financeperiod), [1-44 FinanceAccount](#financeaccount)

← Referenced by: [1-39 FinanceAuxiliaryBalanceMember](#financeauxiliarybalancemember)

### 1-39 FinanceAuxiliaryBalanceMember

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `balanceId` | Int | * | cUK+FK | → FinanceAuxiliaryBalance.id |
| `memberId` | Int | * | cUK+FK | → FinanceAuxiliaryMember.id |
| `sourceRole` | String | * | cUK |  |

→ Depends on: [1-38 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-36 FinanceAuxiliaryMember](#financeauxiliarymember)

### 1-40 FinanceOpenItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `importId` | Int | * | FK | → FinanceLedgerImport.id |
| `companyCode` | String | * |  |  |
| `periodId` | Int |  | FK | → FinancePeriod.id |
| `accountId` | Int |  | FK | → FinanceAccount.id |
| `voucherItemId` | Int |  | FK | → FinanceVoucherItem.id |
| `sourceSystem` | String | * | cUK |  |
| `sourceDatabase` | String | * | cUK |  |
| `sourceKey` | String | * | cUK |  |
| `documentNo` | String |  |  |  |
| `documentDate` | String |  |  |  |
| `dueDate` | String |  |  |  |
| `memo` | String |  |  |  |
| `currencyCode` | String |  |  |  |
| `originalDebit` | Decimal | * |  |  |
| `originalCredit` | Decimal | * |  |  |
| `outstandingDebit` | Decimal | * |  |  |
| `outstandingCredit` | Decimal | * |  |  |
| `status` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 FinanceLedgerImport](#financeledgerimport), [1-45 FinancePeriod](#financeperiod), [1-44 FinanceAccount](#financeaccount), [1-47 FinanceVoucherItem](#financevoucheritem)

← Referenced by: [1-41 FinanceOpenItemAuxiliary](#financeopenitemauxiliary)

### 1-41 FinanceOpenItemAuxiliary

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `openItemId` | Int | * | cUK+FK | → FinanceOpenItem.id |
| `memberId` | Int | * | cUK+FK | → FinanceAuxiliaryMember.id |
| `sourceRole` | String | * | cUK |  |

→ Depends on: [1-40 FinanceOpenItem](#financeopenitem), [1-36 FinanceAuxiliaryMember](#financeauxiliarymember)

### 1-42 FinanceLedgerImport

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `batchKey` | String |  | UK |  |
| `type` | String | * |  |  |
| `companyCode` | String | * |  |  |
| `year` | Int | * |  |  |
| `sourceSystem` | String |  |  |  |
| `sourceLedger` | String |  |  |  |
| `sourceDatabase` | String |  |  |  |
| `sourceFile` | String |  |  |  |
| `sourcePath` | String |  |  |  |
| `snapshotDate` | String |  |  |  |
| `cutoffDate` | String |  |  |  |
| `checksum` | String |  |  |  |
| `controlJson` | Json |  |  |  |
| `status` | String | * |  |  |
| `rowCount` | Int | * |  |  |
| `createdCount` | Int | * |  |  |
| `updatedCount` | Int | * |  |  |
| `skippedCount` | Int | * |  |  |
| `deletedCount` | Int | * |  |  |
| `conflictCount` | Int | * |  |  |
| `blockedCount` | Int | * |  |  |
| `warnings` | String |  |  |  |
| `importedBy` | Int |  | FK | → User.id |
| `importedAt` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-28 FinanceCashFlowItem](#financecashflowitem), [1-29 FinanceCashFlowAllocation](#financecashflowallocation), [1-36 FinanceAuxiliaryMember](#financeauxiliarymember), [1-38 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-40 FinanceOpenItem](#financeopenitem), [1-43 FinanceSourceAccountBalance](#financesourceaccountbalance), [1-46 FinanceVoucher](#financevoucher), [1-47 FinanceVoucherItem](#financevoucheritem), [1-57 FinanceCurrency](#financecurrency), [1-58 FinanceBankAccount](#financebankaccount)

### 1-43 FinanceSourceAccountBalance

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceLedgerImport.id |
| `periodId` | Int | * | FK | → FinancePeriod.id |
| `accountId` | Int | * | FK | → FinanceAccount.id |
| `companyCode` | String | * |  |  |
| `sourceSystem` | String | * | cUK |  |
| `sourceDatabase` | String | * | cUK |  |
| `sourceKey` | String | * | cUK |  |
| `openingDebit` | Decimal | * |  |  |
| `openingCredit` | Decimal | * |  |  |
| `currentDebit` | Decimal | * |  |  |
| `currentCredit` | Decimal | * |  |  |
| `closingDebit` | Decimal | * |  |  |
| `closingCredit` | Decimal | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 FinanceLedgerImport](#financeledgerimport), [1-45 FinancePeriod](#financeperiod), [1-44 FinanceAccount](#financeaccount)

### 1-44 FinanceAccount

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String | * | cUK |  |
| `name` | String | * |  |  |
| `category` | String | * |  |  |
| `parentId` | Int |  | FK | → FinanceAccount.id |
| `balanceDirection` | String | * |  |  |
| `isActive` | Boolean | * |  |  |
| `companyCode` | String | * | cUK |  |
| `mnemonicCode` | String |  |  |  |
| `currency` | String |  |  |  |
| `sourceSystem` | String |  | cUK |  |
| `sourceLedger` | String |  |  |  |
| `sourceDatabase` | String |  | cUK |  |
| `sourceKey` | String |  | cUK |  |
| `groupSubjectCode` | String |  |  |  |
| `subjectLevel` | Int |  |  |  |
| `year` | Int |  | cUK |  |
| `sortOrder` | Int | * |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-44 FinanceAccount](#financeaccount)

← Referenced by: [1-26 FinanceBudgetDept](#financebudgetdept), [1-27 FinanceBudgetRd](#financebudgetrd), [1-38 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-40 FinanceOpenItem](#financeopenitem), [1-43 FinanceSourceAccountBalance](#financesourceaccountbalance), [1-47 FinanceVoucherItem](#financevoucheritem), [1-48 FinanceAccountBalance](#financeaccountbalance), [1-50 FinanceBalanceSnapshotRow](#financebalancesnapshotrow), [1-58 FinanceBankAccount](#financebankaccount)

### 1-45 FinancePeriod

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `year` | Int | * | cUK |  |
| `month` | Int | * | cUK |  |
| `startDate` | String | * |  |  |
| `endDate` | String | * |  |  |
| `isClosed` | Boolean | * |  |  |
| `sourceSystem` | String |  |  |  |
| `sourceDatabase` | String |  |  |  |
| `sourceKey` | String |  |  |  |
| `sourceClosed` | Boolean |  |  |  |
| `companyCode` | String | * | cUK |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-23 FinanceAssetPeriodEntry](#financeassetperiodentry), [1-24 FinanceAssetAdjustment](#financeassetadjustment), [1-29 FinanceCashFlowAllocation](#financecashflowallocation), [1-38 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-40 FinanceOpenItem](#financeopenitem), [1-43 FinanceSourceAccountBalance](#financesourceaccountbalance), [1-46 FinanceVoucher](#financevoucher), [1-48 FinanceAccountBalance](#financeaccountbalance), [1-54 ReclassResult](#reclassresult)

### 1-46 FinanceVoucher

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `voucherNo` | String | * | cUK |  |
| `date` | String | * |  |  |
| `periodId` | Int | * | cUK+FK | → FinancePeriod.id |
| `description` | String | * |  |  |
| `totalDebit` | Float | * |  |  |
| `totalCredit` | Float | * |  |  |
| `status` | String | * |  |  |
| `companyCode` | String | * | cUK |  |
| `importId` | Int |  | FK | → FinanceLedgerImport.id |
| `sourceSystem` | String |  | cUK |  |
| `sourceDatabase` | String |  | cUK |  |
| `sourceKey` | String |  | cUK |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-45 FinancePeriod](#financeperiod), [1-42 FinanceLedgerImport](#financeledgerimport)

← Referenced by: [1-23 FinanceAssetPeriodEntry](#financeassetperiodentry), [1-24 FinanceAssetAdjustment](#financeassetadjustment), [1-29 FinanceCashFlowAllocation](#financecashflowallocation), [1-47 FinanceVoucherItem](#financevoucheritem)

### 1-47 FinanceVoucherItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `voucherId` | Int | * | cUK+FK | → FinanceVoucher.id |
| `accountId` | Int | * | cUK+FK | → FinanceAccount.id |
| `debit` | Float | * |  |  |
| `credit` | Float | * |  |  |
| `description` | String |  |  |  |
| `relatedEntity` | String |  |  | 正则从描述提取的关联实体 |
| `sortOrder` | Int | * | cUK |  |
| `importFingerprint` | String |  |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `sourceSystem` | String |  | cUK |  |
| `sourceDatabase` | String |  | cUK |  |
| `sourceKey` | String |  | cUK |  |
| `currencyCode` | String |  |  |  |
| `exchangeRate` | Decimal |  |  |  |
| `originalDebit` | Decimal |  |  |  |
| `originalCredit` | Decimal |  |  |  |
| `importId` | Int |  | FK | → FinanceLedgerImport.id |

→ Depends on: [1-44 FinanceAccount](#financeaccount), [1-46 FinanceVoucher](#financevoucher), [1-42 FinanceLedgerImport](#financeledgerimport)

← Referenced by: [1-29 FinanceCashFlowAllocation](#financecashflowallocation), [1-29 FinanceCashFlowAllocation](#financecashflowallocation), [1-37 FinanceVoucherItemAuxiliary](#financevoucheritemauxiliary), [1-40 FinanceOpenItem](#financeopenitem), [1-54 ReclassResult](#reclassresult)

### 1-48 FinanceAccountBalance

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `accountId` | Int | * | cUK+FK | → FinanceAccount.id |
| `periodId` | Int | * | cUK+FK | → FinancePeriod.id |
| `openingDebit` | Float | * |  |  |
| `openingCredit` | Float | * |  |  |
| `currentDebit` | Float | * |  |  |
| `currentCredit` | Float | * |  |  |
| `closingDebit` | Float | * |  |  |
| `closingCredit` | Float | * |  |  |
| `companyCode` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-45 FinancePeriod](#financeperiod), [1-44 FinanceAccount](#financeaccount)

### 1-49 FinanceBalanceSnapshot

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * |  |  |
| `year` | Int | * |  |  |
| `snapshotType` | String | * |  | "baseline" | "reconcile" |
| `isActive` | Boolean | * |  | 同(companyCode,year)只有一个active baseline |
| `sourceFile` | String |  |  |  |
| `sourcePath` | String |  |  |  |
| `checksum` | String |  |  |  |
| `rowCount` | Int | * |  |  |
| `importedBy` | Int |  | FK | → User.id |
| `importedAt` | DateTime | * |  |  |
| `note` | String |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-6 User](#user)

← Referenced by: [1-50 FinanceBalanceSnapshotRow](#financebalancesnapshotrow)

### 1-50 FinanceBalanceSnapshotRow

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `snapshotId` | Int | * | cUK+FK | → FinanceBalanceSnapshot.id |
| `accountId` | Int | * | cUK+FK | → FinanceAccount.id |
| `accountCode` | String | * |  | 导入时的科目编码快照（审计追溯） |
| `accountName` | String | * |  | 导入时的科目名称快照 |
| `openingDebit` | Float | * |  |  |
| `openingCredit` | Float | * |  |  |
| `currentDebit` | Float | * |  |  |
| `currentCredit` | Float | * |  |  |
| `closingDebit` | Float | * |  |  |
| `closingCredit` | Float | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |

→ Depends on: [1-49 FinanceBalanceSnapshot](#financebalancesnapshot), [1-44 FinanceAccount](#financeaccount)

### 1-51 FinanceReclassRule

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `sourceAccountCode` | String | * | cUK |  |
| `abnormalSide` | String | * | cUK | debit | credit | both |
| `decision` | String | * |  | reclassify | no_reclass |
| `targetAccountCode` | String |  |  |  |
| `enabled` | Boolean | * |  |  |
| `source` | String | * |  | 仅保留 manual；字段用于历史追溯 |
| `confirmedBy` | Int |  | FK | → User.id |
| `confirmedAt` | DateTime |  |  |  |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-54 ReclassResult](#reclassresult)

### 1-52 FinanceReclassItemRule

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `year` | Int | * | cUK |  |
| `sourceAccountCode` | String | * | cUK |  |
| `matchType` | String | * | cUK |  |
| `matchValue` | String | * | cUK |  |
| `targetAccountCode` | String | * |  |  |
| `enabled` | Boolean | * |  |  |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-53 FinanceBalanceReclassAdjustment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `periodId` | Int | * | cUK |  |
| `companyCode` | String | * |  |  |
| `year` | Int | * |  |  |
| `sourceAccountCode` | String | * | cUK |  |
| `targetAccountCode` | String | * |  |  |
| `amount` | Float | * |  |  |
| `sourceType` | String | * |  | balance_residual | auxiliary_balance | reference_workpaper | manual |
| `ruleId` | Int |  |  |  |
| `status` | String | * |  | approved | adjusted | rejected |
| `note` | String |  |  |  |
| `adjustedBy` | Int |  |  |  |
| `adjustedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-54 ReclassResult

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `periodId` | Int | * | cUK+FK | → FinancePeriod.id |
| `voucherItemId` | Int |  | cUK+FK | 当前来源凭证明细；历史来源已删除时为 null |
| `voucherItemIdSnapshot` | Int | * |  | 生成时的来源凭证明细 ID 快照，永不因父记录删除而丢失 |
| `ruleId` | Int |  | FK | 当前规则；手工添加、规则已删除或历史兼容时为 null |
| `ruleIdSnapshot` | Int |  |  | 生成时的规则 ID 快照 |
| `sourceAccount` | String | * |  | 原科目编码（快照，不FK） |
| `targetAccount` | String | * |  | 目标科目编码（可修改） |
| `amount` | Float | * |  | 重分类金额 |
| `status` | String | * |  | pending|approved|adjusted|rejected |
| `adjustedBy` | Int |  | FK | 审核人 userId |
| `adjustedAt` | DateTime |  |  |  |
| `note` | String |  |  | 审核备注 |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-45 FinancePeriod](#financeperiod), [1-47 FinanceVoucherItem](#financevoucheritem), [1-51 FinanceReclassRule](#financereclassrule), [1-6 User](#user)

### 1-55 FinanceStatementWorkpaper

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `year` | Int | * | cUK |  |
| `month` | Int | * | cUK |  |
| `reportType` | String | * | cUK | balanceSheet | incomeStatement | cashFlow |
| `status` | String | * |  | draft | submitted |
| `note` | String |  |  |  |
| `updatedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-56 FinanceStatementWorkpaperLine](#financestatementworkpaperline)

### 1-56 FinanceStatementWorkpaperLine

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `workpaperId` | Int | * | cUK+FK | → FinanceStatementWorkpaper.id |
| `lineCode` | String | * | cUK |  |
| `manualAmount` | Float | * |  |  |
| `importedAmount` | Float | * |  |  |
| `formulaText` | String |  |  |  |
| `note` | String |  |  |  |
| `source` | String |  |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-55 FinanceStatementWorkpaper](#financestatementworkpaper)

### 1-57 FinanceCurrency

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `sourceSystem` | String | * | cUK |  |
| `sourceLedger` | String | * | cUK |  |
| `sourceCode` | String | * | cUK |  |
| `sourceName` | String | * |  |  |
| `symbol` | String |  |  |  |
| `decimalDigits` | Int |  |  |  |
| `isBase` | Boolean | * |  |  |
| `latestImportId` | Int |  | FK | → FinanceLedgerImport.id |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 FinanceLedgerImport](#financeledgerimport)

### 1-58 FinanceBankAccount

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `accountId` | Int |  | FK | → FinanceAccount.id |
| `sourceSystem` | String | * | cUK |  |
| `sourceLedger` | String | * | cUK |  |
| `sourceKey` | String | * | cUK |  |
| `sourceCode` | String |  |  |  |
| `sourceName` | String | * |  |  |
| `accountNo` | String |  |  |  |
| `bankName` | String |  |  |  |
| `currencyCode` | String |  |  |  |
| `isActive` | Boolean | * |  |  |
| `latestImportId` | Int |  | FK | → FinanceLedgerImport.id |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-44 FinanceAccount](#financeaccount), [1-42 FinanceLedgerImport](#financeledgerimport)

### 1-59 DepartmentDescription

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | FK | → Department.id |
| `sourceFile` | String | * |  |  |
| `codeRaw` | String |  |  |  |
| `details` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-66 Department](#department)

### 1-60 PositionDescription

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `positionPurpose` | String |  |  |  |
| `summary` | String |  |  |  |
| `headcount` | Int |  |  |  |
| `version` | String |  |  |  |
| `effectiveDate` | String |  |  |  |
| `sourceFile` | String | * |  |  |
| `details` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-68 Position](#position), [1-142 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-61 HrPerformanceReview

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `employeeId` | Int | * | cUK+FK | → Employee.id |
| `okrCycleId` | Int | * | cUK |  |
| `approvalRequestId` | Int |  |  |  |
| `selfScore` | Int |  |  |  |
| `selfComment` | String | * |  |  |
| `managerScore` | Int |  |  |  |
| `managerComment` | String | * |  |  |
| `finalScore` | Int | * |  |  |
| `finalGrade` | String | * |  |  |
| `hrComment` | String | * |  |  |
| `okrSnapshotJson` | String | * |  |  |
| `archivedByUserId` | Int |  |  |  |
| `archivedAt` | DateTime | * |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-62 Employee](#employee)

### 1-62 Employee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `employeeId` | String | * | UK |  |
| `idNumber` | String |  | UK |  |
| `otherId` | String |  |  |  |
| `name` | String | * |  |  |
| `alias` | String |  |  |  |
| `gender` | Boolean |  |  |  |
| `birthDate` | String |  |  |  |
| `ethnicity` | String |  |  |  |
| `hometown` | String |  |  |  |
| `politics` | String |  |  |  |
| `education` | String |  |  |  |
| `title` | String |  |  |  |
| `school` | String |  |  |  |
| `major` | String |  |  |  |
| `phone` | String |  |  |  |
| `workStartDate` | String |  |  |  |
| `userId` | Int |  | FK | → User.id |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-31 FinanceShipment](#financeshipment), [1-32 FinanceSalesSalary](#financesalessalary), [1-35 FinanceWorkshopReport](#financeworkshopreport), [1-61 HrPerformanceReview](#hrperformancereview), [1-63 Employment](#employment), [1-67 DepartmentManagerEmployee](#departmentmanageremployee), [1-69 EDP](#edp), [1-135 EmployeeProject](#employeeproject), [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem)

### 1-63 Employment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `isActive` | Boolean | * |  |  |
| `currentCompany` | String |  |  |  |
| `joinDate` | String |  |  |  |
| `leaveDate` | String |  |  |  |
| `leaveReason` | String |  |  |  |
| `leaveNote` | String |  |  |  |
| `officeLocation` | String |  |  |  |
| `attendanceType` | String |  |  |  |
| `personnelType` | String |  |  |  |
| `rank` | String |  |  |  |
| `title` | String |  |  |  |
| `contracts` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-62 Employee](#employee)

### 1-64 Company

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String | * | UK |  |
| `name` | String | * | UK |  |
| `fullName` | String |  |  |  |
| `registeredCapital` | String |  |  |  |
| `unifiedCode` | String |  |  |  |
| `bankName` | String |  |  |  |
| `registeredAddress` | String |  |  |  |
| `registeredDate` | String |  |  |  |
| `legalPerson` | String |  |  |  |
| `managementGroup` | String | * |  |  |
| `codePoolCode` | String |  |  |  |
| `isActive` | Boolean | * |  |  |
| `sortOrder` | Int | * |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-65 CompanyRelation](#companyrelation), [1-65 CompanyRelation](#companyrelation), [1-69 EDP](#edp), [1-70 PositionReportOverride](#positionreportoverride)

### 1-65 CompanyRelation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `parentId` | Int | * | cUK+FK | → Company.id |
| `childId` | Int | * | cUK+FK | → Company.id |
| `shareRatio` | Float |  |  |  |
| `isConsolidated` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-64 Company](#company), [1-64 Company](#company)

### 1-66 Department

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String | * |  |  |
| `name` | String | * |  |  |
| `alias` | String |  |  |  |
| `hierarchyKind` | String | * |  |  |
| `level` | Int | * |  |  |
| `parentId` | Int |  | FK | → Department.id |
| `managerPositionId` | Int |  | FK | → Position.id |
| `isArchived` | Boolean | * |  |  |
| `archivedAt` | DateTime |  |  |  |
| `endDate` | DateTime |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-68 Position](#position), [1-66 Department](#department)

← Referenced by: [1-11 DepartmentResourceActionGrant](#departmentresourceactiongrant), [1-59 DepartmentDescription](#departmentdescription), [1-67 DepartmentManagerEmployee](#departmentmanageremployee), [1-68 Position](#position), [1-69 EDP](#edp), [1-70 PositionReportOverride](#positionreportoverride), [1-117 DepartmentCollaboration](#departmentcollaboration), [1-118 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-133 Project](#project), [1-133 Project](#project), [1-134 ProjectEnablingDepartment](#projectenablingdepartment), [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem), [1-148 DepartmentWorkAssignee](#departmentworkassignee)

### 1-67 DepartmentManagerEmployee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `employeeId` | Int | * | cUK+FK | → Employee.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-66 Department](#department), [1-62 Employee](#employee)

### 1-68 Position

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String | * |  |  |
| `alias` | String |  |  |  |
| `name` | String | * |  |  |
| `departmentId` | Int |  | FK | → Department.id |
| `positionDescriptionId` | Int |  | cUK+FK | → PositionDescription.id |
| `reportToPositionId` | Int |  | FK | → Position.id |
| `isArchived` | Boolean | * |  |  |
| `archivedAt` | DateTime |  |  |  |
| `endDate` | DateTime |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-60 PositionDescription](#positiondescription), [1-68 Position](#position), [1-66 Department](#department)

← Referenced by: [1-10 PositionResourceActionGrant](#positionresourceactiongrant), [1-35 FinanceWorkshopReport](#financeworkshopreport), [1-66 Department](#department), [1-69 EDP](#edp), [1-70 PositionReportOverride](#positionreportoverride), [1-70 PositionReportOverride](#positionreportoverride), [1-119 DepartmentCollaborationPosition](#departmentcollaborationposition)

### 1-69 EDP

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `reportingCompanyId` | Int |  | FK | → Company.id |
| `departmentId` | Int |  | FK | → Department.id |
| `positionId` | Int |  | FK | → Position.id |
| `positionReportOverrideId` | Int |  | FK | → PositionReportOverride.id |
| `isPrimary` | Boolean | * |  |  |
| `startDate` | String |  |  |  |
| `endDate` | String |  |  |  |
| `reportTo` | String |  |  |  |
| `workPercent` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-68 Position](#position), [1-66 Department](#department), [1-64 Company](#company), [1-70 PositionReportOverride](#positionreportoverride), [1-62 Employee](#employee)

### 1-70 PositionReportOverride

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `positionId` | Int | * | cUK+FK | → Position.id |
| `companyId` | Int | * | cUK+FK | → Company.id |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `reportToPositionId` | Int |  | FK | → Position.id |
| `headcount` | Int |  |  |  |
| `isActive` | Boolean | * |  |  |
| `remark` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-68 Position](#position), [1-64 Company](#company), [1-66 Department](#department), [1-68 Position](#position)

← Referenced by: [1-69 EDP](#edp)

### 1-71 EditHistory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `entityType` | String | * | cUK |  |
| `entityId` | String | * | cUK |  |
| `version` | Int | * | cUK |  |
| `dataJson` | String | * |  |  |
| `editedBy` | Int | * | FK | → User.id |
| `createdAt` | DateTime | * |  |  |
| `tag` | String |  | cUK |  |

→ Depends on: [1-6 User](#user)

### 1-72 InventoryItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `code` | String | * | cUK |  |
| `name` | String | * |  |  |
| `itemType` | String | * |  |  |
| `specification` | String |  |  |  |
| `baseUnit` | String | * |  |  |
| `status` | String | * |  |  |
| `note` | String |  |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceKey` | String |  | cUK |  |
| `editedBy` | Int |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-73 InventoryUnitConversion](#inventoryunitconversion), [1-75 InventoryBatch](#inventorybatch), [1-77 InventoryDocumentLine](#inventorydocumentline), [1-78 InventoryLedgerEntry](#inventoryledgerentry), [1-80 InventoryStocktakeLine](#inventorystocktakeline)

### 1-73 InventoryUnitConversion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `itemId` | Int | * | cUK+FK | → InventoryItem.id |
| `unit` | String | * | cUK |  |
| `factor` | Decimal | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-72 InventoryItem](#inventoryitem)

### 1-74 InventoryWarehouse

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `code` | String | * | cUK |  |
| `name` | String | * |  |  |
| `status` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-75 InventoryBatch](#inventorybatch), [1-77 InventoryDocumentLine](#inventorydocumentline), [1-78 InventoryLedgerEntry](#inventoryledgerentry), [1-79 InventoryStocktake](#inventorystocktake), [1-80 InventoryStocktakeLine](#inventorystocktakeline)

### 1-75 InventoryBatch

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `itemId` | Int | * | cUK+FK | → InventoryItem.id |
| `warehouseId` | Int | * | cUK+FK | → InventoryWarehouse.id |
| `batchNo` | String | * | cUK |  |
| `productionDate` | String |  |  |  |
| `expiryDate` | String |  |  |  |
| `status` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-72 InventoryItem](#inventoryitem), [1-74 InventoryWarehouse](#inventorywarehouse)

← Referenced by: [1-77 InventoryDocumentLine](#inventorydocumentline), [1-78 InventoryLedgerEntry](#inventoryledgerentry), [1-80 InventoryStocktakeLine](#inventorystocktakeline)

### 1-76 InventoryDocument

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `documentNo` | String | * | cUK |  |
| `documentType` | String | * |  |  |
| `documentDate` | String | * |  |  |
| `status` | String | * |  |  |
| `counterparty` | String |  |  |  |
| `referenceNo` | String |  |  |  |
| `note` | String |  |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceKey` | String |  | cUK |  |
| `createdBy` | Int |  |  |  |
| `postedBy` | Int |  |  |  |
| `postedAt` | DateTime |  |  |  |
| `reversedById` | Int |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-77 InventoryDocumentLine](#inventorydocumentline)

### 1-77 InventoryDocumentLine

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `documentId` | Int | * | cUK+FK | → InventoryDocument.id |
| `itemId` | Int | * | FK | → InventoryItem.id |
| `warehouseId` | Int | * | FK | → InventoryWarehouse.id |
| `batchId` | Int |  | FK | → InventoryBatch.id |
| `quantity` | Decimal | * |  |  |
| `unit` | String | * |  |  |
| `unitFactor` | Decimal | * |  |  |
| `unitPrice` | Decimal |  |  |  |
| `paymentStatus` | String |  |  |  |
| `invoiceStatus` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `sourceKey` | String |  | cUK |  |
| `ledgerEntry` | InventoryLedgerEntry |  |  |  |

→ Depends on: [1-76 InventoryDocument](#inventorydocument), [1-72 InventoryItem](#inventoryitem), [1-74 InventoryWarehouse](#inventorywarehouse), [1-75 InventoryBatch](#inventorybatch)

← Referenced by: [1-78 InventoryLedgerEntry](#inventoryledgerentry)

### 1-78 InventoryLedgerEntry

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `documentLineId` | Int | * | UK+FK | → InventoryDocumentLine.id |
| `companyCode` | String | * |  |  |
| `itemId` | Int | * | FK | → InventoryItem.id |
| `warehouseId` | Int | * | FK | → InventoryWarehouse.id |
| `batchId` | Int |  | FK | → InventoryBatch.id |
| `movementDate` | String | * |  |  |
| `signedQuantity` | Decimal | * |  |  |
| `unitCost` | Decimal |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-77 InventoryDocumentLine](#inventorydocumentline), [1-72 InventoryItem](#inventoryitem), [1-74 InventoryWarehouse](#inventorywarehouse), [1-75 InventoryBatch](#inventorybatch)

### 1-79 InventoryStocktake

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `stocktakeNo` | String | * | cUK |  |
| `warehouseId` | Int | * | FK | → InventoryWarehouse.id |
| `stocktakeDate` | String | * |  |  |
| `status` | String | * |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceKey` | String |  | cUK |  |
| `createdBy` | Int |  |  |  |
| `approvedBy` | Int |  |  |  |
| `approvedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-74 InventoryWarehouse](#inventorywarehouse)

← Referenced by: [1-80 InventoryStocktakeLine](#inventorystocktakeline)

### 1-80 InventoryStocktakeLine

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `stocktakeId` | Int | * | cUK+FK | → InventoryStocktake.id |
| `itemId` | Int | * | cUK+FK | → InventoryItem.id |
| `warehouseId` | Int | * | cUK+FK | → InventoryWarehouse.id |
| `batchId` | Int |  | cUK+FK | → InventoryBatch.id |
| `bookQuantity` | Decimal | * |  |  |
| `actualQuantity` | Decimal | * |  |  |
| `note` | String |  |  |  |
| `sourceRow` | Int |  |  |  |

→ Depends on: [1-79 InventoryStocktake](#inventorystocktake), [1-72 InventoryItem](#inventoryitem), [1-74 InventoryWarehouse](#inventorywarehouse), [1-75 InventoryBatch](#inventorybatch)

### 1-81 InventoryPeriodClose

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `year` | Int | * | cUK |  |
| `month` | Int | * | cUK |  |
| `status` | String | * |  |  |
| `voucherId` | Int |  |  |  |
| `lockedBy` | Int |  |  |  |
| `lockedAt` | DateTime |  |  |  |
| `unlockedBy` | Int |  |  |  |
| `unlockedAt` | DateTime |  |  |  |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-82 InventoryImportBatch

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  | cUK |  |
| `checksum` | String | * | cUK |  |
| `status` | String | * |  |  |
| `itemCount` | Int | * |  |  |
| `documentCount` | Int | * |  |  |
| `rowCount` | Int | * |  |  |
| `warningCount` | Int | * |  |  |
| `importedBy` | Int |  |  |  |
| `importedAt` | DateTime | * |  |  |
| `note` | String |  |  |  |

### 1-83 StockRawMaterial

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `code` | String | * | UK |  |
| `name` | String | * |  |  |
| `spec` | String |  |  |  |
| `unit` | String | * |  |  |
| `manufacturer` | String |  |  |  |
| `status` | String | * |  |  |
| `lastBalance` | Float | * |  |  |
| `currentPurchase` | Float | * |  |  |
| `currentConsume` | Float | * |  |  |
| `remark` | String |  |  |  |
| `companyCode` | String |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

### 1-84 StockPackaging

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `code` | String | * | UK |  |
| `name` | String | * |  |  |
| `spec` | String |  |  |  |
| `unit` | String | * |  |  |
| `packagingType` | String | * |  |  |
| `status` | String | * |  |  |
| `lastBalance` | Float | * |  |  |
| `currentInbound` | Float | * |  |  |
| `currentOutbound` | Float | * |  |  |
| `batchNo` | String |  |  |  |
| `expiryDate` | String |  |  |  |
| `remark` | String |  |  |  |
| `companyCode` | String |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

### 1-85 StockFinishedGoods

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `code` | String | * | UK |  |
| `name` | String | * |  |  |
| `packagingSpec` | String |  |  |  |
| `unit` | String | * |  |  |
| `stockType` | String | * |  |  |
| `lastBalance` | Float | * |  |  |
| `currentInbound` | Float | * |  |  |
| `currentOutbound` | Float | * |  |  |
| `availableStock` | Float | * |  |  |
| `remark` | String |  |  |  |
| `companyCode` | String |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

### 1-86 StockBatch

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `targetType` | String | * |  |  |
| `targetId` | Int | * |  |  |
| `batchNo` | String | * |  |  |
| `quantity` | Float | * |  |  |
| `expiryDate` | String |  |  |  |
| `status` | String | * |  |  |
| `remark` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-87 StockOperation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `opType` | String | * |  |  |
| `targetType` | String | * |  |  |
| `targetId` | Int | * |  |  |
| `quantity` | Float | * |  |  |
| `docNo` | String |  |  |  |
| `reason` | String |  |  |  |
| `operatorId` | Int |  | FK | → User.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

### 1-88 StockReturn

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `finishedGoodsId` | Int | * |  |  |
| `returnDate` | String | * |  |  |
| `quantity` | Float | * |  |  |
| `salesman` | String |  |  |  |
| `reason` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-89 LibraryTagCandidate

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `candidateUid` | String | * | UK |  |
| `documentId` | Int | * | FK | → LibraryDocument.id |
| `versionId` | Int | * | cUK+FK | → LibraryDocumentVersion.id |
| `tagId` | Int |  | FK | → LibraryTag.id |
| `dimension` | String | * |  |  |
| `proposedKey` | String | * | cUK |  |
| `proposedName` | String | * |  |  |
| `confidence` | Float | * |  |  |
| `evidenceJson` | String | * |  |  |
| `providerKey` | String | * |  |  |
| `modelKey` | String | * |  |  |
| `promptVersion` | String | * | cUK |  |
| `status` | String | * |  |  |
| `reviewedBy` | Int |  | FK | → User.id |
| `reviewedAt` | DateTime |  |  |  |
| `reviewNote` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-99 LibraryDocument](#librarydocument), [1-100 LibraryDocumentVersion](#librarydocumentversion), [1-108 LibraryTag](#librarytag), [1-6 User](#user)

### 1-90 LibraryEntityMention

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `mentionUid` | String | * | UK |  |
| `versionId` | Int | * | FK | → LibraryDocumentVersion.id |
| `chunkId` | Int |  | FK | → LibraryContentChunk.id |
| `entityType` | String | * |  |  |
| `canonicalValue` | String | * |  |  |
| `observedText` | String | * |  |  |
| `locatorJson` | String | * |  |  |
| `confidence` | Float |  |  |  |
| `source` | String | * |  |  |
| `providerKey` | String |  |  |  |
| `modelKey` | String |  |  |  |
| `status` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-100 LibraryDocumentVersion](#librarydocumentversion), [1-96 LibraryContentChunk](#librarycontentchunk)

### 1-91 LibraryMetadataCandidate

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `candidateUid` | String | * | UK |  |
| `documentId` | Int | * | FK | → LibraryDocument.id |
| `versionId` | Int | * | cUK+FK | → LibraryDocumentVersion.id |
| `title` | String |  |  |  |
| `summary` | String |  |  |  |
| `keywordsJson` | String | * |  |  |
| `entitiesJson` | String | * |  |  |
| `keyPassagesJson` | String | * |  |  |
| `fileFactsJson` | String | * |  |  |
| `source` | String | * |  |  |
| `providerKey` | String | * |  |  |
| `modelKey` | String | * |  |  |
| `promptVersion` | String | * | cUK |  |
| `status` | String | * |  |  |
| `reviewedBy` | Int |  | FK | → User.id |
| `reviewedAt` | DateTime |  |  |  |
| `reviewNote` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-99 LibraryDocument](#librarydocument), [1-100 LibraryDocumentVersion](#librarydocumentversion), [1-6 User](#user)

### 1-92 LibraryEvaluationCase

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `caseUid` | String | * | UK |  |
| `kind` | String | * |  |  |
| `question` | String | * |  |  |
| `expectedAnswer` | String |  |  |  |
| `expectedBehavior` | String | * |  |  |
| `minConfidentiality` | Int | * |  |  |
| `status` | String | * |  |  |
| `createdBy` | Int | * | FK | → User.id |
| `reviewedBy` | Int |  | FK | → User.id |
| `reviewedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-6 User](#user)

← Referenced by: [1-93 LibraryEvaluationEvidence](#libraryevaluationevidence)

### 1-93 LibraryEvaluationEvidence

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `evidenceUid` | String | * | UK |  |
| `caseId` | Int | * | cUK+FK | → LibraryEvaluationCase.id |
| `versionId` | Int | * | cUK+FK | → LibraryDocumentVersion.id |
| `locatorJson` | String | * |  |  |
| `quote` | String | * |  |  |
| `required` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-92 LibraryEvaluationCase](#libraryevaluationcase), [1-100 LibraryDocumentVersion](#librarydocumentversion)

### 1-94 LibraryProcessingJob

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `jobUid` | String | * | UK |  |
| `versionId` | Int | * | FK | → LibraryDocumentVersion.id |
| `kind` | String | * |  |  |
| `status` | String | * |  |  |
| `priority` | Int | * |  |  |
| `attempt` | Int | * |  |  |
| `maxAttempts` | Int | * |  |  |
| `idempotencyKey` | String | * | UK |  |
| `inputChecksum` | String | * |  |  |
| `pipelineVersion` | String | * |  |  |
| `providerKey` | String |  |  |  |
| `modelKey` | String |  |  |  |
| `errorCode` | String |  |  |  |
| `errorMessage` | String |  |  |  |
| `metricsJson` | String |  |  |  |
| `queuedAt` | DateTime | * |  |  |
| `startedAt` | DateTime |  |  |  |
| `finishedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-100 LibraryDocumentVersion](#librarydocumentversion)

← Referenced by: [1-95 LibraryArtifact](#libraryartifact)

### 1-95 LibraryArtifact

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `artifactUid` | String | * | UK |  |
| `versionId` | Int | * | cUK+FK | → LibraryDocumentVersion.id |
| `jobId` | Int |  | FK | → LibraryProcessingJob.id |
| `kind` | String | * | cUK |  |
| `status` | String | * |  |  |
| `storagePath` | String | * |  |  |
| `mimeType` | String |  |  |  |
| `fileSizeBytes` | Int | * |  |  |
| `checksumSha256` | String | * | cUK |  |
| `pageCount` | Int |  |  |  |
| `locatorSchemaVersion` | String | * |  |  |
| `toolchainJson` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-100 LibraryDocumentVersion](#librarydocumentversion), [1-94 LibraryProcessingJob](#libraryprocessingjob)

← Referenced by: [1-96 LibraryContentChunk](#librarycontentchunk), [1-97 LibrarySearchIndex](#librarysearchindex)

### 1-96 LibraryContentChunk

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `chunkUid` | String | * | UK |  |
| `versionId` | Int | * | cUK+FK | → LibraryDocumentVersion.id |
| `artifactId` | Int |  | FK | → LibraryArtifact.id |
| `ordinal` | Int | * | cUK |  |
| `content` | String | * |  |  |
| `contentSha256` | String | * |  |  |
| `locatorJson` | String | * |  |  |
| `headingPathJson` | String |  |  |  |
| `tokenCount` | Int |  |  |  |
| `language` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-100 LibraryDocumentVersion](#librarydocumentversion), [1-95 LibraryArtifact](#libraryartifact)

← Referenced by: [1-90 LibraryEntityMention](#libraryentitymention)

### 1-97 LibrarySearchIndex

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `indexUid` | String | * | UK |  |
| `versionId` | Int | * | cUK+FK | → LibraryDocumentVersion.id |
| `artifactId` | Int |  | FK | → LibraryArtifact.id |
| `kind` | String | * | cUK |  |
| `engineKey` | String | * |  |  |
| `modelKey` | String |  |  |  |
| `embeddingDimensions` | Int |  |  |  |
| `generation` | Int | * | cUK |  |
| `status` | String | * |  |  |
| `active` | Boolean | * |  |  |
| `indexChecksum` | String |  |  |  |
| `builtAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-100 LibraryDocumentVersion](#librarydocumentversion), [1-95 LibraryArtifact](#libraryartifact)

### 1-98 LibraryExportJob

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `exportUid` | String | * | UK |  |
| `requestedBy` | Int | * | FK | → User.id |
| `status` | String | * |  |  |
| `selectionJson` | String | * |  |  |
| `optionsJson` | String | * |  |  |
| `manifestSha256` | String |  |  |  |
| `storagePath` | String |  |  |  |
| `fileSizeBytes` | Int |  |  |  |
| `errorCode` | String |  |  |  |
| `errorMessage` | String |  |  |  |
| `expiresAt` | DateTime |  |  |  |
| `startedAt` | DateTime |  |  |  |
| `finishedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

### 1-99 LibraryDocument

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `documentUid` | String | * | UK |  |
| `docId` | String | * | UK |  |
| `stableKey` | String | * | UK |  |
| `rootKey` | String | * |  |  |
| `relativePath` | String | * |  |  |
| `fileName` | String | * |  |  |
| `extension` | String |  |  |  |
| `mimeType` | String |  |  |  |
| `fileSizeBytes` | Int |  |  |  |
| `fileMtime` | DateTime |  |  |  |
| `checksumSha256` | String |  |  |  |
| `categoryCode` | String |  |  |  |
| `categoryName` | String |  |  |  |
| `subcategoryPath` | String |  |  |  |
| `directoryPath` | String |  |  |  |
| `title` | String |  |  |  |
| `summary` | String |  |  |  |
| `categoryId` | Int |  | FK | → LibraryCategory.id |
| `currentDirectoryId` | Int |  | FK | → LibraryDirectory.id |
| `categorySource` | String | * |  |  |
| `currentVersionId` | Int |  | UK+FK | → LibraryDocumentVersion.id |
| `confidentialityLevel` | Int | * |  |  |
| `status` | String | * |  |  |
| `origin` | String | * |  |  |
| `generatorKey` | String |  |  |  |
| `versionLabel` | String |  |  |  |
| `ownerUserId` | Int |  | FK | → User.id |
| `asOfDate` | DateTime |  |  |  |
| `reviewStatus` | String | * |  |  |
| `reviewedAt` | DateTime |  |  |  |
| `reviewedBy` | Int |  | FK | → User.id |
| `gitRepo` | String |  |  |  |
| `gitCommit` | String |  |  |  |
| `gitPath` | String |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-6 User](#user), [1-6 User](#user), [1-101 LibraryCategory](#librarycategory), [1-102 LibraryDirectory](#librarydirectory), [1-100 LibraryDocumentVersion](#librarydocumentversion)

← Referenced by: [1-89 LibraryTagCandidate](#librarytagcandidate), [1-91 LibraryMetadataCandidate](#librarymetadatacandidate), [1-100 LibraryDocumentVersion](#librarydocumentversion), [1-106 DueDiligenceMaterialSelection](#duediligencematerialselection), [1-109 LibraryDocumentTag](#librarydocumenttag)

### 1-100 LibraryDocumentVersion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `versionUid` | String | * | UK |  |
| `documentId` | Int | * | cUK+FK | → LibraryDocument.id |
| `versionNo` | Int | * | cUK |  |
| `versionLabel` | String |  |  |  |
| `fileName` | String | * |  |  |
| `storagePath` | String | * |  |  |
| `storageFileName` | String |  |  |  |
| `storageMimeType` | String |  |  |  |
| `storageFileSizeBytes` | Int |  |  |  |
| `storageChecksumSha256` | String |  |  |  |
| `relativePath` | String | * |  |  |
| `extension` | String |  |  |  |
| `mimeType` | String |  |  |  |
| `fileSizeBytes` | Int |  |  |  |
| `sourceModifiedAt` | DateTime |  |  |  |
| `checksumSha256` | String |  |  |  |
| `gitCommit` | String |  |  |  |
| `changeNote` | String |  |  |  |
| `createdBy` | Int |  | FK | → User.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-99 LibraryDocument](#librarydocument), [1-6 User](#user)

← Referenced by: [1-89 LibraryTagCandidate](#librarytagcandidate), [1-90 LibraryEntityMention](#libraryentitymention), [1-91 LibraryMetadataCandidate](#librarymetadatacandidate), [1-93 LibraryEvaluationEvidence](#libraryevaluationevidence), [1-94 LibraryProcessingJob](#libraryprocessingjob), [1-95 LibraryArtifact](#libraryartifact), [1-96 LibraryContentChunk](#librarycontentchunk), [1-97 LibrarySearchIndex](#librarysearchindex), [1-99 LibraryDocument](#librarydocument), [1-106 DueDiligenceMaterialSelection](#duediligencematerialselection)

### 1-101 LibraryCategory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `categoryUid` | String | * | UK |  |
| `parentId` | Int |  | FK | → LibraryCategory.id |
| `code` | String |  | UK |  |
| `name` | String | * |  |  |
| `fullPath` | String | * | UK |  |
| `status` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-101 LibraryCategory](#librarycategory)

← Referenced by: [1-99 LibraryDocument](#librarydocument)

### 1-102 LibraryDirectory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `directoryUid` | String | * | UK |  |
| `rootKey` | String | * | cUK |  |
| `relativePath` | String | * | cUK |  |
| `name` | String | * |  |  |
| `status` | String | * |  |  |
| `lastScannedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-99 LibraryDocument](#librarydocument)

### 1-103 DueDiligenceParty

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `name` | String | * |  |  |
| `contact` | String |  |  |  |
| `type` | String |  |  |  |
| `ndaStatus` | String | * |  |  |
| `notes` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-104 DueDiligenceRequest](#duediligencerequest)

### 1-104 DueDiligenceRequest

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `partyId` | Int | * | FK | → DueDiligenceParty.id |
| `title` | String | * |  |  |
| `receivedAt` | DateTime |  |  |  |
| `status` | String | * |  |  |
| `defaultConfidentialityLevel` | Int | * |  |  |
| `archivedAt` | DateTime |  |  |  |
| `archivedBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-103 DueDiligenceParty](#duediligenceparty)

← Referenced by: [1-105 DueDiligenceQuestion](#duediligencequestion)

### 1-105 DueDiligenceQuestion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `requestId` | Int | * | FK | → DueDiligenceRequest.id |
| `questionText` | String | * |  |  |
| `categoryHint` | String |  |  |  |
| `answerDraft` | String |  |  |  |
| `status` | String | * |  |  |
| `notes` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-104 DueDiligenceRequest](#duediligencerequest)

← Referenced by: [1-106 DueDiligenceMaterialSelection](#duediligencematerialselection)

### 1-106 DueDiligenceMaterialSelection

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `questionId` | Int | * | FK | → DueDiligenceQuestion.id |
| `documentId` | Int | * | FK | → LibraryDocument.id |
| `documentVersionId` | Int |  | FK | → LibraryDocumentVersion.id |
| `matchScore` | Float |  |  |  |
| `reason` | String |  |  |  |
| `selected` | Boolean | * |  |  |
| `selectedBy` | Int |  |  |  |
| `selectedAt` | DateTime |  |  |  |

→ Depends on: [1-105 DueDiligenceQuestion](#duediligencequestion), [1-99 LibraryDocument](#librarydocument), [1-100 LibraryDocumentVersion](#librarydocumentversion)

### 1-107 LibraryGeneratedSource

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `key` | String | * | UK |  |
| `name` | String | * |  |  |
| `outputCategory` | String |  |  |  |
| `defaultConfidentialityLevel` | Int | * |  |  |
| `enabled` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-108 LibraryTag

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `tagUid` | String | * | UK |  |
| `key` | String | * | UK |  |
| `name` | String | * |  |  |
| `dimension` | String | * |  |  |
| `taxonomyVersion` | String | * |  |  |
| `status` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-89 LibraryTagCandidate](#librarytagcandidate), [1-109 LibraryDocumentTag](#librarydocumenttag)

### 1-109 LibraryDocumentTag

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `documentId` | Int | * | cUK+FK | → LibraryDocument.id |
| `tagId` | Int | * | cUK+FK | → LibraryTag.id |
| `createdBy` | Int |  | FK | → User.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-99 LibraryDocument](#librarydocument), [1-108 LibraryTag](#librarytag), [1-6 User](#user)

### 1-110 OpenApiClient

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `name` | String | * |  |  |
| `description` | String |  |  |  |
| `keyHash` | String | * | UK |  |
| `status` | String | * |  |  |
| `ownerUserId` | Int |  |  |  |
| `expiresAt` | DateTime |  |  |  |
| `lastUsedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-113 OpenApiClientScopeGrant](#openapiclientscopegrant), [1-114 OpenApiAccessLog](#openapiaccesslog)

### 1-111 OpenApiResource

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `key` | String | * | UK |  |
| `label` | String | * |  |  |
| `registrationKey` | String | * |  |  |
| `runtimeParentResourceKey` | String |  |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-112 OpenApiScope](#openapiscope)

### 1-112 OpenApiScope

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `key` | String | * | UK |  |
| `label` | String | * |  |  |
| `action` | String | * |  |  |
| `resourceId` | Int | * | FK | → OpenApiResource.id |
| `registrationKey` | String | * |  |  |
| `runtimeParentResourceKey` | String |  |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-111 OpenApiResource](#openapiresource)

← Referenced by: [1-113 OpenApiClientScopeGrant](#openapiclientscopegrant)

### 1-113 OpenApiClientScopeGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `clientId` | Int | * | cUK+FK | → OpenApiClient.id |
| `scopeId` | Int | * | cUK+FK | → OpenApiScope.id |
| `action` | String | * | cUK |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-110 OpenApiClient](#openapiclient), [1-112 OpenApiScope](#openapiscope)

### 1-114 OpenApiAccessLog

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `clientId` | Int |  | FK | → OpenApiClient.id |
| `clientName` | String |  |  |  |
| `endpointKey` | String | * |  |  |
| `scopeKey` | String | * |  |  |
| `method` | String | * |  |  |
| `path` | String | * |  |  |
| `status` | Int | * |  |  |
| `durationMs` | Int | * |  |  |
| `errorCode` | String |  |  |  |
| `ip` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-110 OpenApiClient](#openapiclient)

### 1-115 SystemConfig

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `key` | String | * |  |  |
| `value` | String | * |  |  |

### 1-116 LoginAttempt

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `username` | String | * |  |  |
| `ip` | String | * |  |  |
| `success` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-117 DepartmentCollaboration

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `title` | String | * |  |  |
| `description` | String | * |  |  |
| `collaborationType` | String | * |  |  |
| `triggerRule` | String | * |  |  |
| `scopeDescription` | String | * |  |  |
| `inputRequirement` | String | * |  |  |
| `deliverable` | String | * |  |  |
| `acceptanceCriteria` | String | * |  |  |
| `responseTargetHours` | Int |  |  |  |
| `deliveryTargetDays` | Int |  |  |  |
| `effectiveFrom` | DateTime |  |  |  |
| `effectiveTo` | DateTime |  |  |  |
| `escalationPolicy` | String | * |  |  |
| `responsibleDepartmentId` | Int | * | FK | → Department.id |
| `status` | String | * |  |  |
| `isArchived` | Boolean | * |  |  |
| `createdByUserId` | Int |  | FK | → User.id |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-66 Department](#department), [1-6 User](#user)

← Referenced by: [1-118 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-119 DepartmentCollaborationPosition](#departmentcollaborationposition), [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem)

### 1-118 DepartmentCollaborationDepartment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `collaborationId` | Int | * | cUK+FK | → DepartmentCollaboration.id |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `responseStatus` | String | * |  |  |
| `responseNote` | String | * |  |  |
| `respondedByUserId` | Int |  | FK | → User.id |
| `respondedAt` | DateTime |  |  |  |
| `invitedAt` | DateTime | * |  |  |

→ Depends on: [1-117 DepartmentCollaboration](#departmentcollaboration), [1-66 Department](#department), [1-6 User](#user)

### 1-119 DepartmentCollaborationPosition

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `collaborationId` | Int | * | cUK+FK | → DepartmentCollaboration.id |
| `kind` | String | * | cUK |  |
| `positionId` | Int | * | cUK+FK | → Position.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-117 DepartmentCollaboration](#departmentcollaboration), [1-68 Position](#position)

### 1-120 MeetingType

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `key` | String | * | UK |  |
| `name` | String | * |  |  |
| `description` | String | * |  |  |
| `defaultVisibility` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-121 MeetingSeries](#meetingseries), [1-122 Meeting](#meeting)

### 1-121 MeetingSeries

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `typeId` | Int | * | FK | → MeetingType.id |
| `title` | String | * |  |  |
| `description` | String | * |  |  |
| `cadence` | String |  |  |  |
| `defaultVisibility` | String | * |  |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-120 MeetingType](#meetingtype)

← Referenced by: [1-122 Meeting](#meeting)

### 1-122 Meeting

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `typeId` | Int | * | FK | → MeetingType.id |
| `seriesId` | Int |  | FK | → MeetingSeries.id |
| `title` | String | * |  |  |
| `description` | String | * |  |  |
| `startAt` | DateTime |  |  |  |
| `endAt` | DateTime |  |  |  |
| `location` | String | * |  |  |
| `visibility` | String | * |  |  |
| `status` | String | * |  |  |
| `ownerUserId` | Int |  | FK | → User.id |
| `secretaryUserId` | Int |  | FK | → User.id |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-120 MeetingType](#meetingtype), [1-121 MeetingSeries](#meetingseries), [1-6 User](#user), [1-6 User](#user)

← Referenced by: [1-123 MeetingParticipant](#meetingparticipant), [1-124 MeetingAgendaItem](#meetingagendaitem), [1-125 MeetingMinuteEntry](#meetingminuteentry), [1-126 MeetingProposal](#meetingproposal), [1-128 MeetingDecision](#meetingdecision), [1-129 MeetingActionCandidate](#meetingactioncandidate), [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem)

### 1-123 MeetingParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `meetingId` | Int | * | cUK+FK | → Meeting.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `role` | String | * |  |  |
| `canVote` | Boolean | * |  |  |
| `attendanceStatus` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-122 Meeting](#meeting), [1-6 User](#user)

### 1-124 MeetingAgendaItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `meetingId` | Int | * | FK | → Meeting.id |
| `title` | String | * |  |  |
| `description` | String | * |  |  |
| `presenterUserId` | Int |  |  |  |
| `sortOrder` | Int | * |  |  |
| `status` | String | * |  |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-122 Meeting](#meeting)

← Referenced by: [1-125 MeetingMinuteEntry](#meetingminuteentry), [1-126 MeetingProposal](#meetingproposal), [1-128 MeetingDecision](#meetingdecision), [1-129 MeetingActionCandidate](#meetingactioncandidate)

### 1-125 MeetingMinuteEntry

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `meetingId` | Int | * | FK | → Meeting.id |
| `agendaItemId` | Int |  | FK | → MeetingAgendaItem.id |
| `content` | String | * |  |  |
| `kind` | String | * |  |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-122 Meeting](#meeting), [1-124 MeetingAgendaItem](#meetingagendaitem)

### 1-126 MeetingProposal

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `meetingId` | Int | * | FK | → Meeting.id |
| `agendaItemId` | Int |  | FK | → MeetingAgendaItem.id |
| `title` | String | * |  |  |
| `content` | String | * |  |  |
| `status` | String | * |  |  |
| `voteVisibility` | String | * |  |  |
| `minVotesRequired` | Int |  |  |  |
| `createdBy` | Int |  |  |  |
| `closedBy` | Int |  |  |  |
| `closedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-122 Meeting](#meeting), [1-124 MeetingAgendaItem](#meetingagendaitem)

← Referenced by: [1-127 MeetingVote](#meetingvote), [1-128 MeetingDecision](#meetingdecision)

### 1-127 MeetingVote

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `proposalId` | Int | * | cUK+FK | → MeetingProposal.id |
| `voterUserId` | Int | * | cUK+FK | → User.id |
| `choice` | String | * |  |  |
| `note` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-126 MeetingProposal](#meetingproposal), [1-6 User](#user)

### 1-128 MeetingDecision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `meetingId` | Int | * | FK | → Meeting.id |
| `agendaItemId` | Int |  | FK | → MeetingAgendaItem.id |
| `proposalId` | Int |  | FK | → MeetingProposal.id |
| `kind` | String | * |  |  |
| `title` | String | * |  |  |
| `content` | String | * |  |  |
| `status` | String | * |  |  |
| `effectiveDate` | DateTime |  |  |  |
| `decidedAt` | DateTime | * |  |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-122 Meeting](#meeting), [1-124 MeetingAgendaItem](#meetingagendaitem), [1-126 MeetingProposal](#meetingproposal)

← Referenced by: [1-129 MeetingActionCandidate](#meetingactioncandidate), [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem)

### 1-129 MeetingActionCandidate

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `meetingId` | Int | * | FK | → Meeting.id |
| `agendaItemId` | Int |  | FK | → MeetingAgendaItem.id |
| `decisionId` | Int |  | FK | → MeetingDecision.id |
| `title` | String | * |  |  |
| `description` | String | * |  |  |
| `targetKind` | String | * |  |  |
| `status` | String | * |  |  |
| `linkedWorkItemId` | Int |  | FK | → WorkItem.id |
| `linkedWorkPlanId` | Int |  | FK | → WorkPlan.id |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-122 Meeting](#meeting), [1-124 MeetingAgendaItem](#meetingagendaitem), [1-128 MeetingDecision](#meetingdecision), [1-145 WorkItem](#workitem), [1-144 WorkPlan](#workplan)

← Referenced by: [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem)

### 1-130 WorkPlanAlignment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `childPlanId` | Int | * | FK | → WorkPlan.id |
| `sourceType` | String | * |  |  |
| `sourcePlanId` | Int |  | FK | → WorkPlan.id |
| `sourceWorkItemId` | Int |  | FK | → WorkItem.id |
| `relationKind` | String | * |  |  |
| `note` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-144 WorkPlan](#workplan), [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem)

### 1-131 WorkOkrCycle

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `periodType` | String | * |  |  |
| `code` | String | * | UK |  |
| `label` | String | * |  |  |
| `year` | Int | * |  |  |
| `sequence` | Int | * |  |  |
| `parentId` | Int |  | FK | → WorkOkrCycle.id |
| `startDate` | DateTime | * |  |  |
| `endDate` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-131 WorkOkrCycle](#workokrcycle)

← Referenced by: [1-132 WorkOkrControlPolicy](#workokrcontrolpolicy), [1-144 WorkPlan](#workplan)

### 1-132 WorkOkrControlPolicy

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `cycleId` | Int | * | cUK+FK | → WorkOkrCycle.id |
| `scopeType` | String | * | cUK |  |
| `scopeId` | String | * | cUK |  |
| `isLocked` | Boolean | * |  |  |
| `objectiveSubmitDeadline` | DateTime |  |  |  |
| `krReviewOpensAt` | DateTime |  |  |  |
| `krSubmitDeadline` | DateTime |  |  |  |
| `createdByUserId` | Int |  |  |  |
| `updatedByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-131 WorkOkrCycle](#workokrcycle)

### 1-133 Project

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String |  | UK |  |
| `name` | String | * |  |  |
| `description` | String |  |  |  |
| `projectType` | String | * |  |  |
| `projectLevel` | String | * |  |  |
| `plan` | String |  |  |  |
| `goal` | String |  |  |  |
| `milestones` | String |  |  |  |
| `budgetAmount` | Float |  |  |  |
| `budgetNote` | String |  |  |  |
| `riskNote` | String |  |  |  |
| `remark` | String |  |  |  |
| `status` | String | * |  |  |
| `plannedStartDate` | DateTime |  |  |  |
| `plannedEndDate` | DateTime |  |  |  |
| `actualStartDate` | DateTime |  |  |  |
| `actualEndDate` | DateTime |  |  |  |
| `completionPercent` | Float |  |  |  |
| `closureType` | String |  |  |  |
| `leadingDepartmentId` | Int |  | FK | → Department.id |
| `owningDepartmentId` | Int |  | FK | → Department.id |
| `workspaceEnabled` | Boolean | * |  |  |
| `isArchived` | Boolean | * |  |  |
| `archivedAt` | DateTime |  |  |  |
| `createdBy` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-66 Department](#department), [1-66 Department](#department)

← Referenced by: [1-134 ProjectEnablingDepartment](#projectenablingdepartment), [1-135 EmployeeProject](#employeeproject), [1-136 ProjectPlanPhase](#projectplanphase), [1-137 ProjectPlanDependency](#projectplandependency), [1-138 ProjectPlanBaseline](#projectplanbaseline), [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem), [1-149 ProjectWorkAssignee](#projectworkassignee)

### 1-134 ProjectEnablingDepartment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-133 Project](#project), [1-66 Department](#department)

### 1-135 EmployeeProject

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `employeeId` | Int | * | cUK+FK | → Employee.id |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `role` | String |  |  |  |
| `startDate` | String |  |  |  |
| `endDate` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-133 Project](#project), [1-62 Employee](#employee)

### 1-136 ProjectPlanPhase

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `sequenceNo` | Int | * | cUK |  |
| `name` | String | * |  |  |
| `plannedStartDate` | DateTime |  |  |  |
| `plannedEndDate` | DateTime |  |  |  |
| `note` | String |  |  |  |
| `createdBy` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-133 Project](#project)

← Referenced by: [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem)

### 1-137 ProjectPlanDependency

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `predecessorKind` | String | * | cUK |  |
| `predecessorId` | Int | * | cUK |  |
| `successorKind` | String | * | cUK |  |
| `successorId` | Int | * | cUK |  |
| `dependencyType` | String | * |  |  |
| `lagDays` | Int | * |  |  |
| `createdBy` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-133 Project](#project)

### 1-138 ProjectPlanBaseline

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `projectId` | Int | * | FK | → Project.id |
| `name` | String | * |  |  |
| `note` | String |  |  |  |
| `isActive` | Boolean | * |  |  |
| `createdBy` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-133 Project](#project)

← Referenced by: [1-139 ProjectPlanBaselineItem](#projectplanbaselineitem)

### 1-139 ProjectPlanBaselineItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `baselineId` | Int | * | cUK+FK | → ProjectPlanBaseline.id |
| `itemKind` | String | * | cUK |  |
| `itemId` | Int | * | cUK |  |
| `parentKind` | String |  |  |  |
| `parentId` | Int |  |  |  |
| `phaseId` | Int |  |  |  |
| `name` | String | * |  |  |
| `status` | String |  |  |  |
| `isMilestone` | Boolean | * |  |  |
| `plannedStartDate` | DateTime |  |  |  |
| `plannedEndDate` | DateTime |  |  |  |

→ Depends on: [1-138 ProjectPlanBaseline](#projectplanbaseline)

### 1-140 WorkReport

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `targetType` | String | * | cUK |  |
| `targetId` | Int | * | cUK |  |
| `periodType` | String | * | cUK |  |
| `reportStage` | String | * | cUK |  |
| `periodStart` | DateTime | * | cUK |  |
| `periodEnd` | DateTime | * |  |  |
| `submittedBy` | Int | * | FK | → User.id |
| `submittedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-141 WorkReportItem](#workreportitem)

### 1-141 WorkReportItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `reportId` | Int | * | FK | → WorkReport.id |
| `workPlanId` | Int |  | FK | → WorkPlan.id |
| `workItemId` | Int |  | FK | → WorkItem.id |
| `title` | String | * |  |  |
| `workPlanTitleSnapshot` | String | * |  |  |
| `workPlanKindSnapshot` | String | * |  |  |
| `workItemTypeSnapshot` | String | * |  |  |
| `parentWorkItemIdSnapshot` | Int |  |  |  |
| `parentTitleSnapshot` | String | * |  |  |
| `objectiveTitleSnapshot` | String | * |  |  |
| `keyResultTitleSnapshot` | String | * |  |  |
| `reportItemKindSnapshot` | String | * |  |  |
| `workItemStatusSnapshot` | String | * |  |  |
| `snapshotPlannedStartDate` | DateTime |  |  |  |
| `snapshotPlannedEndDate` | DateTime |  |  |  |
| `snapshotActualEndDate` | DateTime |  |  |  |
| `snapshotCompletedAt` | DateTime |  |  |  |
| `previousPlanSnapshot` | String | * |  |  |
| `doneThisWeek` | String | * |  |  |
| `planNextWeek` | String | * |  |  |
| `note` | String | * |  |  |
| `selfScore` | Int |  |  |  |
| `performanceScore` | Int |  |  |  |
| `sortOrder` | Int | * |  |  |

→ Depends on: [1-140 WorkReport](#workreport), [1-144 WorkPlan](#workplan), [1-145 WorkItem](#workitem)

### 1-142 PositionResponsibilityNode

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `positionDescriptionId` | Int | * | FK | → PositionDescription.id |
| `parentId` | Int |  | FK | → PositionResponsibilityNode.id |
| `nodeKey` | String | * | UK |  |
| `nodeType` | String | * |  |  |
| `title` | String | * |  |  |
| `content` | String | * |  |  |
| `pathLabel` | String | * |  |  |
| `sourcePath` | String | * |  |  |
| `sourceHash` | String | * |  |  |
| `descriptionVersion` | String |  |  |  |
| `descriptionUpdatedAt` | DateTime |  |  |  |
| `sortOrder` | Int | * |  |  |
| `isActive` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-60 PositionDescription](#positiondescription), [1-142 PositionResponsibilityNode](#positionresponsibilitynode)

← Referenced by: [1-143 WorkResponsibilityReference](#workresponsibilityreference)

### 1-143 WorkResponsibilityReference

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `targetKind` | String | * |  |  |
| `referenceRole` | String | * |  |  |
| `workItemId` | Int | * | FK | → WorkItem.id |
| `responsibilityNodeId` | Int |  | FK | → PositionResponsibilityNode.id |
| `lockedEmployeeId` | Int | * |  |  |
| `lockedPositionId` | Int |  |  |  |
| `lockedEmployeePositionId` | Int |  |  |  |
| `positionDescriptionId` | Int | * |  |  |
| `positionDescriptionVersionSnapshot` | String |  |  |  |
| `positionDescriptionUpdatedAtSnapshot` | DateTime |  |  |  |
| `nodeKeySnapshot` | String | * |  |  |
| `nodeTypeSnapshot` | String | * |  |  |
| `parentNodeKeySnapshot` | String |  |  |  |
| `pathLabelSnapshot` | String | * |  |  |
| `titleSnapshot` | String | * |  |  |
| `contentSnapshot` | String | * |  |  |
| `snapshotJson` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-145 WorkItem](#workitem), [1-142 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-144 WorkPlan

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `targetType` | String | * |  |  |
| `targetId` | Int | * |  |  |
| `kind` | String | * |  |  |
| `title` | String | * |  |  |
| `description` | String | * |  |  |
| `status` | String | * |  |  |
| `isArchived` | Boolean | * |  |  |
| `okrStage` | String | * |  |  |
| `objectiveSubmittedAt` | DateTime |  |  |  |
| `objectiveApprovedAt` | DateTime |  |  |  |
| `objectiveApprovedByUserId` | Int |  |  |  |
| `krReviewOpensAt` | DateTime |  |  |  |
| `krSubmittedAt` | DateTime |  |  |  |
| `krApprovedAt` | DateTime |  |  |  |
| `krApprovedByUserId` | Int |  |  |  |
| `ownerEmployeeId` | Int |  | FK | → Employee.id |
| `collaborationId` | Int |  | FK | → DepartmentCollaboration.id |
| `okrCycleId` | Int |  | FK | → WorkOkrCycle.id |
| `sourcePlanId` | Int |  | FK | → WorkPlan.id |
| `parentPeriodPlanId` | Int |  | FK | → WorkPlan.id |
| `previousPeriodPlanId` | Int |  | FK | → WorkPlan.id |
| `okrControlScopeType` | String |  |  |  |
| `okrControlScopeId` | String |  |  |  |
| `objectiveApprovalSnapshotJson` | String | * |  |  |
| `krApprovalSnapshotJson` | String | * |  |  |
| `periodType` | String |  |  |  |
| `actualStartDate` | DateTime |  |  |  |
| `actualEndDate` | DateTime |  |  |  |
| `plannedStartDate` | DateTime |  |  |  |
| `plannedEndDate` | DateTime |  |  |  |
| `sourceType` | String | * |  |  |
| `sourceKind` | String |  |  |  |
| `sourceMeetingId` | Int |  | FK | → Meeting.id |
| `sourceMeetingDecisionId` | Int |  | FK | → MeetingDecision.id |
| `sourceMeetingActionCandidateId` | Int |  | FK | → MeetingActionCandidate.id |
| `sourceDepartmentId` | Int |  | FK | → Department.id |
| `linkedProjectId` | Int |  | FK | → Project.id |
| `linkedProjectPhaseId` | Int |  | FK | → ProjectPlanPhase.id |
| `isSystemGenerated` | Boolean | * |  |  |
| `isMilestone` | Boolean | * |  |  |
| `milestoneDate` | DateTime |  |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-62 Employee](#employee), [1-117 DepartmentCollaboration](#departmentcollaboration), [1-131 WorkOkrCycle](#workokrcycle), [1-144 WorkPlan](#workplan), [1-144 WorkPlan](#workplan), [1-144 WorkPlan](#workplan), [1-133 Project](#project), [1-136 ProjectPlanPhase](#projectplanphase), [1-122 Meeting](#meeting), [1-128 MeetingDecision](#meetingdecision), [1-129 MeetingActionCandidate](#meetingactioncandidate), [1-66 Department](#department)

← Referenced by: [1-129 MeetingActionCandidate](#meetingactioncandidate), [1-130 WorkPlanAlignment](#workplanalignment), [1-130 WorkPlanAlignment](#workplanalignment), [1-141 WorkReportItem](#workreportitem), [1-145 WorkItem](#workitem)

### 1-145 WorkItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `planId` | Int |  | FK | → WorkPlan.id |
| `targetType` | String | * |  |  |
| `targetId` | Int |  |  |  |
| `category` | String | * |  |  |
| `itemType` | String | * |  |  |
| `content` | String | * |  |  |
| `description` | String | * |  |  |
| `importance` | Int | * |  |  |
| `urgency` | Int | * |  |  |
| `status` | String |  |  |  |
| `completedAt` | DateTime |  |  |  |
| `krStartValue` | Float |  |  |  |
| `krTargetValue` | Float |  |  |  |
| `krCurrentValue` | Float |  |  |  |
| `krUnit` | String |  |  |  |
| `routineTaskType` | String |  |  |  |
| `routineRecurrenceType` | String |  |  |  |
| `routineRecurrenceTime` | String |  |  |  |
| `routineRecurrenceWeekday` | Int |  |  |  |
| `routineRecurrenceMonthDay` | Int |  |  |  |
| `routineRecurrenceQuarterDay` | Int |  |  |  |
| `routineRecurrenceYearMonth` | Int |  |  |  |
| `routineRecurrenceYearDay` | Int |  |  |  |
| `ownerEmployeeId` | Int |  | FK | → Employee.id |
| `collaborationId` | Int |  | FK | → DepartmentCollaboration.id |
| `actualStartDate` | DateTime |  |  |  |
| `actualEndDate` | DateTime |  |  |  |
| `plannedStartDate` | DateTime |  |  |  |
| `plannedEndDate` | DateTime |  |  |  |
| `isMilestone` | Boolean | * |  |  |
| `milestoneDate` | DateTime |  |  |  |
| `periodType` | String |  |  |  |
| `periodStart` | DateTime |  |  |  |
| `periodEnd` | DateTime |  |  |  |
| `sourceType` | String | * |  |  |
| `sourceKind` | String |  |  |  |
| `sourceMeetingId` | Int |  | FK | → Meeting.id |
| `sourceMeetingDecisionId` | Int |  | FK | → MeetingDecision.id |
| `sourceMeetingActionCandidateId` | Int |  | FK | → MeetingActionCandidate.id |
| `sourceDepartmentId` | Int |  | FK | → Department.id |
| `linkedProjectId` | Int |  | FK | → Project.id |
| `linkedProjectPhaseId` | Int |  | FK | → ProjectPlanPhase.id |
| `parentWorkItemId` | Int |  | FK | → WorkItem.id |
| `parentPeriodWorkItemId` | Int |  | FK | → WorkItem.id |
| `previousPeriodWorkItemId` | Int |  | FK | → WorkItem.id |
| `isArchived` | Boolean | * |  |  |
| `isPrivate` | Boolean | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-144 WorkPlan](#workplan), [1-62 Employee](#employee), [1-117 DepartmentCollaboration](#departmentcollaboration), [1-133 Project](#project), [1-136 ProjectPlanPhase](#projectplanphase), [1-122 Meeting](#meeting), [1-128 MeetingDecision](#meetingdecision), [1-129 MeetingActionCandidate](#meetingactioncandidate), [1-66 Department](#department), [1-145 WorkItem](#workitem), [1-145 WorkItem](#workitem), [1-145 WorkItem](#workitem)

← Referenced by: [1-129 MeetingActionCandidate](#meetingactioncandidate), [1-130 WorkPlanAlignment](#workplanalignment), [1-141 WorkReportItem](#workreportitem), [1-143 WorkResponsibilityReference](#workresponsibilityreference), [1-146 WorkKrEvidence](#workkrevidence), [1-146 WorkKrEvidence](#workkrevidence), [1-147 WorkParticipant](#workparticipant)

### 1-146 WorkKrEvidence

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `krWorkItemId` | Int | * | cUK+FK | → WorkItem.id |
| `taskWorkItemId` | Int | * | cUK+FK | → WorkItem.id |
| `note` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-145 WorkItem](#workitem), [1-145 WorkItem](#workitem)

### 1-147 WorkParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `workItemId` | Int | * | FK | → WorkItem.id |
| `name` | String | * |  |  |
| `wxUserId` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-145 WorkItem](#workitem)

### 1-148 DepartmentWorkAssignee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `kind` | String | * | cUK | "task" |

→ Depends on: [1-66 Department](#department), [1-6 User](#user)

### 1-149 ProjectWorkAssignee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `kind` | String | * | cUK | "task" |

→ Depends on: [1-133 Project](#project), [1-6 User](#user)
