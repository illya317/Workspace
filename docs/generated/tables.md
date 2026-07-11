# HR Database Schema (106 tables)

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

← Referenced by: [1-3 ApprovalRequest](#approvalrequest), [1-3 ApprovalRequest](#approvalrequest), [1-4 ApprovalEvent](#approvalevent), [1-9 UserResourceActionGrant](#userresourceactiongrant), [1-12 PermissionGrantLedgerEvent](#permissiongrantledgerevent), [1-13 Notification](#notification), [1-13 Notification](#notification), [1-14 Contract](#contract), [1-26 FinanceAccount](#financeaccount), [1-28 FinanceVoucher](#financevoucher), [1-30 FinanceLedgerImport](#financeledgerimport), [1-32 FinanceBalanceSnapshot](#financebalancesnapshot), [1-32 FinanceBalanceSnapshot](#financebalancesnapshot), [1-34 FinanceReclassRule](#financereclassrule), [1-37 ReclassResult](#reclassresult), [1-40 FinanceStatementWorkpaper](#financestatementworkpaper), [1-42 FinanceStatementReview](#financestatementreview), [1-42 FinanceStatementReview](#financestatementreview), [1-47 Employee](#employee), [1-56 EditHistory](#edithistory), [1-57 StockRawMaterial](#stockrawmaterial), [1-58 StockPackaging](#stockpackaging), [1-59 StockFinishedGoods](#stockfinishedgoods), [1-61 StockOperation](#stockoperation), [1-63 LibraryDocument](#librarydocument), [1-80 Meeting](#meeting), [1-80 Meeting](#meeting), [1-81 MeetingParticipant](#meetingparticipant), [1-85 MeetingVote](#meetingvote), [1-103 DepartmentWorkAssignee](#departmentworkassignee), [1-104 ProjectWorkAssignee](#projectworkassignee), [1-105 WorkReport](#workreport)

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

→ Depends on: [1-7 Resource](#resource), [1-53 Position](#position)

### 1-11 DepartmentResourceActionGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `resourceId` | Int | * | cUK+FK | → Resource.id |
| `actionKey` | String | * | cUK |  |
| `scopeId` | String |  | cUK |  |

→ Depends on: [1-7 Resource](#resource), [1-51 Department](#department)

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

### 1-17 FinanceBudgetVersion

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

← Referenced by: [1-18 FinanceBudgetDept](#financebudgetdept), [1-19 FinanceBudgetRd](#financebudgetrd)

### 1-18 FinanceBudgetDept

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

→ Depends on: [1-17 FinanceBudgetVersion](#financebudgetversion), [1-26 FinanceAccount](#financeaccount)

### 1-19 FinanceBudgetRd

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

→ Depends on: [1-17 FinanceBudgetVersion](#financebudgetversion), [1-26 FinanceAccount](#financeaccount)

### 1-20 FinanceDataImport

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

← Referenced by: [1-21 FinanceShipment](#financeshipment), [1-22 FinanceSalesSalary](#financesalessalary), [1-23 FinanceCostStructureRow](#financecoststructurerow), [1-24 FinanceCostAnalysisRow](#financecostanalysisrow), [1-25 FinanceWorkshopReport](#financeworkshopreport)

### 1-21 FinanceShipment

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

→ Depends on: [1-47 Employee](#employee), [1-20 FinanceDataImport](#financedataimport)

### 1-22 FinanceSalesSalary

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

→ Depends on: [1-47 Employee](#employee), [1-20 FinanceDataImport](#financedataimport)

### 1-23 FinanceCostStructureRow

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

→ Depends on: [1-20 FinanceDataImport](#financedataimport)

### 1-24 FinanceCostAnalysisRow

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

→ Depends on: [1-20 FinanceDataImport](#financedataimport)

### 1-25 FinanceWorkshopReport

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

→ Depends on: [1-53 Position](#position), [1-47 Employee](#employee), [1-20 FinanceDataImport](#financedataimport)

### 1-26 FinanceAccount

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
| `reclassTargetCode` | String |  |  | @deprecated 重分类目标科目编码（已迁至 FinanceReclassRule，仅保留兼容） |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user), [1-26 FinanceAccount](#financeaccount)

← Referenced by: [1-18 FinanceBudgetDept](#financebudgetdept), [1-19 FinanceBudgetRd](#financebudgetrd), [1-29 FinanceVoucherItem](#financevoucheritem), [1-31 FinanceAccountBalance](#financeaccountbalance), [1-33 FinanceBalanceSnapshotRow](#financebalancesnapshotrow)

### 1-27 FinancePeriod

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

← Referenced by: [1-28 FinanceVoucher](#financevoucher), [1-31 FinanceAccountBalance](#financeaccountbalance), [1-37 ReclassResult](#reclassresult)

### 1-28 FinanceVoucher

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

→ Depends on: [1-6 User](#user), [1-27 FinancePeriod](#financeperiod)

← Referenced by: [1-29 FinanceVoucherItem](#financevoucheritem)

### 1-29 FinanceVoucherItem

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

→ Depends on: [1-26 FinanceAccount](#financeaccount), [1-28 FinanceVoucher](#financevoucher), [1-30 FinanceLedgerImport](#financeledgerimport)

← Referenced by: [1-37 ReclassResult](#reclassresult)

### 1-30 FinanceLedgerImport

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

← Referenced by: [1-29 FinanceVoucherItem](#financevoucheritem)

### 1-31 FinanceAccountBalance

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

→ Depends on: [1-27 FinancePeriod](#financeperiod), [1-26 FinanceAccount](#financeaccount)

### 1-32 FinanceBalanceSnapshot

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

← Referenced by: [1-33 FinanceBalanceSnapshotRow](#financebalancesnapshotrow)

### 1-33 FinanceBalanceSnapshotRow

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

→ Depends on: [1-32 FinanceBalanceSnapshot](#financebalancesnapshot), [1-26 FinanceAccount](#financeaccount)

### 1-34 FinanceReclassRule

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

← Referenced by: [1-37 ReclassResult](#reclassresult)

### 1-35 FinanceReclassItemRule

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

### 1-36 FinanceBalanceReclassAdjustment

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

### 1-37 ReclassResult

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `periodId` | Int | * | cUK+FK | → FinancePeriod.id |
| `voucherItemId` | Int | * | cUK+FK | 来源凭证明细 |
| `ruleId` | Int |  | FK | 追溯到生成此结果的规则；手工添加或历史兼容时为 null |
| `sourceAccount` | String | * |  | 原科目编码（快照，不FK） |
| `targetAccount` | String | * |  | 目标科目编码（可修改） |
| `amount` | Float | * |  | 重分类金额 |
| `status` | String | * |  | pending|approved|adjusted|rejected |
| `adjustedBy` | Int |  | FK | 审核人 userId |
| `adjustedAt` | DateTime |  |  |  |
| `note` | String |  |  | 审核备注 |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-27 FinancePeriod](#financeperiod), [1-29 FinanceVoucherItem](#financevoucheritem), [1-34 FinanceReclassRule](#financereclassrule), [1-6 User](#user)

### 1-38 FinanceStatementAccountMapping

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

### 1-39 FinanceStatementLineConfig

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

### 1-40 FinanceStatementWorkpaper

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
| `review` | FinanceStatementReview |  |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-41 FinanceStatementWorkpaperLine](#financestatementworkpaperline), [1-42 FinanceStatementReview](#financestatementreview)

### 1-41 FinanceStatementWorkpaperLine

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

→ Depends on: [1-40 FinanceStatementWorkpaper](#financestatementworkpaper)

### 1-42 FinanceStatementReview

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `workpaperId` | Int | * | UK+FK | → FinanceStatementWorkpaper.id |
| `companyCode` | String | * |  |  |
| `year` | Int | * |  |  |
| `month` | Int | * |  |  |
| `reportType` | String | * |  | incomeStatement | cashFlow |
| `status` | String | * |  | draft | confirmed | voided |
| `generatedFromVersion` | Int | * |  |  |
| `reviewedBy` | Int |  | FK | → User.id |
| `reviewedAt` | DateTime |  |  |  |
| `note` | String |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-40 FinanceStatementWorkpaper](#financestatementworkpaper), [1-6 User](#user), [1-6 User](#user)

← Referenced by: [1-43 FinanceStatementReviewLine](#financestatementreviewline)

### 1-43 FinanceStatementReviewLine

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `reviewId` | Int | * | cUK+FK | → FinanceStatementReview.id |
| `lineCode` | String | * | cUK |  |
| `label` | String | * |  | 创建 review 时的项目名称快照 |
| `sortOrder` | Int | * |  | 创建 review 时的排序快照 |
| `systemAmount` | Float | * |  |  |
| `workpaperAmount` | Float | * |  |  |
| `adjustedAmount` | Float |  |  |  |
| `finalAmount` | Float | * |  |  |
| `status` | String | * |  | pending | confirmed | adjusted | flagged |
| `comment` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 FinanceStatementReview](#financestatementreview)

### 1-44 DepartmentDescription

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

→ Depends on: [1-51 Department](#department)

### 1-45 PositionDescription

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `reportToPositionId` | Int |  | FK | → Position.id |
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

→ Depends on: [1-53 Position](#position)

← Referenced by: [1-53 Position](#position), [1-97 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-46 HrPerformanceReview

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

→ Depends on: [1-47 Employee](#employee)

### 1-47 Employee

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

← Referenced by: [1-21 FinanceShipment](#financeshipment), [1-22 FinanceSalesSalary](#financesalessalary), [1-25 FinanceWorkshopReport](#financeworkshopreport), [1-46 HrPerformanceReview](#hrperformancereview), [1-48 Employment](#employment), [1-52 DepartmentManagerEmployee](#departmentmanageremployee), [1-54 EDP](#edp), [1-92 EmployeeProject](#employeeproject), [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem)

### 1-48 Employment

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

→ Depends on: [1-47 Employee](#employee)

### 1-49 Company

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

← Referenced by: [1-50 CompanyRelation](#companyrelation), [1-50 CompanyRelation](#companyrelation), [1-54 EDP](#edp), [1-55 PositionReportOverride](#positionreportoverride)

### 1-50 CompanyRelation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `parentId` | Int | * | cUK+FK | → Company.id |
| `childId` | Int | * | cUK+FK | → Company.id |
| `shareRatio` | Float |  |  |  |
| `isConsolidated` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-49 Company](#company), [1-49 Company](#company)

### 1-51 Department

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

→ Depends on: [1-53 Position](#position), [1-51 Department](#department)

← Referenced by: [1-11 DepartmentResourceActionGrant](#departmentresourceactiongrant), [1-44 DepartmentDescription](#departmentdescription), [1-52 DepartmentManagerEmployee](#departmentmanageremployee), [1-53 Position](#position), [1-54 EDP](#edp), [1-55 PositionReportOverride](#positionreportoverride), [1-90 Project](#project), [1-90 Project](#project), [1-91 ProjectEnablingDepartment](#projectenablingdepartment), [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem), [1-103 DepartmentWorkAssignee](#departmentworkassignee)

### 1-52 DepartmentManagerEmployee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `employeeId` | Int | * | cUK+FK | → Employee.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-51 Department](#department), [1-47 Employee](#employee)

### 1-53 Position

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String | * |  |  |
| `alias` | String |  |  |  |
| `name` | String | * |  |  |
| `departmentId` | Int |  | FK | → Department.id |
| `positionDescriptionId` | Int |  | cUK+FK | → PositionDescription.id |
| `isArchived` | Boolean | * |  |  |
| `archivedAt` | DateTime |  |  |  |
| `endDate` | DateTime |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-45 PositionDescription](#positiondescription), [1-51 Department](#department)

← Referenced by: [1-10 PositionResourceActionGrant](#positionresourceactiongrant), [1-25 FinanceWorkshopReport](#financeworkshopreport), [1-45 PositionDescription](#positiondescription), [1-51 Department](#department), [1-54 EDP](#edp), [1-55 PositionReportOverride](#positionreportoverride), [1-55 PositionReportOverride](#positionreportoverride)

### 1-54 EDP

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

→ Depends on: [1-53 Position](#position), [1-51 Department](#department), [1-49 Company](#company), [1-55 PositionReportOverride](#positionreportoverride), [1-47 Employee](#employee)

### 1-55 PositionReportOverride

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

→ Depends on: [1-53 Position](#position), [1-49 Company](#company), [1-51 Department](#department), [1-53 Position](#position)

← Referenced by: [1-54 EDP](#edp)

### 1-56 EditHistory

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

### 1-57 StockRawMaterial

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

### 1-58 StockPackaging

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

### 1-59 StockFinishedGoods

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

### 1-60 StockBatch

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

### 1-61 StockOperation

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

### 1-62 StockReturn

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `finishedGoodsId` | Int | * |  |  |
| `returnDate` | String | * |  |  |
| `quantity` | Float | * |  |  |
| `salesman` | String |  |  |  |
| `reason` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-63 LibraryDocument

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
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
| `docId` | String |  | UK |  |
| `confidentialityLevel` | Int | * |  |  |
| `status` | String | * |  |  |
| `origin` | String | * |  |  |
| `generatorKey` | String |  |  |  |
| `versionLabel` | String |  |  |  |
| `gitRepo` | String |  |  |  |
| `gitCommit` | String |  |  |  |
| `gitPath` | String |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-64 LibraryDocumentVersion](#librarydocumentversion), [1-68 DueDiligenceMaterialSelection](#duediligencematerialselection), [1-70 LibraryDocumentTag](#librarydocumenttag)

### 1-64 LibraryDocumentVersion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `documentId` | Int | * | cUK+FK | → LibraryDocument.id |
| `versionNo` | Int | * | cUK |  |
| `relativePath` | String | * |  |  |
| `fileSizeBytes` | Int |  |  |  |
| `fileMtime` | DateTime |  |  |  |
| `checksumSha256` | String |  |  |  |
| `gitCommit` | String |  |  |  |
| `changeNote` | String |  |  |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-63 LibraryDocument](#librarydocument)

← Referenced by: [1-68 DueDiligenceMaterialSelection](#duediligencematerialselection)

### 1-65 DueDiligenceParty

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

← Referenced by: [1-66 DueDiligenceRequest](#duediligencerequest)

### 1-66 DueDiligenceRequest

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

→ Depends on: [1-65 DueDiligenceParty](#duediligenceparty)

← Referenced by: [1-67 DueDiligenceQuestion](#duediligencequestion)

### 1-67 DueDiligenceQuestion

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

→ Depends on: [1-66 DueDiligenceRequest](#duediligencerequest)

← Referenced by: [1-68 DueDiligenceMaterialSelection](#duediligencematerialselection)

### 1-68 DueDiligenceMaterialSelection

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

→ Depends on: [1-67 DueDiligenceQuestion](#duediligencequestion), [1-63 LibraryDocument](#librarydocument), [1-64 LibraryDocumentVersion](#librarydocumentversion)

### 1-69 LibraryGeneratedSource

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

### 1-70 LibraryDocumentTag

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `documentId` | Int | * | cUK+FK | → LibraryDocument.id |
| `tag` | String | * | cUK |  |

→ Depends on: [1-63 LibraryDocument](#librarydocument)

### 1-71 OpenApiClient

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

← Referenced by: [1-74 OpenApiClientScopeGrant](#openapiclientscopegrant), [1-75 OpenApiAccessLog](#openapiaccesslog)

### 1-72 OpenApiResource

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

← Referenced by: [1-73 OpenApiScope](#openapiscope)

### 1-73 OpenApiScope

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

→ Depends on: [1-72 OpenApiResource](#openapiresource)

← Referenced by: [1-74 OpenApiClientScopeGrant](#openapiclientscopegrant)

### 1-74 OpenApiClientScopeGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `clientId` | Int | * | cUK+FK | → OpenApiClient.id |
| `scopeId` | Int | * | cUK+FK | → OpenApiScope.id |
| `action` | String | * | cUK |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-71 OpenApiClient](#openapiclient), [1-73 OpenApiScope](#openapiscope)

### 1-75 OpenApiAccessLog

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

→ Depends on: [1-71 OpenApiClient](#openapiclient)

### 1-76 SystemConfig

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `key` | String | * |  |  |
| `value` | String | * |  |  |

### 1-77 LoginAttempt

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `username` | String | * |  |  |
| `ip` | String | * |  |  |
| `success` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-78 MeetingType

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

← Referenced by: [1-79 MeetingSeries](#meetingseries), [1-80 Meeting](#meeting)

### 1-79 MeetingSeries

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

→ Depends on: [1-78 MeetingType](#meetingtype)

← Referenced by: [1-80 Meeting](#meeting)

### 1-80 Meeting

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

→ Depends on: [1-78 MeetingType](#meetingtype), [1-79 MeetingSeries](#meetingseries), [1-6 User](#user), [1-6 User](#user)

← Referenced by: [1-81 MeetingParticipant](#meetingparticipant), [1-82 MeetingAgendaItem](#meetingagendaitem), [1-83 MeetingMinuteEntry](#meetingminuteentry), [1-84 MeetingProposal](#meetingproposal), [1-86 MeetingDecision](#meetingdecision), [1-87 MeetingActionCandidate](#meetingactioncandidate), [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem)

### 1-81 MeetingParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `meetingId` | Int | * | cUK+FK | → Meeting.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `role` | String | * |  |  |
| `canVote` | Boolean | * |  |  |
| `attendanceStatus` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-80 Meeting](#meeting), [1-6 User](#user)

### 1-82 MeetingAgendaItem

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

→ Depends on: [1-80 Meeting](#meeting)

← Referenced by: [1-83 MeetingMinuteEntry](#meetingminuteentry), [1-84 MeetingProposal](#meetingproposal), [1-86 MeetingDecision](#meetingdecision), [1-87 MeetingActionCandidate](#meetingactioncandidate)

### 1-83 MeetingMinuteEntry

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

→ Depends on: [1-80 Meeting](#meeting), [1-82 MeetingAgendaItem](#meetingagendaitem)

### 1-84 MeetingProposal

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

→ Depends on: [1-80 Meeting](#meeting), [1-82 MeetingAgendaItem](#meetingagendaitem)

← Referenced by: [1-85 MeetingVote](#meetingvote), [1-86 MeetingDecision](#meetingdecision)

### 1-85 MeetingVote

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `proposalId` | Int | * | cUK+FK | → MeetingProposal.id |
| `voterUserId` | Int | * | cUK+FK | → User.id |
| `choice` | String | * |  |  |
| `note` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-84 MeetingProposal](#meetingproposal), [1-6 User](#user)

### 1-86 MeetingDecision

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

→ Depends on: [1-80 Meeting](#meeting), [1-82 MeetingAgendaItem](#meetingagendaitem), [1-84 MeetingProposal](#meetingproposal)

← Referenced by: [1-87 MeetingActionCandidate](#meetingactioncandidate), [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem)

### 1-87 MeetingActionCandidate

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

→ Depends on: [1-80 Meeting](#meeting), [1-82 MeetingAgendaItem](#meetingagendaitem), [1-86 MeetingDecision](#meetingdecision), [1-100 WorkItem](#workitem), [1-99 WorkPlan](#workplan)

← Referenced by: [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem)

### 1-88 WorkOkrCycle

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

→ Depends on: [1-88 WorkOkrCycle](#workokrcycle)

← Referenced by: [1-89 WorkOkrControlPolicy](#workokrcontrolpolicy), [1-99 WorkPlan](#workplan)

### 1-89 WorkOkrControlPolicy

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

→ Depends on: [1-88 WorkOkrCycle](#workokrcycle)

### 1-90 Project

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
| `baselineStartDate` | DateTime |  |  |  |
| `baselineEndDate` | DateTime |  |  |  |
| `startDate` | DateTime |  |  |  |
| `endDate` | DateTime |  |  |  |
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

→ Depends on: [1-51 Department](#department), [1-51 Department](#department)

← Referenced by: [1-91 ProjectEnablingDepartment](#projectenablingdepartment), [1-92 EmployeeProject](#employeeproject), [1-93 ProjectPlanPhase](#projectplanphase), [1-94 ProjectPlanDependency](#projectplandependency), [1-95 ProjectPlanBaseline](#projectplanbaseline), [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem), [1-104 ProjectWorkAssignee](#projectworkassignee)

### 1-91 ProjectEnablingDepartment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-90 Project](#project), [1-51 Department](#department)

### 1-92 EmployeeProject

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

→ Depends on: [1-90 Project](#project), [1-47 Employee](#employee)

### 1-93 ProjectPlanPhase

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `sequenceNo` | Int | * | cUK |  |
| `name` | String | * |  |  |
| `startDate` | DateTime |  |  |  |
| `endDate` | DateTime |  |  |  |
| `note` | String |  |  |  |
| `createdBy` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-90 Project](#project)

← Referenced by: [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem)

### 1-94 ProjectPlanDependency

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

→ Depends on: [1-90 Project](#project)

### 1-95 ProjectPlanBaseline

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

→ Depends on: [1-90 Project](#project)

← Referenced by: [1-96 ProjectPlanBaselineItem](#projectplanbaselineitem)

### 1-96 ProjectPlanBaselineItem

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
| `startDate` | DateTime |  |  |  |
| `endDate` | DateTime |  |  |  |

→ Depends on: [1-95 ProjectPlanBaseline](#projectplanbaseline)

### 1-97 PositionResponsibilityNode

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

→ Depends on: [1-45 PositionDescription](#positiondescription), [1-97 PositionResponsibilityNode](#positionresponsibilitynode)

← Referenced by: [1-98 WorkResponsibilityReference](#workresponsibilityreference)

### 1-98 WorkResponsibilityReference

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `targetKind` | String | * |  |  |
| `referenceRole` | String | * |  |  |
| `workPlanId` | Int |  | FK | → WorkPlan.id |
| `workItemId` | Int |  | FK | → WorkItem.id |
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

→ Depends on: [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem), [1-97 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-99 WorkPlan

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `targetType` | String | * |  |  |
| `targetId` | Int | * |  |  |
| `kind` | String | * |  |  |
| `title` | String | * |  |  |
| `description` | String | * |  |  |
| `status` | String | * |  |  |
| `okrStage` | String | * |  |  |
| `objectiveSubmittedAt` | DateTime |  |  |  |
| `objectiveApprovedAt` | DateTime |  |  |  |
| `objectiveApprovedByUserId` | Int |  |  |  |
| `krReviewOpensAt` | DateTime |  |  |  |
| `krSubmittedAt` | DateTime |  |  |  |
| `krApprovedAt` | DateTime |  |  |  |
| `krApprovedByUserId` | Int |  |  |  |
| `ownerEmployeeId` | Int |  | FK | → Employee.id |
| `okrCycleId` | Int |  | FK | → WorkOkrCycle.id |
| `sourcePlanId` | Int |  | FK | → WorkPlan.id |
| `okrControlScopeType` | String |  |  |  |
| `okrControlScopeId` | String |  |  |  |
| `objectiveApprovalSnapshotJson` | String | * |  |  |
| `krApprovalSnapshotJson` | String | * |  |  |
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
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-47 Employee](#employee), [1-88 WorkOkrCycle](#workokrcycle), [1-99 WorkPlan](#workplan), [1-90 Project](#project), [1-93 ProjectPlanPhase](#projectplanphase), [1-80 Meeting](#meeting), [1-86 MeetingDecision](#meetingdecision), [1-87 MeetingActionCandidate](#meetingactioncandidate), [1-51 Department](#department)

← Referenced by: [1-87 MeetingActionCandidate](#meetingactioncandidate), [1-98 WorkResponsibilityReference](#workresponsibilityreference), [1-100 WorkItem](#workitem), [1-106 WorkReportItem](#workreportitem)

### 1-100 WorkItem

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
| `startDate` | DateTime |  |  |  |
| `dueDate` | DateTime |  |  |  |
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
| `isArchived` | Boolean | * |  |  |
| `isPrivate` | Boolean | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-99 WorkPlan](#workplan), [1-47 Employee](#employee), [1-90 Project](#project), [1-93 ProjectPlanPhase](#projectplanphase), [1-80 Meeting](#meeting), [1-86 MeetingDecision](#meetingdecision), [1-87 MeetingActionCandidate](#meetingactioncandidate), [1-51 Department](#department), [1-100 WorkItem](#workitem)

← Referenced by: [1-87 MeetingActionCandidate](#meetingactioncandidate), [1-98 WorkResponsibilityReference](#workresponsibilityreference), [1-101 WorkKrEvidence](#workkrevidence), [1-101 WorkKrEvidence](#workkrevidence), [1-102 WorkParticipant](#workparticipant), [1-106 WorkReportItem](#workreportitem)

### 1-101 WorkKrEvidence

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `krWorkItemId` | Int | * | cUK+FK | → WorkItem.id |
| `taskWorkItemId` | Int | * | cUK+FK | → WorkItem.id |
| `note` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-100 WorkItem](#workitem), [1-100 WorkItem](#workitem)

### 1-102 WorkParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `workItemId` | Int | * | FK | → WorkItem.id |
| `name` | String | * |  |  |
| `wxUserId` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-100 WorkItem](#workitem)

### 1-103 DepartmentWorkAssignee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `kind` | String | * | cUK | "task" |

→ Depends on: [1-51 Department](#department), [1-6 User](#user)

### 1-104 ProjectWorkAssignee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `kind` | String | * | cUK | "task" |

→ Depends on: [1-90 Project](#project), [1-6 User](#user)

### 1-105 WorkReport

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `targetType` | String | * | cUK |  |
| `targetId` | Int | * | cUK |  |
| `periodType` | String | * | cUK |  |
| `reportStage` | String | * | cUK |  |
| `periodStart` | DateTime | * | cUK |  |
| `periodEnd` | DateTime | * |  |  |
| `submittedBy` | Int | * | cUK+FK | → User.id |
| `submittedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-6 User](#user)

← Referenced by: [1-106 WorkReportItem](#workreportitem)

### 1-106 WorkReportItem

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
| `previousPlanSnapshot` | String | * |  |  |
| `doneThisWeek` | String | * |  |  |
| `planNextWeek` | String | * |  |  |
| `note` | String | * |  |  |
| `selfScore` | Int |  |  |  |
| `performanceScore` | Int |  |  |  |
| `sortOrder` | Int | * |  |  |

→ Depends on: [1-105 WorkReport](#workreport), [1-99 WorkPlan](#workplan), [1-100 WorkItem](#workitem)
