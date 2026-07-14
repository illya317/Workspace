# HR Database Schema (122 tables)

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

← Referenced by: [1-3 ApprovalRequest](#approvalrequest), [1-3 ApprovalRequest](#approvalrequest), [1-4 ApprovalEvent](#approvalevent), [1-9 UserResourceActionGrant](#userresourceactiongrant), [1-12 PermissionGrantLedgerEvent](#permissiongrantledgerevent), [1-13 Notification](#notification), [1-13 Notification](#notification), [1-14 Contract](#contract), [1-27 FinanceAccount](#financeaccount), [1-29 FinanceVoucher](#financevoucher), [1-31 FinanceLedgerImport](#financeledgerimport), [1-33 FinanceBalanceSnapshot](#financebalancesnapshot), [1-33 FinanceBalanceSnapshot](#financebalancesnapshot), [1-35 FinanceReclassRule](#financereclassrule), [1-38 ReclassResult](#reclassresult), [1-41 FinanceStatementWorkpaper](#financestatementworkpaper), [1-46 Employee](#employee), [1-55 EditHistory](#edithistory), [1-56 StockRawMaterial](#stockrawmaterial), [1-57 StockPackaging](#stockpackaging), [1-58 StockFinishedGoods](#stockfinishedgoods), [1-60 StockOperation](#stockoperation), [1-62 LibraryTagCandidate](#librarytagcandidate), [1-64 LibraryMetadataCandidate](#librarymetadatacandidate), [1-65 LibraryEvaluationCase](#libraryevaluationcase), [1-65 LibraryEvaluationCase](#libraryevaluationcase), [1-71 LibraryExportJob](#libraryexportjob), [1-72 LibraryDocument](#librarydocument), [1-72 LibraryDocument](#librarydocument), [1-72 LibraryDocument](#librarydocument), [1-73 LibraryDocumentVersion](#librarydocumentversion), [1-82 LibraryDocumentTag](#librarydocumenttag), [1-90 DepartmentCollaboration](#departmentcollaboration), [1-91 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-95 Meeting](#meeting), [1-95 Meeting](#meeting), [1-96 MeetingParticipant](#meetingparticipant), [1-100 MeetingVote](#meetingvote), [1-113 WorkReport](#workreport), [1-121 DepartmentWorkAssignee](#departmentworkassignee), [1-122 ProjectWorkAssignee](#projectworkassignee)

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

→ Depends on: [1-7 Resource](#resource), [1-52 Position](#position)

### 1-11 DepartmentResourceActionGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `resourceId` | Int | * | cUK+FK | → Resource.id |
| `actionKey` | String | * | cUK |  |
| `scopeId` | String |  | cUK |  |

→ Depends on: [1-7 Resource](#resource), [1-50 Department](#department)

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
| `id` | Int | * | PK |  |
| `category` | String | * | cUK |  |
| `subjectType` | String | * |  |  |
| `code` | String | * | cUK |  |
| `name` | String | * |  |  |
| `fullName` | String |  |  |  |
| `classification` | String |  |  |  |
| `identityNumber` | String |  |  |  |
| `legalRepresentative` | String |  |  |  |
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
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-18 FinanceBudgetVersion

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

← Referenced by: [1-19 FinanceBudgetDept](#financebudgetdept), [1-20 FinanceBudgetRd](#financebudgetrd)

### 1-19 FinanceBudgetDept

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

→ Depends on: [1-18 FinanceBudgetVersion](#financebudgetversion), [1-27 FinanceAccount](#financeaccount)

### 1-20 FinanceBudgetRd

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

→ Depends on: [1-18 FinanceBudgetVersion](#financebudgetversion), [1-27 FinanceAccount](#financeaccount)

### 1-21 FinanceDataImport

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

← Referenced by: [1-22 FinanceShipment](#financeshipment), [1-23 FinanceSalesSalary](#financesalessalary), [1-24 FinanceCostStructureRow](#financecoststructurerow), [1-25 FinanceCostAnalysisRow](#financecostanalysisrow), [1-26 FinanceWorkshopReport](#financeworkshopreport)

### 1-22 FinanceShipment

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

→ Depends on: [1-46 Employee](#employee), [1-21 FinanceDataImport](#financedataimport)

### 1-23 FinanceSalesSalary

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

→ Depends on: [1-46 Employee](#employee), [1-21 FinanceDataImport](#financedataimport)

### 1-24 FinanceCostStructureRow

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

→ Depends on: [1-21 FinanceDataImport](#financedataimport)

### 1-25 FinanceCostAnalysisRow

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

→ Depends on: [1-21 FinanceDataImport](#financedataimport)

### 1-26 FinanceWorkshopReport

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

→ Depends on: [1-52 Position](#position), [1-46 Employee](#employee), [1-21 FinanceDataImport](#financedataimport)

### 1-27 FinanceAccount

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
| `groupSubjectCode` | String |  |  |  |
| `subjectLevel` | Int |  |  |  |
| `year` | Int |  | cUK |  |
| `sortOrder` | Int | * |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-27 FinanceAccount](#financeaccount)

← Referenced by: [1-19 FinanceBudgetDept](#financebudgetdept), [1-20 FinanceBudgetRd](#financebudgetrd), [1-30 FinanceVoucherItem](#financevoucheritem), [1-32 FinanceAccountBalance](#financeaccountbalance), [1-34 FinanceBalanceSnapshotRow](#financebalancesnapshotrow)

### 1-28 FinancePeriod

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `year` | Int | * | cUK |  |
| `month` | Int | * | cUK |  |
| `startDate` | String | * |  |  |
| `endDate` | String | * |  |  |
| `isClosed` | Boolean | * |  |  |
| `companyCode` | String | * | cUK |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-29 FinanceVoucher](#financevoucher), [1-32 FinanceAccountBalance](#financeaccountbalance), [1-38 ReclassResult](#reclassresult)

### 1-29 FinanceVoucher

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
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-28 FinancePeriod](#financeperiod)

← Referenced by: [1-30 FinanceVoucherItem](#financevoucheritem)

### 1-30 FinanceVoucherItem

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
| `importId` | Int |  | FK | → FinanceLedgerImport.id |

→ Depends on: [1-27 FinanceAccount](#financeaccount), [1-29 FinanceVoucher](#financevoucher), [1-31 FinanceLedgerImport](#financeledgerimport)

← Referenced by: [1-38 ReclassResult](#reclassresult)

### 1-31 FinanceLedgerImport

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `type` | String | * |  | account | voucher | balance |
| `companyCode` | String | * |  |  |
| `year` | Int | * |  |  |
| `sourceFile` | String |  |  |  |
| `sourcePath` | String |  |  |  |
| `checksum` | String |  |  |  |
| `status` | String | * |  | completed | partial | failed |
| `rowCount` | Int | * |  |  |
| `createdCount` | Int | * |  |  |
| `updatedCount` | Int | * |  |  |
| `skippedCount` | Int | * |  |  |
| `deletedCount` | Int | * |  |  |
| `conflictCount` | Int | * |  |  |
| `blockedCount` | Int | * |  |  |
| `warnings` | String |  |  | JSON array of warning messages |
| `importedBy` | Int |  | FK | → User.id |
| `importedAt` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-30 FinanceVoucherItem](#financevoucheritem)

### 1-32 FinanceAccountBalance

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

→ Depends on: [1-28 FinancePeriod](#financeperiod), [1-27 FinanceAccount](#financeaccount)

### 1-33 FinanceBalanceSnapshot

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

← Referenced by: [1-34 FinanceBalanceSnapshotRow](#financebalancesnapshotrow)

### 1-34 FinanceBalanceSnapshotRow

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

→ Depends on: [1-33 FinanceBalanceSnapshot](#financebalancesnapshot), [1-27 FinanceAccount](#financeaccount)

### 1-35 FinanceReclassRule

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `year` | Int | * | cUK |  |
| `sourceAccountCode` | String | * | cUK |  |
| `abnormalSide` | String | * | cUK | debit | credit | both |
| `targetAccountCode` | String | * |  |  |
| `enabled` | Boolean | * |  |  |
| `source` | String | * |  | suggested | manual | auto | copied |
| `confirmedBy` | Int |  | FK | → User.id |
| `confirmedAt` | DateTime |  |  |  |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-38 ReclassResult](#reclassresult)

### 1-36 FinanceReclassItemRule

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

### 1-37 FinanceBalanceReclassAdjustment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `periodId` | Int | * | cUK |  |
| `companyCode` | String | * |  |  |
| `year` | Int | * |  |  |
| `sourceAccountCode` | String | * | cUK |  |
| `targetAccountCode` | String | * |  |  |
| `amount` | Float | * |  |  |
| `sourceType` | String | * |  | balance_residual | manual |
| `ruleId` | Int |  |  |  |
| `status` | String | * |  | approved | adjusted | rejected |
| `note` | String |  |  |  |
| `adjustedBy` | Int |  |  |  |
| `adjustedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-38 ReclassResult

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

→ Depends on: [1-28 FinancePeriod](#financeperiod), [1-30 FinanceVoucherItem](#financevoucheritem), [1-35 FinanceReclassRule](#financereclassrule), [1-6 User](#user)

### 1-39 FinanceStatementAccountMapping

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `year` | Int | * | cUK |  |
| `statementType` | String | * | cUK | balance | income | cashflow |
| `lineCode` | String | * |  | 报表项目 lineCode |
| `accountCode` | String | * | cUK | 科目编码 |
| `includeChildren` | Boolean | * |  |  |
| `operator` | String | * |  | add | subtract |
| `source` | String | * |  | default | manual | copied | migrated |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-40 FinanceStatementLineConfig

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyCode` | String | * | cUK |  |
| `year` | Int | * | cUK |  |
| `reportType` | String | * | cUK | balanceSheet | incomeStatement | cashFlow |
| `lineCode` | String | * | cUK | unique line identifier |
| `label` | String | * |  | display label |
| `displayCode` | String | * |  | display code hint |
| `section` | String | * |  | currentAssets | nonCurrentAssets | currentLiabilities | nonCurrentLiabilities | equity |
| `side` | String | * |  | debit | credit |
| `sortOrder` | Int | * |  |  |
| `prefixesJson` | String | * |  | JSON array of account code prefixes |
| `subtractPrefixesJson` | String | * |  | JSON array of subtract prefixes (e.g. accumulated depreciation) |
| `formulaJson` | String | * |  |  |
| `reclassSource` | Boolean | * |  |  |
| `reclassTarget` | Boolean | * |  |  |
| `isHeader` | Boolean | * |  |  |
| `isTotal` | Boolean | * |  |  |
| `isGrandTotal` | Boolean | * |  |  |
| `enabled` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-41 FinanceStatementWorkpaper

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `year` | Int | * | cUK |  |
| `month` | Int | * | cUK |  |
| `reportType` | String | * | cUK | incomeStatement | cashFlow |
| `status` | String | * |  | draft | submitted |
| `note` | String |  |  |  |
| `updatedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-42 FinanceStatementWorkpaperLine](#financestatementworkpaperline)

### 1-42 FinanceStatementWorkpaperLine

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

→ Depends on: [1-41 FinanceStatementWorkpaper](#financestatementworkpaper)

### 1-43 DepartmentDescription

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

→ Depends on: [1-50 Department](#department)

### 1-44 PositionDescription

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

← Referenced by: [1-52 Position](#position), [1-115 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-45 HrPerformanceReview

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

→ Depends on: [1-46 Employee](#employee)

### 1-46 Employee

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

← Referenced by: [1-22 FinanceShipment](#financeshipment), [1-23 FinanceSalesSalary](#financesalessalary), [1-26 FinanceWorkshopReport](#financeworkshopreport), [1-45 HrPerformanceReview](#hrperformancereview), [1-47 Employment](#employment), [1-51 DepartmentManagerEmployee](#departmentmanageremployee), [1-53 EDP](#edp), [1-108 EmployeeProject](#employeeproject), [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem)

### 1-47 Employment

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

→ Depends on: [1-46 Employee](#employee)

### 1-48 Company

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

← Referenced by: [1-49 CompanyRelation](#companyrelation), [1-49 CompanyRelation](#companyrelation), [1-53 EDP](#edp), [1-54 PositionReportOverride](#positionreportoverride)

### 1-49 CompanyRelation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `parentId` | Int | * | cUK+FK | → Company.id |
| `childId` | Int | * | cUK+FK | → Company.id |
| `shareRatio` | Float |  |  |  |
| `isConsolidated` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-48 Company](#company), [1-48 Company](#company)

### 1-50 Department

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

→ Depends on: [1-52 Position](#position), [1-50 Department](#department)

← Referenced by: [1-11 DepartmentResourceActionGrant](#departmentresourceactiongrant), [1-43 DepartmentDescription](#departmentdescription), [1-51 DepartmentManagerEmployee](#departmentmanageremployee), [1-52 Position](#position), [1-53 EDP](#edp), [1-54 PositionReportOverride](#positionreportoverride), [1-90 DepartmentCollaboration](#departmentcollaboration), [1-91 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-106 Project](#project), [1-106 Project](#project), [1-107 ProjectEnablingDepartment](#projectenablingdepartment), [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem), [1-121 DepartmentWorkAssignee](#departmentworkassignee)

### 1-51 DepartmentManagerEmployee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `employeeId` | Int | * | cUK+FK | → Employee.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-50 Department](#department), [1-46 Employee](#employee)

### 1-52 Position

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

→ Depends on: [1-44 PositionDescription](#positiondescription), [1-52 Position](#position), [1-50 Department](#department)

← Referenced by: [1-10 PositionResourceActionGrant](#positionresourceactiongrant), [1-26 FinanceWorkshopReport](#financeworkshopreport), [1-50 Department](#department), [1-53 EDP](#edp), [1-54 PositionReportOverride](#positionreportoverride), [1-54 PositionReportOverride](#positionreportoverride), [1-92 DepartmentCollaborationPosition](#departmentcollaborationposition)

### 1-53 EDP

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

→ Depends on: [1-52 Position](#position), [1-50 Department](#department), [1-48 Company](#company), [1-54 PositionReportOverride](#positionreportoverride), [1-46 Employee](#employee)

### 1-54 PositionReportOverride

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

→ Depends on: [1-52 Position](#position), [1-48 Company](#company), [1-50 Department](#department), [1-52 Position](#position)

← Referenced by: [1-53 EDP](#edp)

### 1-55 EditHistory

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

### 1-56 StockRawMaterial

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

### 1-57 StockPackaging

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

### 1-58 StockFinishedGoods

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

### 1-59 StockBatch

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

### 1-60 StockOperation

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

### 1-61 StockReturn

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `finishedGoodsId` | Int | * |  |  |
| `returnDate` | String | * |  |  |
| `quantity` | Float | * |  |  |
| `salesman` | String |  |  |  |
| `reason` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-62 LibraryTagCandidate

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

→ Depends on: [1-72 LibraryDocument](#librarydocument), [1-73 LibraryDocumentVersion](#librarydocumentversion), [1-81 LibraryTag](#librarytag), [1-6 User](#user)

### 1-63 LibraryEntityMention

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

→ Depends on: [1-73 LibraryDocumentVersion](#librarydocumentversion), [1-69 LibraryContentChunk](#librarycontentchunk)

### 1-64 LibraryMetadataCandidate

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

→ Depends on: [1-72 LibraryDocument](#librarydocument), [1-73 LibraryDocumentVersion](#librarydocumentversion), [1-6 User](#user)

### 1-65 LibraryEvaluationCase

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

← Referenced by: [1-66 LibraryEvaluationEvidence](#libraryevaluationevidence)

### 1-66 LibraryEvaluationEvidence

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

→ Depends on: [1-65 LibraryEvaluationCase](#libraryevaluationcase), [1-73 LibraryDocumentVersion](#librarydocumentversion)

### 1-67 LibraryProcessingJob

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

→ Depends on: [1-73 LibraryDocumentVersion](#librarydocumentversion)

← Referenced by: [1-68 LibraryArtifact](#libraryartifact)

### 1-68 LibraryArtifact

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

→ Depends on: [1-73 LibraryDocumentVersion](#librarydocumentversion), [1-67 LibraryProcessingJob](#libraryprocessingjob)

← Referenced by: [1-69 LibraryContentChunk](#librarycontentchunk), [1-70 LibrarySearchIndex](#librarysearchindex)

### 1-69 LibraryContentChunk

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

→ Depends on: [1-73 LibraryDocumentVersion](#librarydocumentversion), [1-68 LibraryArtifact](#libraryartifact)

← Referenced by: [1-63 LibraryEntityMention](#libraryentitymention)

### 1-70 LibrarySearchIndex

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

→ Depends on: [1-73 LibraryDocumentVersion](#librarydocumentversion), [1-68 LibraryArtifact](#libraryartifact)

### 1-71 LibraryExportJob

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

### 1-72 LibraryDocument

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

→ Depends on: [1-6 User](#user), [1-6 User](#user), [1-6 User](#user), [1-74 LibraryCategory](#librarycategory), [1-75 LibraryDirectory](#librarydirectory), [1-73 LibraryDocumentVersion](#librarydocumentversion)

← Referenced by: [1-62 LibraryTagCandidate](#librarytagcandidate), [1-64 LibraryMetadataCandidate](#librarymetadatacandidate), [1-73 LibraryDocumentVersion](#librarydocumentversion), [1-79 DueDiligenceMaterialSelection](#duediligencematerialselection), [1-82 LibraryDocumentTag](#librarydocumenttag)

### 1-73 LibraryDocumentVersion

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

→ Depends on: [1-72 LibraryDocument](#librarydocument), [1-6 User](#user)

← Referenced by: [1-62 LibraryTagCandidate](#librarytagcandidate), [1-63 LibraryEntityMention](#libraryentitymention), [1-64 LibraryMetadataCandidate](#librarymetadatacandidate), [1-66 LibraryEvaluationEvidence](#libraryevaluationevidence), [1-67 LibraryProcessingJob](#libraryprocessingjob), [1-68 LibraryArtifact](#libraryartifact), [1-69 LibraryContentChunk](#librarycontentchunk), [1-70 LibrarySearchIndex](#librarysearchindex), [1-72 LibraryDocument](#librarydocument), [1-79 DueDiligenceMaterialSelection](#duediligencematerialselection)

### 1-74 LibraryCategory

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

→ Depends on: [1-74 LibraryCategory](#librarycategory)

← Referenced by: [1-72 LibraryDocument](#librarydocument)

### 1-75 LibraryDirectory

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

← Referenced by: [1-72 LibraryDocument](#librarydocument)

### 1-76 DueDiligenceParty

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

← Referenced by: [1-77 DueDiligenceRequest](#duediligencerequest)

### 1-77 DueDiligenceRequest

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

→ Depends on: [1-76 DueDiligenceParty](#duediligenceparty)

← Referenced by: [1-78 DueDiligenceQuestion](#duediligencequestion)

### 1-78 DueDiligenceQuestion

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

→ Depends on: [1-77 DueDiligenceRequest](#duediligencerequest)

← Referenced by: [1-79 DueDiligenceMaterialSelection](#duediligencematerialselection)

### 1-79 DueDiligenceMaterialSelection

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

→ Depends on: [1-78 DueDiligenceQuestion](#duediligencequestion), [1-72 LibraryDocument](#librarydocument), [1-73 LibraryDocumentVersion](#librarydocumentversion)

### 1-80 LibraryGeneratedSource

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

### 1-81 LibraryTag

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

← Referenced by: [1-62 LibraryTagCandidate](#librarytagcandidate), [1-82 LibraryDocumentTag](#librarydocumenttag)

### 1-82 LibraryDocumentTag

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `documentId` | Int | * | cUK+FK | → LibraryDocument.id |
| `tagId` | Int | * | cUK+FK | → LibraryTag.id |
| `createdBy` | Int |  | FK | → User.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-72 LibraryDocument](#librarydocument), [1-81 LibraryTag](#librarytag), [1-6 User](#user)

### 1-83 OpenApiClient

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

← Referenced by: [1-86 OpenApiClientScopeGrant](#openapiclientscopegrant), [1-87 OpenApiAccessLog](#openapiaccesslog)

### 1-84 OpenApiResource

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

← Referenced by: [1-85 OpenApiScope](#openapiscope)

### 1-85 OpenApiScope

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

→ Depends on: [1-84 OpenApiResource](#openapiresource)

← Referenced by: [1-86 OpenApiClientScopeGrant](#openapiclientscopegrant)

### 1-86 OpenApiClientScopeGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `clientId` | Int | * | cUK+FK | → OpenApiClient.id |
| `scopeId` | Int | * | cUK+FK | → OpenApiScope.id |
| `action` | String | * | cUK |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-83 OpenApiClient](#openapiclient), [1-85 OpenApiScope](#openapiscope)

### 1-87 OpenApiAccessLog

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

→ Depends on: [1-83 OpenApiClient](#openapiclient)

### 1-88 SystemConfig

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `key` | String | * |  |  |
| `value` | String | * |  |  |

### 1-89 LoginAttempt

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `username` | String | * |  |  |
| `ip` | String | * |  |  |
| `success` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-90 DepartmentCollaboration

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

→ Depends on: [1-50 Department](#department), [1-6 User](#user)

← Referenced by: [1-91 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-92 DepartmentCollaborationPosition](#departmentcollaborationposition), [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem)

### 1-91 DepartmentCollaborationDepartment

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

→ Depends on: [1-90 DepartmentCollaboration](#departmentcollaboration), [1-50 Department](#department), [1-6 User](#user)

### 1-92 DepartmentCollaborationPosition

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `collaborationId` | Int | * | cUK+FK | → DepartmentCollaboration.id |
| `kind` | String | * | cUK |  |
| `positionId` | Int | * | cUK+FK | → Position.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-90 DepartmentCollaboration](#departmentcollaboration), [1-52 Position](#position)

### 1-93 MeetingType

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

← Referenced by: [1-94 MeetingSeries](#meetingseries), [1-95 Meeting](#meeting)

### 1-94 MeetingSeries

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

→ Depends on: [1-93 MeetingType](#meetingtype)

← Referenced by: [1-95 Meeting](#meeting)

### 1-95 Meeting

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

→ Depends on: [1-93 MeetingType](#meetingtype), [1-94 MeetingSeries](#meetingseries), [1-6 User](#user), [1-6 User](#user)

← Referenced by: [1-96 MeetingParticipant](#meetingparticipant), [1-97 MeetingAgendaItem](#meetingagendaitem), [1-98 MeetingMinuteEntry](#meetingminuteentry), [1-99 MeetingProposal](#meetingproposal), [1-101 MeetingDecision](#meetingdecision), [1-102 MeetingActionCandidate](#meetingactioncandidate), [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem)

### 1-96 MeetingParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `meetingId` | Int | * | cUK+FK | → Meeting.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `role` | String | * |  |  |
| `canVote` | Boolean | * |  |  |
| `attendanceStatus` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-95 Meeting](#meeting), [1-6 User](#user)

### 1-97 MeetingAgendaItem

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

→ Depends on: [1-95 Meeting](#meeting)

← Referenced by: [1-98 MeetingMinuteEntry](#meetingminuteentry), [1-99 MeetingProposal](#meetingproposal), [1-101 MeetingDecision](#meetingdecision), [1-102 MeetingActionCandidate](#meetingactioncandidate)

### 1-98 MeetingMinuteEntry

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

→ Depends on: [1-95 Meeting](#meeting), [1-97 MeetingAgendaItem](#meetingagendaitem)

### 1-99 MeetingProposal

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

→ Depends on: [1-95 Meeting](#meeting), [1-97 MeetingAgendaItem](#meetingagendaitem)

← Referenced by: [1-100 MeetingVote](#meetingvote), [1-101 MeetingDecision](#meetingdecision)

### 1-100 MeetingVote

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `proposalId` | Int | * | cUK+FK | → MeetingProposal.id |
| `voterUserId` | Int | * | cUK+FK | → User.id |
| `choice` | String | * |  |  |
| `note` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-99 MeetingProposal](#meetingproposal), [1-6 User](#user)

### 1-101 MeetingDecision

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

→ Depends on: [1-95 Meeting](#meeting), [1-97 MeetingAgendaItem](#meetingagendaitem), [1-99 MeetingProposal](#meetingproposal)

← Referenced by: [1-102 MeetingActionCandidate](#meetingactioncandidate), [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem)

### 1-102 MeetingActionCandidate

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

→ Depends on: [1-95 Meeting](#meeting), [1-97 MeetingAgendaItem](#meetingagendaitem), [1-101 MeetingDecision](#meetingdecision), [1-118 WorkItem](#workitem), [1-117 WorkPlan](#workplan)

← Referenced by: [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem)

### 1-103 WorkPlanAlignment

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

→ Depends on: [1-117 WorkPlan](#workplan), [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem)

### 1-104 WorkOkrCycle

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

→ Depends on: [1-104 WorkOkrCycle](#workokrcycle)

← Referenced by: [1-105 WorkOkrControlPolicy](#workokrcontrolpolicy), [1-117 WorkPlan](#workplan)

### 1-105 WorkOkrControlPolicy

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

→ Depends on: [1-104 WorkOkrCycle](#workokrcycle)

### 1-106 Project

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

→ Depends on: [1-50 Department](#department), [1-50 Department](#department)

← Referenced by: [1-107 ProjectEnablingDepartment](#projectenablingdepartment), [1-108 EmployeeProject](#employeeproject), [1-109 ProjectPlanPhase](#projectplanphase), [1-110 ProjectPlanDependency](#projectplandependency), [1-111 ProjectPlanBaseline](#projectplanbaseline), [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem), [1-122 ProjectWorkAssignee](#projectworkassignee)

### 1-107 ProjectEnablingDepartment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-106 Project](#project), [1-50 Department](#department)

### 1-108 EmployeeProject

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

→ Depends on: [1-106 Project](#project), [1-46 Employee](#employee)

### 1-109 ProjectPlanPhase

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

→ Depends on: [1-106 Project](#project)

← Referenced by: [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem)

### 1-110 ProjectPlanDependency

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

→ Depends on: [1-106 Project](#project)

### 1-111 ProjectPlanBaseline

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

→ Depends on: [1-106 Project](#project)

← Referenced by: [1-112 ProjectPlanBaselineItem](#projectplanbaselineitem)

### 1-112 ProjectPlanBaselineItem

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

→ Depends on: [1-111 ProjectPlanBaseline](#projectplanbaseline)

### 1-113 WorkReport

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

← Referenced by: [1-114 WorkReportItem](#workreportitem)

### 1-114 WorkReportItem

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

→ Depends on: [1-113 WorkReport](#workreport), [1-117 WorkPlan](#workplan), [1-118 WorkItem](#workitem)

### 1-115 PositionResponsibilityNode

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

→ Depends on: [1-44 PositionDescription](#positiondescription), [1-115 PositionResponsibilityNode](#positionresponsibilitynode)

← Referenced by: [1-116 WorkResponsibilityReference](#workresponsibilityreference)

### 1-116 WorkResponsibilityReference

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

→ Depends on: [1-118 WorkItem](#workitem), [1-115 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-117 WorkPlan

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

→ Depends on: [1-46 Employee](#employee), [1-90 DepartmentCollaboration](#departmentcollaboration), [1-104 WorkOkrCycle](#workokrcycle), [1-117 WorkPlan](#workplan), [1-117 WorkPlan](#workplan), [1-117 WorkPlan](#workplan), [1-106 Project](#project), [1-109 ProjectPlanPhase](#projectplanphase), [1-95 Meeting](#meeting), [1-101 MeetingDecision](#meetingdecision), [1-102 MeetingActionCandidate](#meetingactioncandidate), [1-50 Department](#department)

← Referenced by: [1-102 MeetingActionCandidate](#meetingactioncandidate), [1-103 WorkPlanAlignment](#workplanalignment), [1-103 WorkPlanAlignment](#workplanalignment), [1-114 WorkReportItem](#workreportitem), [1-118 WorkItem](#workitem)

### 1-118 WorkItem

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

→ Depends on: [1-117 WorkPlan](#workplan), [1-46 Employee](#employee), [1-90 DepartmentCollaboration](#departmentcollaboration), [1-106 Project](#project), [1-109 ProjectPlanPhase](#projectplanphase), [1-95 Meeting](#meeting), [1-101 MeetingDecision](#meetingdecision), [1-102 MeetingActionCandidate](#meetingactioncandidate), [1-50 Department](#department), [1-118 WorkItem](#workitem), [1-118 WorkItem](#workitem), [1-118 WorkItem](#workitem)

← Referenced by: [1-102 MeetingActionCandidate](#meetingactioncandidate), [1-103 WorkPlanAlignment](#workplanalignment), [1-114 WorkReportItem](#workreportitem), [1-116 WorkResponsibilityReference](#workresponsibilityreference), [1-119 WorkKrEvidence](#workkrevidence), [1-119 WorkKrEvidence](#workkrevidence), [1-120 WorkParticipant](#workparticipant)

### 1-119 WorkKrEvidence

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `krWorkItemId` | Int | * | cUK+FK | → WorkItem.id |
| `taskWorkItemId` | Int | * | cUK+FK | → WorkItem.id |
| `note` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-118 WorkItem](#workitem), [1-118 WorkItem](#workitem)

### 1-120 WorkParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `workItemId` | Int | * | FK | → WorkItem.id |
| `name` | String | * |  |  |
| `wxUserId` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-118 WorkItem](#workitem)

### 1-121 DepartmentWorkAssignee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `kind` | String | * | cUK | "task" |

→ Depends on: [1-50 Department](#department), [1-6 User](#user)

### 1-122 ProjectWorkAssignee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `kind` | String | * | cUK | "task" |

→ Depends on: [1-106 Project](#project), [1-6 User](#user)
