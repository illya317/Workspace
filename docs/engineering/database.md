# 数据库表结构

> 本文档由 `scripts/generate/gen-db-docs.js` 自动生成，基于 `prisma/models/*.prisma`。

## 模型列表

### ErpDueDiligenceSubmission

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| campaignKey | String | @default("order-to-cash-2026") |  |
| definitionVersion | Int | @default(2) |  |
| respondentUserId | Int | - |  |
| positionAssignmentId | Int? | - |  |
| respondentName | String | - |  |
| departmentName | String | - |  |
| departmentId | Int? | - |  |
| roleTitle | String | - |  |
| primaryArea | String | - |  |
| status | String | @default("draft") |  |
| answersJson | Json | @default("{ |  |

### ErpDueDiligenceEvidenceAttachment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| attachmentUid | String | @unique @default(uuid()) |  |
| submissionId | Int | - |  |
| evidenceKey | String | - |  |
| fileName | String | - |  |
| mimeType | String | - |  |
| fileSize | Int | - |  |
| checksumSha256 | String | - |  |
| fileContent | Bytes | - |  |
| uploadedBy | Int | - |  |
| uploadedAt | DateTime | @default(now()) |  |
| submission | ErpDueDiligenceSubmission | @relation(fields: [submissionId], references: [id], onDelete: Cascade) |  |

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
| createdAt | DateTime | @default(now()) |  |
| sessionVersion | Int | @default(0) |  |
| editedContracts | Contract[] | @relation("ContractEditor") |  |
| archivedContracts | Contract[] | @relation("ContractArchivedBy") |  |
| uploadedContractAttachments | ContractAttachment[] | @relation("ContractAttachmentUploader") |  |
| removedContractAttachments | ContractAttachment[] | @relation("ContractAttachmentRemover") |  |
| uploadedEmploymentAgreementAttachments | EmploymentAgreementAttachment[] | @relation("EmploymentAgreementAttachmentUploader") |  |
| removedEmploymentAgreementAttachments | EmploymentAgreementAttachment[] | @relation("EmploymentAgreementAttachmentRemover") |  |
| createdEmployeeSocialInsurancePeriods | EmployeeSocialInsurancePeriod[] | @relation("EmployeeSocialInsuranceCreator") |  |
| updatedEmployeeSocialInsurancePeriods | EmployeeSocialInsurancePeriod[] | @relation("EmployeeSocialInsuranceUpdater") |  |
| recordedEmployeeSocialInsuranceRevisions | EmployeeSocialInsurancePeriodRevision[] | @relation("EmployeeSocialInsuranceRevisionRecorder") |  |
| createdContractRecords | ContractRecord[] | @relation("ContractRecordCreator") |  |
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
| notificationSubscriptions | NotificationSubscription[] | - |  |
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
| erpDueDiligenceSubmissions | ErpDueDiligenceSubmission[] | @relation("ErpDueDiligenceRespondent") |  |
| recordedEmployeeLifecycleEvents | EmployeeLifecycleEvent[] | @relation("EmployeeLifecycleEventRecorder") |  |
| recordedEmployeePeriodRevisions | EmployeePeriodRevision[] | @relation("EmployeePeriodRevisionRecorder") |  |
| requestedDataQualityRuns | DataQualityRun[] | @relation("DataQualityRunRequester") |  |
| recordedEmploymentAgreementChanges | EmploymentAgreementChange[] | @relation("EmploymentAgreementChangeActor") |  |
| financeCloseRunsStarted | FinanceCloseRun[] | - |  |
| financeCloseEventsActed | FinanceCloseEvent[] | - |  |
| financeCloseWorkpapersPrepared | FinanceCloseWorkpaper[] | @relation("FinanceCloseWorkpaperPreparer") |  |
| financeCloseWorkpapersReviewed | FinanceCloseWorkpaper[] | @relation("FinanceCloseWorkpaperReviewer") |  |
| financeCloseWorkpaperEventsActed | FinanceCloseWorkpaperEvent[] | - |  |
| financeAssetImpairmentAssessments | FinanceAssetImpairmentAssessment[] | @relation("FinanceAssetImpairmentAssessor") |  |
| financeAssetDisposalsConfirmed | FinanceAssetDisposal[] | @relation("FinanceAssetDisposalConfirmer") |  |
| financeAssetAcquisitionsConfirmed | FinanceAssetAcquisitionEvidence[] | @relation("FinanceAssetAcquisitionConfirmer") |  |

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
| recipientReason | String? | - |  |
| resourceKey | String? | - |  |
| scopeId | String? | - |  |
| subscriptionId | Int? | - |  |
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
| subscription | NotificationSubscription? | @relation(fields: [subscriptionId], references: [id], onDelete: SetNull) |  |

### OwnershipInterest

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| ownerPartyId | Int | - |  |
| issuerCompanyId | Int | - |  |
| shareRatio | Float? | - |  |
| isConsolidated | Boolean | @default(false) |  |
| effectiveFrom | DateTime? | - |  |
| effectiveTo | DateTime? | - |  |
| recordStatus | String | @default("confirmed") |  |
| changeLabel | String? | - |  |
| sourceType | String? | - |  |
| sourceLabel | String? | - |  |
| sourceReference | String? | - |  |
| sourceEventId | Int? | - |  |
| closedByEventId | Int? | - |  |
| projectionRunId | Int? | - |  |
| projectionGeneration | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| owner | Party | @relation(fields: [ownerPartyId], references: [id], onDelete: Restrict) |  |
| issuer | Company | @relation(fields: [issuerCompanyId], references: [id], onDelete: Restrict) |  |
| sourceEvent | ShareCapitalEvent? | @relation("OwnershipInterestSourceEvent", fields: [sourceEventId], references: [id], onDelete: Restrict) |  |
| closedByEvent | ShareCapitalEvent? | @relation("OwnershipInterestClosedByEvent", fields: [closedByEventId], references: [id], onDelete: Restrict) |  |
| projectionRun | OwnershipProjectionRun? | @relation(fields: [projectionRunId], references: [id], onDelete: Restrict) |  |

### OwnershipProjectionRun

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| issuerCompanyId | Int | - |  |
| generation | Int | - |  |
| projectorKey | String | - |  |
| projectorVersion | Int | - |  |
| ledgerHash | String | - |  |
| sourceEventCount | Int | - |  |
| projectionRowCount | Int | - |  |
| triggerReason | String? | - |  |
| triggeredBy | Int? | - |  |
| projectedAt | DateTime | @default(now()) |  |
| ownershipInterests | OwnershipInterest[] | - |  |
| issuer | Company | @relation(fields: [issuerCompanyId], references: [id], onDelete: Restrict) |  |

### CompanyRegistryChange

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int | - |  |
| sourceKey | String | @unique |  |
| changeDate | DateTime | - |  |
| changeCategory | String | - |  |
| changeItem | String | - |  |
| contentBefore | String? | @db.Text |  |
| contentAfter | String? | @db.Text |  |
| sourceCreatedDate | DateTime? | - |  |
| sourceType | String? | - |  |
| sourceLabel | String? | - |  |
| sourceReference | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| ownershipParticipants | CompanyRegistryOwnershipParticipant[] | - |  |

### CompanyRegistryOwnershipParticipant

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| registryChangeId | Int | - |  |
| snapshotSide | String | - |  |
| sequence | Int | - |  |
| partyId | Int? | - |  |
| rawName | String | - |  |
| normalizedName | String | - |  |
| resolutionStatus | String | @default("unresolved") |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| registryChange | CompanyRegistryChange | @relation(fields: [registryChangeId], references: [id], onDelete: Cascade) |  |
| party | Party? | @relation(fields: [partyId], references: [id], onDelete: Restrict) |  |

### ShareCapitalEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| sourceKey | String? | @unique |  |
| issuerCompanyId | Int | - |  |
| sequence | Int | - |  |
| eventType | String | - |  |
| eventName | String | - |  |
| effectiveDate | DateTime? | - |  |
| effectiveDatePrecision | String | @default("day") |  |
| ledgerMode | String | @default("transactions") |  |
| dataCompleteness | String | @default("complete") |  |
| registeredCapitalCheckpointYuan | Decimal? | @db.Decimal(20, 2) |  |
| recordStatus | String | @default("confirmed") |  |
| sourceObservedDate | DateTime? | - |  |
| consolidatedByPartyIdAfter | Int? | - |  |
| supersedesEventId | Int? | - |  |
| sourceType | String? | - |  |
| sourceLabel | String? | - |  |
| sourceReference | String? | - |  |
| notes | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| issuer | Company | @relation(fields: [issuerCompanyId], references: [id], onDelete: Restrict) |  |
| consolidatedByPartyAfter | Party? | @relation("ShareCapitalEventController", fields: [consolidatedByPartyIdAfter], references: [id], onDelete: Restrict) |  |
| supersedesEvent | ShareCapitalEvent? | @relation("ShareCapitalEventSupersession", fields: [supersedesEventId], references: [id], onDelete: Restrict) |  |
| supersededByEvents | ShareCapitalEvent[] | @relation("ShareCapitalEventSupersession") |  |
| openedOwnershipInterests | OwnershipInterest[] | @relation("OwnershipInterestSourceEvent") |  |
| closedOwnershipInterests | OwnershipInterest[] | @relation("OwnershipInterestClosedByEvent") |  |
| transactions | ShareCapitalTransaction[] | - |  |
| snapshotPositions | ShareCapitalSnapshotPosition[] | - |  |

### ShareCapitalTransaction

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| eventId | Int | - |  |
| sequence | Int | @default(1) |  |
| fromPartyId | Int? | - |  |
| toPartyId | Int? | - |  |
| registeredCapitalAmountYuan | Decimal | @db.Decimal(20, 2) |  |
| considerationAmountYuan | Decimal? | @db.Decimal(20, 2) |  |
| sourceReference | String? | - |  |
| notes | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| event | ShareCapitalEvent | @relation(fields: [eventId], references: [id], onDelete: Cascade) |  |
| fromParty | Party? | @relation("ShareCapitalTransferor", fields: [fromPartyId], references: [id], onDelete: Restrict) |  |
| toParty | Party? | @relation("ShareCapitalTransferee", fields: [toPartyId], references: [id], onDelete: Restrict) |  |

### ShareCapitalSnapshotPosition

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| eventId | Int | - |  |
| sequence | Int | @default(1) |  |
| partyId | Int | - |  |
| registeredCapitalAmountYuan | Decimal? | @db.Decimal(20, 2) |  |
| assertedShareRatio | Float? | - |  |
| sourceReference | String? | - |  |
| notes | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| event | ShareCapitalEvent | @relation(fields: [eventId], references: [id], onDelete: Cascade) |  |
| party | Party | @relation(fields: [partyId], references: [id], onDelete: Restrict) |  |

### ShareholderGroup

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| issuerCompanyId | Int | - |  |
| groupKey | String | - |  |
| label | String | - |  |
| sortOrder | Int | @default(0) |  |
| sourceType | String? | - |  |
| sourceLabel | String? | - |  |
| sourceReference | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| issuer | Company | @relation(fields: [issuerCompanyId], references: [id], onDelete: Restrict) |  |
| memberships | ShareholderGroupMembership[] | - |  |

### ShareholderGroupMembership

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| shareholderGroupId | Int | - |  |
| partyId | Int | - |  |
| sortOrder | Int | @default(0) |  |
| effectiveFrom | DateTime | - |  |
| effectiveTo | DateTime? | - |  |
| recordStatus | String | @default("confirmed") |  |
| sourceType | String? | - |  |
| sourceLabel | String? | - |  |
| sourceReference | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| shareholderGroup | ShareholderGroup | @relation(fields: [shareholderGroupId], references: [id], onDelete: Cascade) |  |
| party | Party | @relation(fields: [partyId], references: [id], onDelete: Restrict) |  |

### ContractRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| revisionUid | String | @unique @default(dbgenerated("(gen_random_uuid())::text")) |  |
| contractId | Int | - |  |
| revisionNo | Int | - |  |
| recordState | String | @default("draft") |  |
| changeKind | String | @default("revision") |  |
| effectiveOn | DateTime | @db.Date |  |
| effectiveThrough | DateTime? | @db.Date |  |
| snapshotSchemaVersion | Int | @default(1) |  |
| snapshotJson | Json | - |  |
| reason | String? | - |  |
| sourceRevisionId | Int? | - |  |
| supersededByRevisionId | Int? | @unique |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| confirmedBy | Int? | - |  |
| confirmedAt | DateTime? | - |  |
| cancelledBy | Int? | - |  |
| cancelledAt | DateTime? | - |  |
| createIdempotencyKey | String? | @unique |  |
| createRequestFingerprint | String? | - |  |
| publishIdempotencyKey | String? | @unique |  |
| publishRequestFingerprint | String? | - |  |
| contract | Contract | @relation("ContractRevisions", fields: [contractId], references: [id], onDelete: Cascade) |  |
| currentForContract | Contract? | @relation("ContractCurrentRevision") |  |
| sourceRevision | ContractRevision? | @relation("ContractRevisionSource", fields: [sourceRevisionId], references: [id], onDelete: SetNull) |  |
| derivedRevisions | ContractRevision[] | @relation("ContractRevisionSource") |  |
| supersededByRevision | ContractRevision? | @relation("ContractRevisionSupersession", fields: [supersededByRevisionId], references: [id], onDelete: SetNull) |  |
| supersededRevisions | ContractRevision[] | @relation("ContractRevisionSupersession") |  |
| stateEvents | ContractStateEvent[] | - |  |

### ContractStateEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| eventUid | String | @unique @default(dbgenerated("(gen_random_uuid())::text")) |  |
| contractId | Int | - |  |
| axis | String | - |  |
| eventKind | String | @default("transition") |  |
| fromState | String? | - |  |
| toState | String | - |  |
| effectiveOn | DateTime | @db.Date |  |
| recordState | String | @default("confirmed") |  |
| reason | String? | - |  |
| sourceRevisionId | Int? | - |  |
| reversesEventId | Int? | @unique |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| reversedBy | Int? | - |  |
| reversedAt | DateTime? | - |  |
| idempotencyKey | String? | @unique |  |
| requestFingerprint | String? | - |  |
| contract | Contract | @relation(fields: [contractId], references: [id], onDelete: Cascade) |  |
| sourceRevision | ContractRevision? | @relation(fields: [sourceRevisionId], references: [id], onDelete: SetNull) |  |
| reversesEvent | ContractStateEvent? | @relation("ContractStateEventReversal", fields: [reversesEventId], references: [id], onDelete: Restrict) |  |
| reversedByEvent | ContractStateEvent? | @relation("ContractStateEventReversal") |  |

### ContractCategory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| name | String | @unique |  |
| isActive | Boolean | @default(true) |  |
| sortOrder | Int | @default(0) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| contracts | Contract[] | - |  |

### Contract

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| contractUid | String | @unique @default(uuid()) |  |
| contractNo | String? | - |  |
| name | String | - |  |
| partyA | String? | - |  |
| partyB | String? | - |  |
| shareholder | String? | - |  |
| categoryId | Int | - |  |
| content | String? | - |  |
| owningCompanyId | Int? | - |  |
| ownerDepartmentId | Int? | - |  |
| partyAId | Int? | - |  |
| partyBId | Int? | - |  |
| handlerEmployeeId | Int? | - |  |
| signedOn | DateTime? | @db.Date |  |
| expiresOn | DateTime? | @db.Date |  |
| signedOnPrecision | String? | - |  |
| expiresOnPrecision | String? | - |  |
| legacySignDateRaw | String? | - |  |
| legacyEndDateRaw | String? | - |  |
| lifecycleStatus | String | @default("unknown") |  |
| signatureStatus | String | @default("unknown") |  |
| performanceStatus | String | @default("unknown") |  |
| legacyStatusRaw | String? | - |  |
| amount | Decimal? | @db.Decimal(20, 2) |  |
| executedAmount | Decimal? | @db.Decimal(20, 2) |  |
| currencyCode | String | @default("CNY") |  |
| confidentialityLevel | Int | @default(2) |  |
| location | String? | - |  |
| remark | String? | - |  |
| approvalSourceKey | String? | - |  |
| approvalRecordId | String? | - |  |
| approvalRecordUrl | String? | - |  |
| approvalStatusSnapshot | String? | - |  |
| approvedOn | DateTime? | @db.Date |  |
| approvalSyncedAt | DateTime? | - |  |
| currentRevisionId | Int? | @unique |  |
| isArchived | Boolean | @default(false) |  |
| archivedAt | DateTime? | - |  |
| archivedBy | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| category | ContractCategory | @relation(fields: [categoryId], references: [id], onDelete: Restrict) |  |
| owningCompany | Company? | @relation("ContractOwningCompany", fields: [owningCompanyId], references: [id], onDelete: Restrict) |  |
| ownerDepartment | Department? | @relation("ContractOwnerDepartment", fields: [ownerDepartmentId], references: [id], onDelete: Restrict) |  |
| partyAIdentity | Party? | @relation("ContractPartyA", fields: [partyAId], references: [id], onDelete: Restrict) |  |
| partyBIdentity | Party? | @relation("ContractPartyB", fields: [partyBId], references: [id], onDelete: Restrict) |  |
| editor | User? | @relation("ContractEditor", fields: [editedBy], references: [id]) |  |
| archivedByUser | User? | @relation("ContractArchivedBy", fields: [archivedBy], references: [id]) |  |
| handlerEmployee | Employee? | @relation("ContractHandlerEmployee", fields: [handlerEmployeeId], references: [id], onDelete: Restrict) |  |
| currentRevision | ContractRevision? | @relation("ContractCurrentRevision", fields: [currentRevisionId], references: [id], onDelete: SetNull) |  |
| revisions | ContractRevision[] | @relation("ContractRevisions") |  |
| stateEvents | ContractStateEvent[] | - |  |
| attachments | ContractAttachment[] | - |  |
| records | ContractRecord[] | - |  |

### ContractAttachment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| attachmentUid | String | @unique @default(uuid()) |  |
| contractId | Int | - |  |
| kind | String | @default("signed_contract") |  |
| fileName | String | - |  |
| mimeType | String | - |  |
| originalStoragePath | String | - |  |
| originalSizeBytes | Int | - |  |
| originalChecksumSha256 | String | - |  |
| optimizedStoragePath | String? | - |  |
| optimizedSizeBytes | Int? | - |  |
| optimizedChecksumSha256 | String? | - |  |
| optimizationStatus | String | @default("not_applicable") |  |
| optimizationError | String? | - |  |
| compressionSavingsRatio | Decimal? | @db.Decimal(8, 6) |  |
| pageCount | Int? | - |  |
| note | String? | - |  |
| uploadedBy | Int? | - |  |
| uploadedAt | DateTime | @default(now()) |  |
| removedBy | Int? | - |  |
| removedAt | DateTime? | - |  |
| removalReason | String? | - |  |
| version | Int | @default(1) |  |
| contract | Contract | @relation(fields: [contractId], references: [id], onDelete: Restrict) |  |
| uploader | User? | @relation("ContractAttachmentUploader", fields: [uploadedBy], references: [id], onDelete: SetNull) |  |
| remover | User? | @relation("ContractAttachmentRemover", fields: [removedBy], references: [id], onDelete: SetNull) |  |

### ContractRecord

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| recordUid | String | @unique @default(uuid()) |  |
| contractId | Int | - |  |
| recordType | String | - |  |
| occurredOn | DateTime | @db.Date |  |
| title | String | - |  |
| content | String? | - |  |
| sourceKey | String? | - |  |
| externalRecordId | String? | - |  |
| externalUrl | String? | - |  |
| statusSnapshot | String? | - |  |
| attachmentUid | String? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| contract | Contract | @relation(fields: [contractId], references: [id], onDelete: Restrict) |  |
| creator | User? | @relation("ContractRecordCreator", fields: [createdBy], references: [id], onDelete: SetNull) |  |

### DataQualityRun

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| trigger | String | - |  |
| status | String | @default("running") |  |
| domainsJson | String | - |  |
| requestedByUserId | Int? | - |  |
| startedAt | DateTime | @default(now()) |  |
| finishedAt | DateTime? | - |  |
| checkCount | Int | @default(0) |  |
| openFindingCount | Int | @default(0) |  |
| newFindingCount | Int | @default(0) |  |
| resolvedFindingCount | Int | @default(0) |  |
| failureMessage | String? | - |  |
| requestedBy | User? | @relation("DataQualityRunRequester", fields: [requestedByUserId], references: [id], onDelete: SetNull) |  |
| lastCheckStates | DataQualityCheckState[] | @relation("DataQualityCheckLastRun") |  |
| lastFindings | DataQualityFinding[] | @relation("DataQualityFindingLastRun") |  |
| deliveries | DataQualityNotificationDelivery[] | - |  |
| evaluationRequests | DataQualityEvaluationRequest[] | - |  |

### DataQualityCheckState

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| checkKey | String | @id |  |
| providerKey | String | - |  |
| domain | String | - |  |
| title | String | - |  |
| description | String | - |  |
| defaultSeverity | String | - |  |
| triggerModesJson | String | - |  |
| lastStatus | String | @default("never") |  |
| lastFindingCount | Int | @default(0) |  |
| lastEvaluatedAt | DateTime? | - |  |
| lastRunId | Int? | - |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| lastRun | DataQualityRun? | @relation("DataQualityCheckLastRun", fields: [lastRunId], references: [id], onDelete: SetNull) |  |
| findings | DataQualityFinding[] | - |  |

### DataQualityFinding

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| fingerprint | String | @unique |  |
| checkKey | String | - |  |
| domain | String | - |  |
| severity | String | - |  |
| status | String | @default("open") |  |
| title | String | - |  |
| summary | String | - |  |
| count | Int | - |  |
| resourceKey | String? | - |  |
| href | String? | - |  |
| samplesJson | String? | - |  |
| firstSeenAt | DateTime | @default(now()) |  |
| lastSeenAt | DateTime | @default(now()) |  |
| resolvedAt | DateTime? | - |  |
| lastRunId | Int | - |  |
| lastWorkspaceNotifiedAt | DateTime? | - |  |
| lastWecomNotifiedAt | DateTime? | - |  |
| check | DataQualityCheckState | @relation(fields: [checkKey], references: [checkKey], onDelete: Restrict) |  |
| lastRun | DataQualityRun | @relation("DataQualityFindingLastRun", fields: [lastRunId], references: [id], onDelete: Restrict) |  |

### DataQualityNotificationDelivery

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| runId | Int | - |  |
| channel | String | - |  |
| destination | String | - |  |
| status | String | - |  |
| findingCount | Int | - |  |
| error | String? | - |  |
| sentAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| run | DataQualityRun | @relation(fields: [runId], references: [id], onDelete: Cascade) |  |

### DataQualityEvaluationRequest

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| domain | String | - |  |
| entityType | String | - |  |
| entityId | String | - |  |
| status | String | @default("pending") |  |
| attempts | Int | @default(0) |  |
| requestedAt | DateTime | @default(now()) |  |
| processingAt | DateTime? | - |  |
| processedAt | DateTime? | - |  |
| processedByRunId | Int? | - |  |
| lastError | String? | - |  |
| processedByRun | DataQualityRun? | @relation(fields: [processedByRunId], references: [id], onDelete: SetNull) |  |

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
| productionQcBatches | ProductionQcBatch[] | - |  |

### PartyLegalFactRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| partyId | Int | - |  |
| revision | Int | - |  |
| commandKind | String | - |  |
| effectiveOn | DateTime | @db.Date |  |
| recordState | String | @default("confirmed") |  |
| supersedesId | Int? | @unique |  |
| subjectType | String | - |  |
| name | String | - |  |
| fullName | String? | - |  |
| identityNumber | String | - |  |
| legalRepresentative | String? | - |  |
| registeredCapital | String? | - |  |
| registeredAddress | String? | - |  |
| registeredDate | String? | - |  |
| sourceRegistryChangeId | Int? | - |  |
| sourceType | String? | - |  |
| sourceLabel | String? | - |  |
| sourceReference | String? | - |  |
| reason | String? | - |  |
| idempotencyKey | String | @unique |  |
| requestFingerprint | String | - |  |
| recordedBy | Int? | - |  |
| recordedAt | DateTime | @default(now()) |  |
| party | Party | @relation(fields: [partyId], references: [id], onDelete: Restrict) |  |
| supersedes | PartyLegalFactRevision? | @relation("PartyLegalFactSupersession", fields: [supersedesId], references: [id], onDelete: Restrict) |  |
| supersededBy | PartyLegalFactRevision[] | @relation("PartyLegalFactSupersession") |  |

### Party

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| subjectType | String | @default("organization") |  |
| name | String | - |  |
| fullName | String? | - |  |
| identityNumber | String | - |  |
| legalRepresentative | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| externalProfile | ExternalPartyProfile? | - |  |
| externalRoles | ExternalPartyRole[] | - |  |
| employeeIdentityLink | EmployeePartyIdentityLink? | - |  |
| financeAuxiliaryMembers | FinanceAuxiliaryMember[] | @relation("FinanceAuxiliaryMemberLinkedParty") |  |
| nameHistory | PartyNameHistory[] | - |  |
| legalFactRevisions | PartyLegalFactRevision[] | - |  |
| company | Company? | - |  |
| ownedInterests | OwnershipInterest[] | - |  |
| shareCapitalOutflows | ShareCapitalTransaction[] | @relation("ShareCapitalTransferor") |  |
| shareCapitalInflows | ShareCapitalTransaction[] | @relation("ShareCapitalTransferee") |  |
| shareCapitalSnapshotPositions | ShareCapitalSnapshotPosition[] | - |  |
| controlledAfterCapitalEvents | ShareCapitalEvent[] | @relation("ShareCapitalEventController") |  |
| shareholderGroupMemberships | ShareholderGroupMembership[] | - |  |
| registryOwnershipParticipants | CompanyRegistryOwnershipParticipant[] | - |  |
| contractsAsPartyA | Contract[] | @relation("ContractPartyA") |  |
| contractsAsPartyB | Contract[] | @relation("ContractPartyB") |  |
| financeLoansAsLender | FinanceLoan[] | - |  |
| financeTaxAuthorities | FinanceTaxRegistration[] | - |  |
| inventoryDocuments | InventoryDocument[] | - |  |

### PartyNameHistory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| partyId | Int | - |  |
| sourceKey | String | @unique |  |
| nameKind | String | - |  |
| name | String | - |  |
| normalizedName | String | - |  |
| effectiveFrom | DateTime? | - |  |
| effectiveTo | DateTime? | - |  |
| datePrecision | String | @default("day") |  |
| recordStatus | String | @default("confirmed") |  |
| sourceObservedDate | DateTime? | - |  |
| sourceType | String? | - |  |
| sourceLabel | String? | - |  |
| sourceReference | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| party | Party | @relation(fields: [partyId], references: [id], onDelete: Cascade) |  |

### ExternalPartyProfile

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| partyId | Int | @id |  |
| relatedPartyType | String | @default("unrelated") |  |
| party | Party | @relation(fields: [partyId], references: [id], onDelete: Cascade) |  |

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
| availabilityVersion | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| party | Party | @relation(fields: [partyId], references: [id], onDelete: Restrict) |  |
| financeShipments | FinanceShipment[] | - |  |
| sourceMappings | ExternalPartySourceMapping[] | - |  |
| availabilityPeriods | ExternalPartyRolePeriod[] | - |  |

### ExternalPartyRolePeriod

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| roleId | Int | - |  |
| sequence | Int | - |  |
| validFrom | String? | - |  |
| validThrough | String? | - |  |
| recordState | String | @default("confirmed") |  |
| commandKind | String | - |  |
| supersedesId | Int? | @unique |  |
| idempotencyKey | String | @unique |  |
| requestFingerprint | String | - |  |
| reason | String? | - |  |
| recordedBy | Int? | - |  |
| recordedAt | DateTime | @default(now()) |  |
| role | ExternalPartyRole | @relation(fields: [roleId], references: [id], onDelete: Restrict) |  |
| supersedes | ExternalPartyRolePeriod? | @relation("ExternalPartyRolePeriodSupersession", fields: [supersedesId], references: [id], onDelete: Restrict) |  |
| supersededBy | ExternalPartyRolePeriod[] | @relation("ExternalPartyRolePeriodSupersession") |  |

### ExternalPartySourceMapping

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| roleId | Int | - |  |
| companyId | Int | - |  |
| sourceSystem | String | - |  |
| sourceKey | String | - |  |
| sourceCode | String? | - |  |
| sourceName | String | - |  |
| sourceNameNormalized | String | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceData | Json? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| role | ExternalPartyRole | @relation(fields: [roleId], references: [id], onDelete: Cascade) |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceAssetCategory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| assetKind | String | - |  |
| defaultUsefulLifeMonths | Int? | - |  |
| defaultResidualRate | Decimal? | @db.Decimal(10, 6) |  |
| defaultMethod | String | @default("straight_line") |  |
| depreciable | Boolean | @default(true) |  |
| reviewStatus | String | @default("confirmed") |  |
| isActive | Boolean | @default(true) |  |
| sortOrder | Int | @default(0) |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| cards | FinanceAssetCard[] | - |  |
| accountPolicies | FinanceAssetCategoryPolicy[] | - |  |

### FinanceAssetCategoryPolicy

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| categoryId | Int | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| year | Int | - |  |
| assetAccountId | Int | - |  |
| accumulatedAccountId | Int? | - |  |
| expenseAccountId | Int? | - |  |
| impairmentLossAccountId | Int? | - |  |
| impairmentAllowanceAccountId | Int? | - |  |
| disposalGainLossAccountId | Int? | - |  |
| defaultUsefulLifeMonths | Int? | - |  |
| defaultResidualRate | Decimal | @db.Decimal(10, 6) |  |
| defaultMethod | String | @default("straight_line") |  |
| usefulLifeMode | String | @default("required") |  |
| minimumUsefulLifeMonths | Int? | - |  |
| maximumUsefulLifeMonths | Int? | - |  |
| reviewRequired | Boolean | @default(false) |  |
| classificationRule | String | @db.Text |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| category | FinanceAssetCategory | @relation(fields: [categoryId], references: [id], onDelete: Restrict) |  |
| assetAccount | FinanceAccount | @relation("FinanceAssetPolicyAssetAccount", fields: [assetAccountId], references: [id], onDelete: Restrict) |  |
| accumulatedAccount | FinanceAccount? | @relation("FinanceAssetPolicyAccumulatedAccount", fields: [accumulatedAccountId], references: [id], onDelete: Restrict) |  |
| expenseAccount | FinanceAccount? | @relation("FinanceAssetPolicyExpenseAccount", fields: [expenseAccountId], references: [id], onDelete: Restrict) |  |
| impairmentLossAccount | FinanceAccount? | @relation("FinanceAssetPolicyImpairmentLossAccount", fields: [impairmentLossAccountId], references: [id], onDelete: Restrict) |  |
| impairmentAllowanceAccount | FinanceAccount? | @relation("FinanceAssetPolicyImpairmentAllowanceAccount", fields: [impairmentAllowanceAccountId], references: [id], onDelete: Restrict) |  |
| disposalGainLossAccount | FinanceAccount? | @relation("FinanceAssetPolicyDisposalGainLossAccount", fields: [disposalGainLossAccountId], references: [id], onDelete: Restrict) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceAssetCard

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| assetCode | String | - |  |
| name | String | - |  |
| assetKind | String | - |  |
| categoryId | Int | - |  |
| sourceCategory | String? | - |  |
| assetAccountCode | String | - |  |
| accumulatedAccountCode | String? | - |  |
| assetAccountId | Int? | - |  |
| accumulatedAccountId | Int? | - |  |
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
| category | FinanceAssetCategory | @relation(fields: [categoryId], references: [id], onDelete: Restrict) |  |
| assetAccount | FinanceAccount? | @relation("FinanceAssetCardAssetAccount", fields: [assetAccountId], references: [id], onDelete: Restrict) |  |
| accumulatedAccount | FinanceAccount? | @relation("FinanceAssetCardAccumulatedAccount", fields: [accumulatedAccountId], references: [id], onDelete: Restrict) |  |
| costLines | FinanceAssetCostLine[] | - |  |
| allocations | FinanceAssetExpenseAllocation[] | - |  |
| periodEntries | FinanceAssetPeriodEntry[] | - |  |
| adjustments | FinanceAssetAdjustment[] | - |  |
| disposal | FinanceAssetDisposal? | - |  |
| acquisitionEvidence | FinanceAssetAcquisitionEvidence? | - |  |
| impairmentAllocations | FinanceAssetImpairmentAllocation[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceAssetAcquisitionEvidence

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| periodId | Int | - |  |
| assetId | Int | @unique |  |
| voucherItemId | Int? | - |  |
| importBatchId | Int? | - |  |
| sourceChecksum | String? | - |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| evidenceRef | String | @db.Text |  |
| confirmedBy | Int? | - |  |
| version | Int | @default(1) |  |
| confirmedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| asset | FinanceAssetCard | @relation(fields: [assetId], references: [id], onDelete: Restrict) |  |
| voucherItem | FinanceVoucherItem? | @relation("FinanceAssetAcquisitionVoucherItem", fields: [voucherItemId], references: [id], onDelete: Restrict) |  |
| importBatch | FinanceAssetImportBatch? | @relation(fields: [importBatchId], references: [id], onDelete: Restrict) |  |
| confirmer | User? | @relation("FinanceAssetAcquisitionConfirmer", fields: [confirmedBy], references: [id], onDelete: Restrict) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| expenseAccountId | Int? | - |  |
| allocationRate | Decimal | @db.Decimal(10, 6) |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| asset | FinanceAssetCard | @relation(fields: [assetId], references: [id], onDelete: Cascade) |  |
| expenseAccount | FinanceAccount? | @relation(fields: [expenseAccountId], references: [id], onDelete: Restrict) |  |

### FinanceAssetImportBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| sourceFile | String | - |  |
| checksum | String | - |  |
| status | String | @default("confirmed") |  |
| cardCount | Int | @default(0) |  |
| costLineCount | Int | @default(0) |  |
| warningCount | Int | @default(0) |  |
| importedBy | Int? | - |  |
| importedAt | DateTime | @default(now()) |  |
| note | String? | - |  |
| acquisitionEvidence | FinanceAssetAcquisitionEvidence[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
| periodId | Int | - |  |
| assetId | Int? | - |  |
| accountCode | String | - |  |
| accountId | Int? | - |  |
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
| account | FinanceAccount? | @relation(fields: [accountId], references: [id], onDelete: Restrict) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Cascade) |  |
| voucher | FinanceVoucher? | @relation(fields: [voucherId], references: [id], onDelete: SetNull) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceAssetImpairmentAssessment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| periodId | Int | - |  |
| conclusion | String | - |  |
| basis | String | @db.Text |  |
| evidenceRef | String | - |  |
| impairmentAmount | Decimal | @default(0) @db.Decimal(20, 2) |  |
| voucherId | Int? | - |  |
| assetScopeFingerprint | String | - |  |
| calculationBasisFingerprint | String | - |  |
| assetCount | Int | - |  |
| status | String | @default("confirmed") |  |
| assessedBy | Int | - |  |
| confirmedAt | DateTime | @default(now()) |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| voucher | FinanceVoucher? | @relation(fields: [voucherId], references: [id], onDelete: Restrict) |  |
| assessor | User | @relation("FinanceAssetImpairmentAssessor", fields: [assessedBy], references: [id], onDelete: Restrict) |  |
| allocations | FinanceAssetImpairmentAllocation[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceAssetImpairmentAllocation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| assessmentId | Int | - |  |
| assetId | Int | - |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| createdAt | DateTime | @default(now()) |  |
| assessment | FinanceAssetImpairmentAssessment | @relation(fields: [assessmentId], references: [id], onDelete: Cascade) |  |
| asset | FinanceAssetCard | @relation(fields: [assetId], references: [id], onDelete: Restrict) |  |

### FinanceAssetDisposal

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| periodId | Int | - |  |
| assetId | Int | @unique |  |
| disposalDate | String | - |  |
| disposalType | String | - |  |
| proceedsAmount | Decimal | @default(0) @db.Decimal(20, 2) |  |
| reason | String | @db.Text |  |
| evidenceRef | String | - |  |
| voucherId | Int | - |  |
| assetVoucherItemId | Int? | @unique |  |
| accumulatedVoucherItemId | Int? | @unique |  |
| impairmentAllowanceVoucherItemId | Int? | @unique |  |
| proceedsVoucherItemId | Int? | @unique |  |
| gainLossVoucherItemId | Int? | @unique |  |
| status | String | @default("confirmed") |  |
| confirmedBy | Int | - |  |
| version | Int | @default(1) |  |
| confirmedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| asset | FinanceAssetCard | @relation(fields: [assetId], references: [id], onDelete: Restrict) |  |
| voucher | FinanceVoucher | @relation(fields: [voucherId], references: [id], onDelete: Restrict) |  |
| assetVoucherItem | FinanceVoucherItem? | @relation("FinanceAssetDisposalAssetItem", fields: [assetVoucherItemId], references: [id], onDelete: Restrict) |  |
| accumulatedVoucherItem | FinanceVoucherItem? | @relation("FinanceAssetDisposalAccumulatedItem", fields: [accumulatedVoucherItemId], references: [id], onDelete: Restrict) |  |
| impairmentAllowanceVoucherItem | FinanceVoucherItem? | @relation("FinanceAssetDisposalAllowanceItem", fields: [impairmentAllowanceVoucherItemId], references: [id], onDelete: Restrict) |  |
| proceedsVoucherItem | FinanceVoucherItem? | @relation("FinanceAssetDisposalProceedsItem", fields: [proceedsVoucherItemId], references: [id], onDelete: Restrict) |  |
| gainLossVoucherItem | FinanceVoucherItem? | @relation("FinanceAssetDisposalGainLossItem", fields: [gainLossVoucherItemId], references: [id], onDelete: Restrict) |  |
| confirmer | User | @relation("FinanceAssetDisposalConfirmer", fields: [confirmedBy], references: [id], onDelete: Restrict) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceBudgetVersion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| year | Int | - |  |
| companyId | Int? | - |  |
| companyCode | String? | - | / 导入时的公司编码快照；运行时身份以 companyId 为准 |
| name | String | - | / 版本名称，如 "2026年初预算"、"2026年调整V1" |
| status | String | - | / draft | active | archived |
| type | String | - | / dept | rd | all，表示本版本包含的预算类型 |
| sourceFile | String? | - |  |
| createdBy | Int? | - | / userId |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| deptBudgets | FinanceBudgetDept[] | - |  |
| rdBudgets | FinanceBudgetRd[] | - |  |

### FinanceBudgetDept

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| versionId | Int | - |  |
| version | FinanceBudgetVersion | @relation(fields: [versionId], references: [id], onDelete: Cascade) |  |
| year | Int | - |  |
| departmentId | Int? | - |  |
| department | Department? | @relation(fields: [departmentId], references: [id], onDelete: Restrict) |  |
| dept | String | - | / 导入原文快照；运行时部门身份以 departmentId 为准 |
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
| projectId | Int? | - |  |
| projectRef | Project? | @relation(fields: [projectId], references: [id], onDelete: Restrict) |  |
| project | String | - | / 导入原文快照；运行时项目身份以 projectId 为准 |
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
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceCashFlowAllocation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
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
| consolidationEntryLines | FinanceConsolidationEntryLine[] | - |  |
| statementAdjustment | FinanceCashFlowAllocationAdjustment? | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceCashFlowAllocationAdjustment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| allocationId | Int | @unique |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| sourceLineCode | String | - |  |
| targetLineCode | String | - |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| enabled | Boolean | @default(true) |  |
| sourceType | String | @default("reference_workpaper") |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| allocation | FinanceCashFlowAllocation | @relation(fields: [allocationId], references: [id], onDelete: Cascade) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceCloseRun

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int | - |  |
| periodId | Int | - |  |
| startedByUserId | Int | - |  |
| status | String | @default("open") |  |
| openedAt | DateTime | @default(now()) |  |
| completedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| startedByUser | User | @relation(fields: [startedByUserId], references: [id], onDelete: Restrict) |  |
| tasks | FinanceCloseTask[] | - |  |
| events | FinanceCloseEvent[] | - |  |

### FinanceCloseTask

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| runId | Int | - |  |
| taskKey | String | - |  |
| contributorKey | String | - |  |
| assigneeEmployeeId | Int? | - |  |
| ownerResourceKey | String | - |  |
| label | String | - |  |
| status | String | @default("pending") |  |
| contributorVersion | String? | - |  |
| inputFingerprint | String? | - |  |
| deepLink | String | - |  |
| inspectedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| run | FinanceCloseRun | @relation(fields: [runId], references: [id], onDelete: Restrict) |  |
| assigneeEmployee | Employee? | @relation(fields: [assigneeEmployeeId], references: [id], onDelete: Restrict) |  |
| evidenceSnapshots | FinanceCloseEvidenceSnapshot[] | - |  |
| events | FinanceCloseEvent[] | - |  |

### FinanceCloseEvidenceSnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| taskId | Int | - |  |
| inputFingerprint | String | - |  |
| payloadSha256 | String | - |  |
| contributorVersion | String | - |  |
| payload | Json | - |  |
| capturedAt | DateTime | @default(now()) |  |
| task | FinanceCloseTask | @relation(fields: [taskId], references: [id], onDelete: Restrict) |  |
| events | FinanceCloseEvent[] | - |  |

### FinanceCloseEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| runId | Int | - |  |
| taskId | Int? | - |  |
| evidenceSnapshotId | Int? | - |  |
| actorUserId | Int | - |  |
| eventKind | String | - |  |
| fromStatus | String? | - |  |
| toStatus | String? | - |  |
| reason | String? | - |  |
| reversesEventId | Int? | @unique |  |
| idempotencyKey | String | @unique |  |
| requestFingerprint | String? | - |  |
| recordedAt | DateTime | @default(now()) |  |
| run | FinanceCloseRun | @relation(fields: [runId], references: [id], onDelete: Restrict) |  |
| task | FinanceCloseTask? | @relation(fields: [taskId], references: [id], onDelete: Restrict) |  |
| evidenceSnapshot | FinanceCloseEvidenceSnapshot? | @relation(fields: [evidenceSnapshotId], references: [id], onDelete: Restrict) |  |
| actorUser | User | @relation(fields: [actorUserId], references: [id], onDelete: Restrict) |  |
| reversesEvent | FinanceCloseEvent? | @relation("FinanceCloseEventReversal", fields: [reversesEventId], references: [id], onDelete: Restrict) |  |
| reversedByEvent | FinanceCloseEvent? | @relation("FinanceCloseEventReversal") |  |

### FinanceCloseWorkpaper

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int | - |  |
| periodId | Int | - |  |
| taskKey | String | - |  |
| status | String | @default("draft") | draft | prepared | reviewed | blocked |
| conclusion | String? | - |  |
| evidenceRefs | Json | @default("[]") |  |
| voucherRefs | Json | @default("[]") |  |
| preparedByUserId | Int? | - |  |
| preparedAt | DateTime? | - |  |
| reviewedByUserId | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| preparedBy | User? | @relation("FinanceCloseWorkpaperPreparer", fields: [preparedByUserId], references: [id], onDelete: Restrict) |  |
| reviewedBy | User? | @relation("FinanceCloseWorkpaperReviewer", fields: [reviewedByUserId], references: [id], onDelete: Restrict) |  |
| events | FinanceCloseWorkpaperEvent[] | - |  |

### FinanceCloseWorkpaperEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workpaperId | Int | - |  |
| actorUserId | Int | - |  |
| eventKind | String | - |  |
| fromStatus | String? | - |  |
| toStatus | String | - |  |
| snapshot | Json | - |  |
| idempotencyKey | String | @unique |  |
| requestFingerprint | String | - |  |
| recordedAt | DateTime | @default(now()) |  |
| workpaper | FinanceCloseWorkpaper | @relation(fields: [workpaperId], references: [id], onDelete: Restrict) |  |
| actor | User | @relation(fields: [actorUserId], references: [id], onDelete: Restrict) |  |

### FinanceConsolidationEntryLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| entryId | Int | - |  |
| lineNo | Int | - |  |
| entitySnapshotId | Int | - |  |
| companyId | Int | - |  |
| companyCode | String | - |  |
| statementType | String | - | balanceSheet | incomeStatement | cashFlow |
| lineCode | String | - |  |
| accountCode | String? | - |  |
| groupAccountId | Int? | - |  |
| debit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| credit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| currencyCode | String | @default("CNY") |  |
| periodBasis | String | @default("current") | current | comparative |
| note | String? | - |  |
| matchSide | String? | - | left | right |
| sourceKind | String? | - | auxiliaryBalance | openItem | cashFlowAllocation | workpaper | voucher |
| sourceId | String? | - |  |
| sourceFingerprint | String? | - |  |
| sourceAmount | Decimal? | @db.Decimal(20, 2) |  |
| sourceCurrency | String? | - |  |
| counterpartyEntitySnapshotId | Int? | - |  |
| counterpartyCompanyId | Int? | - |  |
| sourceSnapshotId | Int? | - |  |
| sourceAuxiliaryBalanceId | Int? | - |  |
| sourceOpenItemId | Int? | - |  |
| sourceCashFlowAllocationId | Int? | - |  |
| sourceVoucherItemId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| entry | FinanceConsolidationEntry | @relation(fields: [entryId], references: [id], onDelete: Cascade) |  |
| company | Company | @relation("FinanceConsolidationEntryLineCompany", fields: [companyId], references: [id], onDelete: Restrict) |  |
| counterpartyCompany | Company? | @relation("FinanceConsolidationEntryLineCounterpartyCompany", fields: [counterpartyCompanyId], references: [id], onDelete: Restrict) |  |
| entity | FinanceConsolidationEntitySnapshot | @relation("ConsolidationEntryLineEntity", fields: [entitySnapshotId], references: [id], onDelete: Restrict) |  |
| counterpartyEntity | FinanceConsolidationEntitySnapshot? | @relation("ConsolidationEntryLineCounterparty", fields: [counterpartyEntitySnapshotId], references: [id], onDelete: Restrict) |  |
| sourceSnapshot | FinanceConsolidationSourceSnapshot? | @relation(fields: [sourceSnapshotId], references: [id], onDelete: Restrict) |  |
| sourceAuxiliaryBalance | FinanceAuxiliaryBalance? | @relation(fields: [sourceAuxiliaryBalanceId], references: [id], onDelete: Restrict) |  |
| sourceOpenItem | FinanceOpenItem? | @relation(fields: [sourceOpenItemId], references: [id], onDelete: Restrict) |  |
| sourceCashFlowAllocation | FinanceCashFlowAllocation? | @relation(fields: [sourceCashFlowAllocationId], references: [id], onDelete: Restrict) |  |
| sourceVoucherItem | FinanceVoucherItem? | @relation(fields: [sourceVoucherItemId], references: [id], onDelete: Restrict) |  |
| groupAccount | FinanceGroupAccount? | @relation(fields: [groupAccountId], references: [id], onDelete: Restrict) |  |

### FinanceConsolidationMatchGroup

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| entryId | Int? | @unique |  |
| category | String | - | investmentEquity | intercompanyBalance |
| status | String | - | matched | difference | unresolved | accepted | rejected |
| leftEntitySnapshotId | Int | - |  |
| rightEntitySnapshotId | Int? | - |  |
| matchingRule | String | - |  |
| matchingVersion | String | - |  |
| matchedAmount | Decimal | @default(0) @db.Decimal(20, 2) |  |
| differenceAmount | Decimal | @default(0) @db.Decimal(20, 2) |  |
| differenceResolution | String? | - |  |
| generationKey | String | - |  |
| sourceFingerprint | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |
| entry | FinanceConsolidationEntry? | @relation(fields: [entryId], references: [id], onDelete: SetNull) |  |
| leftEntity | FinanceConsolidationEntitySnapshot | @relation("ConsolidationMatchGroupLeftEntity", fields: [leftEntitySnapshotId], references: [id], onDelete: Restrict) |  |
| rightEntity | FinanceConsolidationEntitySnapshot? | @relation("ConsolidationMatchGroupRightEntity", fields: [rightEntitySnapshotId], references: [id], onDelete: Restrict) |  |
| sources | FinanceConsolidationMatchSource[] | - |  |

### FinanceConsolidationMatchSource

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| matchGroupId | Int | - |  |
| entitySnapshotId | Int | - |  |
| counterpartyEntitySnapshotId | Int? | - |  |
| sourceKind | String | @default("voucher") | voucher | auxiliaryBalance |
| voucherItemId | Int? | - |  |
| auxiliaryBalanceId | Int? | - |  |
| matchSide | String | - | left | right |
| sourceAmount | Decimal | @db.Decimal(20, 2) |  |
| allocatedAmount | Decimal | @db.Decimal(20, 2) |  |
| currencyCode | String | @default("CNY") |  |
| sourceFingerprint | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| matchGroup | FinanceConsolidationMatchGroup | @relation(fields: [matchGroupId], references: [id], onDelete: Cascade) |  |
| entity | FinanceConsolidationEntitySnapshot | @relation("ConsolidationMatchSourceEntity", fields: [entitySnapshotId], references: [id], onDelete: Restrict) |  |
| counterpartyEntity | FinanceConsolidationEntitySnapshot? | @relation("ConsolidationMatchSourceCounterparty", fields: [counterpartyEntitySnapshotId], references: [id], onDelete: Restrict) |  |
| voucherItem | FinanceVoucherItem? | @relation(fields: [voucherItemId], references: [id], onDelete: Restrict) |  |
| auxiliaryBalance | FinanceAuxiliaryBalance? | @relation(fields: [auxiliaryBalanceId], references: [id], onDelete: Restrict) |  |

### FinanceVoucherCompanyMappingRule

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| purpose | String | - | investmentInvestee |
| sourceCompanyCode | String | - |  |
| sourceCompanyId | Int? | - |  |
| linkedCompanyId | Int | - |  |
| voucherDate | String? | - |  |
| voucherNo | String? | - |  |
| matchText | String? | - |  |
| matchingPolicy | String | @default("direct") | direct；历史 aggregateCnyMirror 值仅用于识别被投资方，不参与金额折算 |
| priority | Int | @default(100) |  |
| evidence | String | - |  |
| isActive | Boolean | @default(true) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| sourceCompany | Company? | @relation("FinanceVoucherCompanyMappingRuleSourceCompany", fields: [sourceCompanyId], references: [id], onDelete: Restrict) |  |
| linkedCompany | Company | @relation(fields: [linkedCompanyId], references: [id], onDelete: Restrict) |  |

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

### FinanceCompanyCurrencyPolicy

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int | @unique |  |
| functionalCurrency | String | - |  |
| source | String | - |  |
| evidence | String | - |  |
| effectiveFrom | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceConsolidationScopeSelection

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| parentCompanyId | Int | - |  |
| year | Int | - |  |
| month | Int | - |  |
| periodKind | String | @default("month") |  |
| companyId | Int | - |  |
| relationId | Int | - |  |
| relationVersion | Int | - |  |
| included | Boolean | - |  |
| selectedBy | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| parentCompany | Company | @relation("FinanceConsolidationScopeParentCompany", fields: [parentCompanyId], references: [id], onDelete: Restrict) |  |
| company | Company | @relation("FinanceConsolidationScopeCompany", fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceConsolidationBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| parentCompanyId | Int | - |  |
| parentCompanyCode | String | - |  |
| parentCompanyName | String | - |  |
| year | Int | - |  |
| month | Int | - |  |
| periodKind | String | @default("month") | year | quarter | month；既有批次均按月迁移 |
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
| parentCompany | Company | @relation("FinanceConsolidationBatchParentCompany", fields: [parentCompanyId], references: [id], onDelete: Restrict) |  |
| baseBatch | FinanceConsolidationBatch? | @relation("FinanceConsolidationBatchVersionChain", fields: [baseBatchId], references: [id], onDelete: Restrict) |  |
| derivedBatches | FinanceConsolidationBatch[] | @relation("FinanceConsolidationBatchVersionChain") |  |
| entities | FinanceConsolidationEntitySnapshot[] | - |  |
| sources | FinanceConsolidationSourceSnapshot[] | - |  |
| exchangeRates | FinanceConsolidationRateSnapshot[] | - |  |
| entries | FinanceConsolidationEntry[] | - |  |
| controlDecisions | FinanceConsolidationControlDecision[] | - |  |
| events | FinanceConsolidationBatchEvent[] | - |  |
| outputSnapshot | FinanceConsolidationOutputSnapshot? | - |  |
| matchGroups | FinanceConsolidationMatchGroup[] | - |  |

### FinanceConsolidationBatchEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| eventType | String | - | lifecycle | mutation |
| action | String | - | create | submit | return | review | lock | publish | entry.* | taxEffect.delete |
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
| decision | String | - | completed | requiresReview | notApplicable |
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
| company | Company | @relation("FinanceConsolidationEntityCompany", fields: [companyId], references: [id], onDelete: Restrict) |  |
| directParentCompany | Company? | @relation("FinanceConsolidationEntityDirectParentCompany", fields: [directParentCompanyId], references: [id], onDelete: Restrict) |  |
| sources | FinanceConsolidationSourceSnapshot[] | - |  |
| taxEffects | FinanceConsolidationTaxEffect[] | - |  |
| entryLines | FinanceConsolidationEntryLine[] | @relation("ConsolidationEntryLineEntity") |  |
| counterpartyEntryLines | FinanceConsolidationEntryLine[] | @relation("ConsolidationEntryLineCounterparty") |  |
| leftMatchGroups | FinanceConsolidationMatchGroup[] | @relation("ConsolidationMatchGroupLeftEntity") |  |
| rightMatchGroups | FinanceConsolidationMatchGroup[] | @relation("ConsolidationMatchGroupRightEntity") |  |
| matchSources | FinanceConsolidationMatchSource[] | @relation("ConsolidationMatchSourceEntity") |  |
| counterpartyMatchSources | FinanceConsolidationMatchSource[] | @relation("ConsolidationMatchSourceCounterparty") |  |

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
| matchedEntryLines | FinanceConsolidationEntryLine[] | - |  |

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
| recordedBy | Int? | - |  |
| recordedAt | DateTime? | - |  |
| applications | Json | @default("[]") |  |
| createdAt | DateTime | @default(now()) |  |
| batch | FinanceConsolidationBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |

### FinanceConsolidationEntry

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| entryNo | String | - |  |
| postingDate | String | - |  |
| documentType | String | @default("groupAdjustment") | groupAdjustment | elimination | reclassification | allocation |
| postingLevel | String | @default("20") | 10 单边调整 | 20 双边抵销 | 30 集团层调整 |
| entryType | String | - | groupAdjustment | investmentEquity | reclassification | nonControllingInterest | intercompanyBalance | internalTrading | internalLongTermAsset | incomeDividend | cashFlow |
| title | String | - |  |
| description | String? | - |  |
| evidence | String | - |  |
| matchDifference | Decimal? | @db.Decimal(20, 2) |  |
| differenceResolution | String? | - |  |
| origin | String | @default("manual") | manual | system |
| generationKey | String? | - |  |
| generationFingerprint | String? | - |  |
| generatedAt | DateTime? | - |  |
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
| matchGroup | FinanceConsolidationMatchGroup? | - |  |

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
| customerId | Int? | - |  |
| productId | Int? | - |  |
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
| salesChannel | String | @default("unknown") |  |
| salespersonName | String? | - |  |
| employeeId | Int? | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| employee | Employee? | @relation(fields: [employeeId], references: [id], onDelete: Restrict) |  |
| customer | ExternalPartyRole? | @relation(fields: [customerId], references: [id], onDelete: Restrict) |  |
| product | InventoryItem? | @relation(fields: [productId], references: [id], onDelete: Restrict) |  |
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
| salesChannel | String | @default("unknown") |  |
| salespersonName | String? | - |  |
| employeeId | Int? | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| employee | Employee? | @relation(fields: [employeeId], references: [id], onDelete: Restrict) |  |
| import | FinanceDataImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceCostStructureRow

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| productId | Int? | - |  |
| receiptReportId | Int? | - |  |
| year | Int | - |  |
| month | Int? | - |  |
| productStatus | String? | - |  |
| productName | String? | - |  |
| workHours | Float? | - |  |
| rawMaterials | Float? | - |  |
| packagingMaterials | Float? | - |  |
| directLaborWage | Float? | - |  |
| directLaborSocialSecurity | Float? | - |  |
| directLaborWelfare | Float? | - |  |
| auxiliaryLaborWage | Float? | - |  |
| auxiliaryLaborSocialSecurity | Float? | - |  |
| auxiliaryLaborWelfare | Float? | - |  |
| utilities | Float? | - |  |
| depreciationDirect | Float? | - |  |
| depreciationAuxiliary | Float? | - |  |
| otherManufacturingCost | Float? | - |  |
| quantity | Float? | - |  |
| unit | String? | - |  |
| sourceFile | String | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| import | FinanceDataImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |
| product | InventoryItem? | @relation(fields: [productId], references: [id], onDelete: Restrict) |  |
| receiptReport | InventoryReceiptReport? | @relation(fields: [receiptReportId], references: [id], onDelete: Restrict) |  |

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
| productId | Int? | - |  |
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
| product | Product? | @relation(fields: [productId], references: [id], onDelete: Restrict) |  |
| employee | Employee? | @relation(fields: [employeeId], references: [id]) |  |
| import | FinanceDataImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceAuxiliaryMember

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
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
| linkedCompanyId | Int? | - |  |
| linkedEmployeeId | Int? | - |  |
| linkedPartyId | Int? | - |  |
| companyLinkMethod | String? | - |  |
| companyLinkEvidence | String? | - |  |
| identityLinkMethod | String? | - |  |
| identityLinkEvidence | String? | - |  |
| identityLinkedAt | DateTime? | - |  |
| identityLinkedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| latestImport | FinanceLedgerImport? | @relation(fields: [latestImportId], references: [id]) |  |
| company | Company? | @relation("FinanceAuxiliaryMemberOwnerCompany", fields: [companyId], references: [id], onDelete: Restrict) |  |
| linkedCompany | Company? | @relation("FinanceAuxiliaryMemberLinkedCompany", fields: [linkedCompanyId], references: [id], onDelete: Restrict) |  |
| linkedEmployee | Employee? | @relation("FinanceAuxiliaryMemberLinkedEmployee", fields: [linkedEmployeeId], references: [id], onDelete: Restrict) |  |
| linkedParty | Party? | @relation("FinanceAuxiliaryMemberLinkedParty", fields: [linkedPartyId], references: [id], onDelete: Restrict) |  |
| voucherLinks | FinanceVoucherItemAuxiliary[] | - |  |
| balanceLinks | FinanceAuxiliaryBalanceMember[] | - |  |
| openItemLinks | FinanceOpenItemAuxiliary[] | - |  |
| counterpartyClassifications | FinanceCounterpartyClassification[] | - |  |

### FinanceCounterpartyClassification

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| memberId | Int | - |  |
| accountId | Int | - |  |
| counterpartyType | String | - |  |
| classificationMethod | String | - |  |
| classificationEvidence | String | - |  |
| lockedAt | DateTime | @default(now()) |  |
| createdAt | DateTime | @default(now()) |  |
| member | FinanceAuxiliaryMember | @relation(fields: [memberId], references: [id], onDelete: Cascade) |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id], onDelete: Cascade) |  |

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
| companyId | Int? | - |  |
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
| consolidationEntryLines | FinanceConsolidationEntryLine[] | - |  |
| consolidationMatchSources | FinanceConsolidationMatchSource[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
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
| originType | String? | - |  |
| sourcePeriodBeginDetailId | String? | - |  |
| agingBaseDate | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |
| period | FinancePeriod? | @relation(fields: [periodId], references: [id]) |  |
| account | FinanceAccount? | @relation(fields: [accountId], references: [id]) |  |
| voucherItem | FinanceVoucherItem? | @relation(fields: [voucherItemId], references: [id]) |  |
| members | FinanceOpenItemAuxiliary[] | - |  |
| settlements | FinanceOpenItemSettlement[] | - |  |
| consolidationEntryLines | FinanceConsolidationEntryLine[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceOpenItemSettlement

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| openItemId | Int | - |  |
| settlementDate | String | - |  |
| settlementType | String | @default("manual") |  |
| referenceNo | String? | - |  |
| settledDebit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| settledCredit | Decimal | @default(0) @db.Decimal(20, 2) |  |
| currencyCode | String? | - |  |
| note | String? | - |  |
| sourceSystem | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceKey | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| openItem | FinanceOpenItem | @relation(fields: [openItemId], references: [id], onDelete: Cascade) |  |

### FinanceOpenItemAuxiliary

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| openItemId | Int | - |  |
| memberId | Int | - |  |
| sourceRole | String | - |  |
| openItem | FinanceOpenItem | @relation(fields: [openItemId], references: [id], onDelete: Cascade) |  |
| member | FinanceAuxiliaryMember | @relation(fields: [memberId], references: [id]) |  |

### FinanceGroupAccount

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| category | String | - |  |
| balanceDirection | String | - |  |
| mnemonicCode | String? | - |  |
| currency | String? | - |  |
| subjectLevel | Int? | - |  |
| parentId | Int? | - |  |
| sourceKind | String | - | reference_seed | suggested | manual |
| reviewStatus | String | @default("confirmed") | confirmed | reviewed | pending_review | pending_delete |
| reviewedBy | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| originCompanyCode | String? | - |  |
| originCompanyId | Int? | - |  |
| originSourceScopeKey | String? | - |  |
| originLocalAccountCode | String? | - |  |
| isActive | Boolean | @default(true) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| parent | FinanceGroupAccount? | @relation("FinanceGroupAccountHierarchy", fields: [parentId], references: [id]) |  |
| children | FinanceGroupAccount[] | @relation("FinanceGroupAccountHierarchy") |  |
| mappings | FinanceGroupAccountMapping[] | - |  |
| revisions | FinanceGroupAccountRevision[] | @relation("FinanceGroupAccountRevisionAccount") |  |
| parentOfRevisions | FinanceGroupAccountRevision[] | @relation("FinanceGroupAccountRevisionParent") |  |
| sourceReclassRules | FinanceReclassRule[] | @relation("FinanceReclassRuleSourceGroupAccount") |  |
| targetReclassRules | FinanceReclassRule[] | @relation("FinanceReclassRuleTargetGroupAccount") |  |
| sourceReclassAdjustments | FinanceBalanceReclassAdjustment[] | @relation("FinanceBalanceReclassSourceGroupAccount") |  |
| targetReclassAdjustments | FinanceBalanceReclassAdjustment[] | @relation("FinanceBalanceReclassTargetGroupAccount") |  |
| consolidationRuleSelectors | FinanceConsolidationRuleSelector[] | - |  |
| consolidationEntryLines | FinanceConsolidationEntryLine[] | - |  |
| originCompany | Company? | @relation(fields: [originCompanyId], references: [id], onDelete: Restrict) |  |

### FinanceAccountingPolicyVersion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| versionNo | Int | @unique |  |
| code | String | @unique |  |
| name | String | - |  |
| effectiveFrom | DateTime? | @db.Date |  |
| effectiveTo | DateTime? | @db.Date |  |
| status | String | @default("published") |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| revisions | FinanceGroupAccountRevision[] | - |  |
| mappings | FinanceGroupAccountMapping[] | - |  |
| reclassRules | FinanceReclassRule[] | - |  |
| reclassAdjustments | FinanceBalanceReclassAdjustment[] | - |  |
| consolidationRules | FinanceConsolidationRule[] | - |  |

### FinanceGroupAccountRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| policyVersionId | Int | - |  |
| groupAccountId | Int | - |  |
| code | String | - |  |
| name | String | - |  |
| category | String | - |  |
| balanceDirection | String | - |  |
| mnemonicCode | String? | - |  |
| currency | String? | - |  |
| subjectLevel | Int? | - |  |
| parentGroupAccountId | Int? | - |  |
| isActive | Boolean | @default(true) |  |
| reviewStatus | String | @default("confirmed") | confirmed | reviewed | pending_review | pending_delete |
| reviewedBy | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| consolidationRole | String | @default("none") | none | intercompanyReceivable | intercompanyPayable | intercompanyRevenue | intercompanyExpense | investmentInSubsidiary | shareCapital | capitalReserve | dividendReceivable | dividendPayable | inventory | fixedAsset | cashFlow | difference |
| counterpartyRequirement | String | @default("none") | none | optional | required |
| movementType | String | @default("closingBalance") | closingBalance | periodMovement | transaction |
| translationRateType | String | @default("closing") | closing | average | historical | transactionDate |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| policyVersion | FinanceAccountingPolicyVersion | @relation(fields: [policyVersionId], references: [id], onDelete: Restrict) |  |
| groupAccount | FinanceGroupAccount | @relation("FinanceGroupAccountRevisionAccount", fields: [groupAccountId], references: [id], onDelete: Restrict) |  |
| parentGroupAccount | FinanceGroupAccount? | @relation("FinanceGroupAccountRevisionParent", fields: [parentGroupAccountId], references: [id], onDelete: Restrict) |  |

### FinanceConsolidationRule

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| policyVersionId | Int | - |  |
| ruleCode | String | - |  |
| name | String | - |  |
| ruleType | String | - | intercompanyBalance | investmentEquity | intercompanyRevenueExpense | intercompanyDividend | inventoryProfit | fixedAssetProfit | internalCashFlow | manualReclassification |
| dataBasis | String | - | closingBalance | periodMovement | voucher | openItem |
| matchMode | String | - | partnerAggregate | ownershipChain | documentReference | manual |
| amountMode | String | - | lowerOfTwoSides | fullSource | netChange | fixed |
| postingSide | String | @default("both") | both | leading | partner |
| differenceHandling | String | @default("exception") | exception | postToDifferenceAccount | carryForward |
| toleranceAmount | Decimal | @default(0) @db.Decimal(20, 2) |  |
| currencyRateType | String | @default("source") | source | closing | average | historical | transactionDate |
| enabled | Boolean | @default(true) |  |
| priority | Int | @default(100) |  |
| sourceKind | String | @default("manual") | systemDefault | manual |
| note | String? | - |  |
| createdBy | Int? | - |  |
| updatedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| policyVersion | FinanceAccountingPolicyVersion | @relation(fields: [policyVersionId], references: [id], onDelete: Restrict) |  |
| selectors | FinanceConsolidationRuleSelector[] | - |  |

### FinanceConsolidationRuleSelector

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| ruleId | Int | - |  |
| side | String | - | left | right | difference |
| sequence | Int | - |  |
| selectorType | String | - | role | groupAccount |
| consolidationRole | String? | - |  |
| groupAccountId | Int? | - |  |
| includeChildren | Boolean | @default(true) |  |
| createdAt | DateTime | @default(now()) |  |
| rule | FinanceConsolidationRule | @relation(fields: [ruleId], references: [id], onDelete: Cascade) |  |
| groupAccount | FinanceGroupAccount? | @relation(fields: [groupAccountId], references: [id], onDelete: Restrict) |  |

### FinanceGroupAccountMapping

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| policyVersionId | Int | - |  |
| groupAccountId | Int? | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| sourceScopeKey | String | - |  |
| sourceSystem | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceLedger | String? | - |  |
| localAccountCode | String | - |  |
| localAccountName | String | - |  |
| localAccountId | Int? | - |  |
| localCategory | String | - |  |
| localBalanceDirection | String | - |  |
| latestYear | Int? | - |  |
| mappingMethod | String | - | unmatched | reference_seed | exact_code_name | exact_name | suggested | hierarchy_match | manual_override |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| policyVersion | FinanceAccountingPolicyVersion | @relation(fields: [policyVersionId], references: [id], onDelete: Restrict) |  |
| groupAccount | FinanceGroupAccount? | @relation(fields: [groupAccountId], references: [id], onDelete: Restrict) |  |
| localAccount | FinanceAccount? | @relation(fields: [localAccountId], references: [id], onDelete: Restrict) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceReadableSourcePackage

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| packageKey | String | @unique |  |
| archiveRevision | String | - |  |
| sourceSystem | String | - |  |
| sourcePath | String | - |  |
| snapshotDate | String | - |  |
| cutoffDate | String | - |  |
| isAccountingClose | Boolean | - |  |
| previousSnapshot | String? | - |  |
| sourceMapChecksum | String | - |  |
| manifestChecksum | String | - |  |
| validationChecksum | String | - |  |
| selectedDatabaseChecksum | String | - |  |
| validationStatus | String | - |  |
| manifestEntryCount | Int | - |  |
| validatedTableCount | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| imports | FinanceLedgerImport[] | - |  |
| runs | FinanceReadableImportRun[] | - |  |

### FinanceReadableImportRun

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| runKey | String | @unique |  |
| ledgerImportId | Int | - |  |
| sourcePackageId | Int | - |  |
| status | String | - |  |
| controlJson | Json? | - |  |
| errorMessage | String? | - |  |
| startedAt | DateTime | @default(now()) |  |
| completedAt | DateTime? | - |  |
| ledgerImport | FinanceLedgerImport | @relation(fields: [ledgerImportId], references: [id], onDelete: Cascade) |  |
| sourcePackage | FinanceReadableSourcePackage | @relation(fields: [sourcePackageId], references: [id], onDelete: Restrict) |  |

### FinanceSourceLedgerMapping

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| sourceSystem | String | - |  |
| sourceLedger | String | - |  |
| sourceName | String | - |  |
| mappingMode | String | - | recurring | historical |
| effectiveFromYear | Int | - |  |
| effectiveToYear | Int? | - |  |
| successorSourceSystem | String? | - |  |
| successorSourceLedger | String? | - |  |
| baseCurrencyCode | String? | - |  |
| baseCurrencyName | String? | - |  |
| accountingStandard | String? | - |  |
| entityType | String? | - |  |
| evidence | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| imports | FinanceLedgerImport[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceAccountAuxiliaryRequirement

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| accountId | Int | - |  |
| importId | Int | - |  |
| dimensionType | String | - |  |
| sourceField | String | - |  |
| sourceSystem | String | - |  |
| sourceDatabase | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id], onDelete: Cascade) |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceSourcePeriodStatus

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| periodId | Int | - |  |
| sourceKey | String | - |  |
| glMonthEnd | Boolean? | - |  |
| accountingClosed | Boolean? | - |  |
| moduleStatuses | Json | - |  |
| derivationVersion | String | @default("t6-GL_mend-bflag-v2") |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Cascade) |  |

### FinanceSourceSubsystemStatus

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| sourceKey | String | - |  |
| subsystemCode | String | - |  |
| isDeleted | Boolean | - |  |
| isYearClosed | Boolean? | - |  |
| lastProcessedPeriod | Int? | - |  |
| enabledFrom | String? | - |  |
| sourceUser | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |

### FinanceAccountLineage

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| currentAccountId | Int | - |  |
| previousAccountId | Int | - |  |
| sourceSystem | String | - |  |
| sourceDatabase | String | - |  |
| sourceKey | String | - |  |
| currentYear | Int | - |  |
| previousYear | Int | - |  |
| relationType | String | @default("yearTransition") |  |
| createdAt | DateTime | @default(now()) |  |
| import | FinanceLedgerImport | @relation(fields: [importId], references: [id], onDelete: Cascade) |  |
| currentAccount | FinanceAccount | @relation("FinanceAccountLineageCurrent", fields: [currentAccountId], references: [id], onDelete: Restrict) |  |
| previousAccount | FinanceAccount | @relation("FinanceAccountLineagePrevious", fields: [previousAccountId], references: [id], onDelete: Restrict) |  |

### FinanceLedgerImport

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchKey | String? | @unique |  |
| type | String | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| year | Int | - |  |
| sourceSystem | String? | - |  |
| sourceLedger | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceFile | String? | - |  |
| sourcePath | String? | - |  |
| snapshotDate | String? | - |  |
| cutoffDate | String? | - |  |
| checksum | String? | - |  |
| sourcePackageId | Int? | - |  |
| sourceLedgerMappingId | Int? | - |  |
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
| sourcePackage | FinanceReadableSourcePackage? | @relation(fields: [sourcePackageId], references: [id], onDelete: Restrict) |  |
| sourceLedgerMapping | FinanceSourceLedgerMapping? | @relation(fields: [sourceLedgerMappingId], references: [id], onDelete: Restrict) |  |
| runs | FinanceReadableImportRun[] | - |  |
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
| accountRequirements | FinanceAccountAuxiliaryRequirement[] | - |  |
| periodStatuses | FinanceSourcePeriodStatus[] | - |  |
| subsystemStatuses | FinanceSourceSubsystemStatus[] | - |  |
| accountLineages | FinanceAccountLineage[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceSourceAccountBalance

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| importId | Int | - |  |
| periodId | Int | - |  |
| accountId | Int | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceBalanceSnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
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
| auxiliaryRequirements | FinanceAccountAuxiliaryRequirement[] | - |  |
| counterpartyClassifications | FinanceCounterpartyClassification[] | - |  |
| currentLineages | FinanceAccountLineage[] | @relation("FinanceAccountLineageCurrent") |  |
| previousLineages | FinanceAccountLineage[] | @relation("FinanceAccountLineagePrevious") |  |
| assetCategoryPolicies | FinanceAssetCategoryPolicy[] | @relation("FinanceAssetPolicyAssetAccount") |  |
| accumulatedAssetPolicies | FinanceAssetCategoryPolicy[] | @relation("FinanceAssetPolicyAccumulatedAccount") |  |
| assetExpensePolicies | FinanceAssetCategoryPolicy[] | @relation("FinanceAssetPolicyExpenseAccount") |  |
| assetImpairmentLossPolicies | FinanceAssetCategoryPolicy[] | @relation("FinanceAssetPolicyImpairmentLossAccount") |  |
| assetImpairmentAllowancePolicies | FinanceAssetCategoryPolicy[] | @relation("FinanceAssetPolicyImpairmentAllowanceAccount") |  |
| assetDisposalGainLossPolicies | FinanceAssetCategoryPolicy[] | @relation("FinanceAssetPolicyDisposalGainLossAccount") |  |
| assetCards | FinanceAssetCard[] | @relation("FinanceAssetCardAssetAccount") |  |
| accumulatedAssetCards | FinanceAssetCard[] | @relation("FinanceAssetCardAccumulatedAccount") |  |
| assetExpenseAllocations | FinanceAssetExpenseAllocation[] | - |  |
| assetAdjustments | FinanceAssetAdjustment[] | - |  |
| groupAccountMappings | FinanceGroupAccountMapping[] | - |  |
| reclassItemRuleSources | FinanceReclassItemRule[] | @relation("FinanceReclassItemRuleSourceAccount") |  |
| reclassItemRuleTargets | FinanceReclassItemRule[] | @relation("FinanceReclassItemRuleTargetAccount") |  |
| reclassHistorySources | FinanceBalanceReclassAdjustmentHistory[] | @relation("FinanceBalanceReclassHistorySourceAccount") |  |
| reclassHistoryTargets | FinanceBalanceReclassAdjustmentHistory[] | @relation("FinanceBalanceReclassHistoryTargetAccount") |  |

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
| companyId | Int? | - |  |
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
| assetImpairmentAssessments | FinanceAssetImpairmentAssessment[] | - |  |
| assetDisposals | FinanceAssetDisposal[] | - |  |
| assetAcquisitionEvidence | FinanceAssetAcquisitionEvidence[] | - |  |
| sourceStatuses | FinanceSourcePeriodStatus[] | - |  |
| bankReconciliations | FinanceBankReconciliation[] | - |  |
| interestWorkpapers | FinanceInterestWorkpaper[] | - |  |
| taxWorkpapers | FinanceTaxWorkpaper[] | - |  |
| taxFilings | FinanceTaxFiling[] | - |  |
| taxSnapshots | FinanceTaxReconciliationSnapshot[] | - |  |
| closeRuns | FinanceCloseRun[] | - |  |
| closeWorkpapers | FinanceCloseWorkpaper[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
| importId | Int? | - |  |
| sourceSystem | String? | - |  |
| sourceDatabase | String? | - |  |
| sourceKey | String? | - |  |
| voucherTypeCode | String? | - |  |
| voucherTypeName | String? | - |  |
| isAdjustment | Boolean | @default(false) |  |
| preparerName | String? | - |  |
| reviewerName | String? | - |  |
| posterName | String? | - |  |
| cashierName | String? | - |  |
| attachmentCount | Int | @default(0) |  |
| sourcePosted | Boolean? | - |  |
| sourceAudited | Boolean? | - |  |
| sourceInvalid | Boolean? | - |  |
| externalSourceSystem | String? | - |  |
| externalSourceDocumentNo | String? | - |  |
| externalSourceDocumentId | String? | - |  |
| externalSourceAccountSet | String? | - |  |
| externalSourceDate | String? | - |  |
| sourceMetadata | Json? | - |  |
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
| statementExclusions | FinanceStatementVoucherExclusion[] | - |  |
| assetPeriodEntries | FinanceAssetPeriodEntry[] | - |  |
| assetAdjustments | FinanceAssetAdjustment[] | - |  |
| assetImpairmentAssessments | FinanceAssetImpairmentAssessment[] | - |  |
| assetDisposals | FinanceAssetDisposal[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| settlementStyle | String? | - |  |
| settlementNo | String? | - |  |
| settlementDate | String? | - |  |
| sourceMetadata | Json? | - |  |
| importId | Int? | - |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |
| voucher | FinanceVoucher | @relation(fields: [voucherId], references: [id], onDelete: Cascade) |  |
| reclassResults | ReclassResult[] | - |  |
| import | FinanceLedgerImport? | @relation(fields: [importId], references: [id]) |  |
| auxiliaryLinks | FinanceVoucherItemAuxiliary[] | - |  |
| cashFlowOwnerAllocations | FinanceCashFlowAllocation[] | @relation("FinanceCashFlowOwnerItem") |  |
| cashFlowCounterpartAllocations | FinanceCashFlowAllocation[] | @relation("FinanceCashFlowCounterpartItem") |  |
| openItems | FinanceOpenItem[] | - |  |
| consolidationEntryLines | FinanceConsolidationEntryLine[] | - |  |
| consolidationMatchSources | FinanceConsolidationMatchSource[] | - |  |
| bankReconciliationItems | FinanceBankReconciliationItem[] | - |  |
| loanPrincipalEvents | FinanceLoanPrincipalEvent[] | - |  |
| interestVoucherLinks | FinanceInterestVoucherLink[] | - |  |
| taxAccrualLines | FinanceTaxAccrualLine[] | - |  |
| taxPaymentAllocations | FinanceTaxPaymentAllocation[] | - |  |
| assetAcquisitionEvidence | FinanceAssetAcquisitionEvidence? | @relation("FinanceAssetAcquisitionVoucherItem") |  |
| assetDisposalAsAssetItem | FinanceAssetDisposal? | @relation("FinanceAssetDisposalAssetItem") |  |
| assetDisposalAsAccumulatedItem | FinanceAssetDisposal? | @relation("FinanceAssetDisposalAccumulatedItem") |  |
| assetDisposalAsAllowanceItem | FinanceAssetDisposal? | @relation("FinanceAssetDisposalAllowanceItem") |  |
| assetDisposalAsProceedsItem | FinanceAssetDisposal? | @relation("FinanceAssetDisposalProceedsItem") |  |
| assetDisposalAsGainLossItem | FinanceAssetDisposal? | @relation("FinanceAssetDisposalGainLossItem") |  |

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
| companyId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id]) |  |
| account | FinanceAccount | @relation(fields: [accountId], references: [id]) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceReclassRule

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| policyVersionId | Int | - |  |
| sourceGroupAccountId | Int | - |  |
| targetGroupAccountId | Int? | - |  |
| sourceAccountCode | String | - | 规则确认时的集团科目编码快照 |
| abnormalSide | String | - | debit | credit | both |
| decision | String | @default("reclassify") | reclassify | no_reclass |
| basis | String | @default("account_net") | 计算口径：account_net = 按科目净额 | counterparty_gross = 按往来户逐户毛额 |
| targetAccountCode | String? | - | 规则确认时的集团目标科目编码快照 |
| enabled | Boolean | @default(true) |  |
| source | String | @default("manual") | 仅保留 manual；字段用于历史追溯 |
| confirmedBy | Int? | - |  |
| confirmedAt | DateTime? | - |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| policyVersion | FinanceAccountingPolicyVersion | @relation(fields: [policyVersionId], references: [id], onDelete: Restrict) |  |
| sourceGroupAccount | FinanceGroupAccount | @relation("FinanceReclassRuleSourceGroupAccount", fields: [sourceGroupAccountId], references: [id], onDelete: Restrict) |  |
| targetGroupAccount | FinanceGroupAccount? | @relation("FinanceReclassRuleTargetGroupAccount", fields: [targetGroupAccountId], references: [id], onDelete: Restrict) |  |
| confirmer | User? | @relation("FinanceReclassRuleConfirmer", fields: [confirmedBy], references: [id]) |  |
| results | ReclassResult[] | - |  |

### FinanceReclassItemRule

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| year | Int | - |  |
| sourceAccountCode | String | - |  |
| sourceAccountId | Int? | - |  |
| matchType | String | @default("exact_description") |  |
| matchValue | String | - |  |
| targetAccountCode | String | - |  |
| targetAccountId | Int? | - |  |
| enabled | Boolean | @default(true) |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| sourceAccount | FinanceAccount? | @relation("FinanceReclassItemRuleSourceAccount", fields: [sourceAccountId], references: [id], onDelete: Restrict) |  |
| targetAccount | FinanceAccount? | @relation("FinanceReclassItemRuleTargetAccount", fields: [targetAccountId], references: [id], onDelete: Restrict) |  |

### FinanceBalanceReclassAdjustment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| policyVersionId | Int | - |  |
| sourceGroupAccountId | Int? | - |  |
| targetGroupAccountId | Int? | - |  |
| periodId | Int | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| year | Int | - |  |
| sourceAccountCode | String | - |  |
| targetAccountCode | String? | - |  |
| amount | Float | - |  |
| decision | String | @default("reclassify") | reclassify | no_reclass |
| basis | String | @default("account_net") | 实际执行口径：account_net = 按科目净额 | counterparty_gross = 按往来户逐户毛额 |
| sourceType | String | @default("automatic_rule") | automatic_rule | auxiliary_balance | reference_workpaper | balance_residual | manual |
| ruleId | Int? | - |  |
| status | String | @default("approved") | approved | adjusted | rejected |
| note | String? | - |  |
| adjustedBy | Int? | - |  |
| adjustedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| policyVersion | FinanceAccountingPolicyVersion | @relation(fields: [policyVersionId], references: [id], onDelete: Restrict) |  |
| sourceGroupAccount | FinanceGroupAccount? | @relation("FinanceBalanceReclassSourceGroupAccount", fields: [sourceGroupAccountId], references: [id], onDelete: Restrict) |  |
| targetGroupAccount | FinanceGroupAccount? | @relation("FinanceBalanceReclassTargetGroupAccount", fields: [targetGroupAccountId], references: [id], onDelete: Restrict) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceBalanceReclassAdjustmentHistory

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| adjustmentIdSnapshot | Int | - |  |
| policyVersionIdSnapshot | Int? | - |  |
| sourceGroupAccountIdSnapshot | Int? | - |  |
| targetGroupAccountIdSnapshot | Int? | - |  |
| periodId | Int | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| year | Int | - |  |
| sourceAccountCode | String | - |  |
| sourceAccountId | Int? | - |  |
| targetAccountCode | String? | - |  |
| targetAccountId | Int? | - |  |
| amount | Float | - |  |
| decision | String | - |  |
| sourceType | String | - |  |
| status | String | - |  |
| ruleIdSnapshot | Int? | - |  |
| adjustedBySnapshot | Int? | - |  |
| adjustedAtSnapshot | DateTime? | - |  |
| note | String? | - |  |
| archiveReason | String | - |  |
| archivedBy | Int? | - |  |
| archivedAt | DateTime | @default(now()) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| sourceAccount | FinanceAccount? | @relation("FinanceBalanceReclassHistorySourceAccount", fields: [sourceAccountId], references: [id], onDelete: Restrict) |  |
| targetAccount | FinanceAccount? | @relation("FinanceBalanceReclassHistoryTargetAccount", fields: [targetAccountId], references: [id], onDelete: Restrict) |  |

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

### FinanceStatementVoucherExclusion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| voucherId | Int | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| statementType | String | - | balance | income | cashflow |
| enabled | Boolean | @default(true) |  |
| sourceType | String | @default("reference_workpaper") |  |
| note | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| voucher | FinanceVoucher | @relation(fields: [voucherId], references: [id], onDelete: Cascade) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| company | Company | @relation("FinanceStatementSourcePackageCompany", fields: [companyId], references: [id], onDelete: Restrict) |  |
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
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| rateKind | String | - | centralParity；历史数据可能为 closing | historicalInvestment |
| rateDate | String | - | YYYY-MM-DD |
| rate | Decimal | @db.Decimal(20, 8) | 人民币/1外币 |
| sourceName | String | @default("中国外汇交易中心") |  |
| sourceField | String | @default("人民币汇率中间价") |  |
| sourceUrl | String | - |  |
| publishedAt | DateTime? | - |  |
| capturedAt | DateTime | @default(now()) |  |
| note | String? | - |  |
| version | Int | @default(1) |  |
| updatedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### FinanceTaxFiling

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| registrationId | Int | - |  |
| periodId | Int | - |  |
| filingReference | String? | - |  |
| filedOn | DateTime? | @db.Date |  |
| status | String | @default("draft") |  |
| currencyCode | String | @db.VarChar(3) |  |
| sourceReportedDeclaredAmount | Decimal? | @db.Decimal(20, 2) |  |
| sourceReportedPayableAmount | Decimal? | @db.Decimal(20, 2) |  |
| note | String? | - |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| registration | FinanceTaxRegistration | @relation(fields: [registrationId], references: [id], onDelete: Restrict) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| paymentAllocations | FinanceTaxPaymentAllocation[] | - |  |

### FinanceTaxPayment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int | - |  |
| paymentKind | String | @default("payment") |  |
| paidOn | DateTime | @db.Date |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| currencyCode | String | @db.VarChar(3) |  |
| paymentReference | String? | - |  |
| note | String? | - |  |
| reversesPaymentId | Int? | @unique |  |
| idempotencyKey | String | @unique |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| recordedAt | DateTime | @default(now()) |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| reversesPayment | FinanceTaxPayment? | @relation("FinanceTaxPaymentReversal", fields: [reversesPaymentId], references: [id], onDelete: Restrict) |  |
| reversedByPayment | FinanceTaxPayment? | @relation("FinanceTaxPaymentReversal") |  |
| allocations | FinanceTaxPaymentAllocation[] | - |  |

### FinanceTaxPaymentAllocation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| paymentId | Int | - |  |
| filingId | Int | - |  |
| voucherItemId | Int? | - |  |
| allocatedAmount | Decimal | @db.Decimal(20, 2) |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| payment | FinanceTaxPayment | @relation(fields: [paymentId], references: [id], onDelete: Restrict) |  |
| filing | FinanceTaxFiling | @relation(fields: [filingId], references: [id], onDelete: Restrict) |  |
| voucherItem | FinanceVoucherItem? | @relation(fields: [voucherItemId], references: [id], onDelete: Restrict) |  |

### FinanceTaxReconciliationSnapshot

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| registrationId | Int | - |  |
| periodId | Int | - |  |
| status | String | - |  |
| inputFingerprint | String | - |  |
| payloadSha256 | String | - |  |
| contributorVersion | String | - |  |
| payload | Json | - |  |
| capturedAt | DateTime | @default(now()) |  |
| registration | FinanceTaxRegistration | @relation(fields: [registrationId], references: [id], onDelete: Restrict) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |

### FinanceTaxType

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| name | String | - |  |
| jurisdiction | String | - |  |
| calculationMethod | String | - |  |
| description | String? | - |  |
| isActive | Boolean | @default(true) |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| registrations | FinanceTaxRegistration[] | - |  |

### FinanceTaxRegistration

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int | - |  |
| taxTypeId | Int | - |  |
| authorityPartyId | Int? | - |  |
| registrationNo | String | - |  |
| jurisdiction | String | - |  |
| filingFrequency | String | - |  |
| effectiveFrom | DateTime | @db.Date |  |
| effectiveThrough | DateTime? | @db.Date |  |
| status | String | @default("active") |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| taxType | FinanceTaxType | @relation(fields: [taxTypeId], references: [id], onDelete: Restrict) |  |
| authorityParty | Party? | @relation(fields: [authorityPartyId], references: [id], onDelete: Restrict) |  |
| workpapers | FinanceTaxWorkpaper[] | - |  |
| filings | FinanceTaxFiling[] | - |  |
| snapshots | FinanceTaxReconciliationSnapshot[] | - |  |

### FinanceTaxWorkpaper

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| registrationId | Int | - |  |
| periodId | Int | - |  |
| status | String | @default("draft") |  |
| calculationVersion | String | - |  |
| inputFingerprint | String | - |  |
| note | String? | - |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| registration | FinanceTaxRegistration | @relation(fields: [registrationId], references: [id], onDelete: Restrict) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| accrualLines | FinanceTaxAccrualLine[] | - |  |

### FinanceTaxAccrualLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workpaperId | Int | - |  |
| voucherItemId | Int? | - |  |
| lineNo | Int | - |  |
| recognitionOn | DateTime? | @db.Date |  |
| description | String | - |  |
| taxBaseAmount | Decimal? | @db.Decimal(20, 2) |  |
| taxRate | Decimal? | @db.Decimal(18, 10) |  |
| quantity | Decimal? | @db.Decimal(20, 6) |  |
| unitRate | Decimal? | @db.Decimal(20, 6) |  |
| divisor | Decimal? | @db.Decimal(20, 6) |  |
| sourceReportedTaxAmount | Decimal? | @db.Decimal(20, 2) |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| workpaper | FinanceTaxWorkpaper | @relation(fields: [workpaperId], references: [id], onDelete: Restrict) |  |
| voucherItem | FinanceVoucherItem? | @relation(fields: [voucherItemId], references: [id], onDelete: Restrict) |  |

### FinanceBankReconciliation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| bankAccountId | Int | - |  |
| periodId | Int | - |  |
| statementDate | DateTime | @db.Date |  |
| statementEndingBalance | Decimal | @db.Decimal(20, 2) |  |
| ledgerEndingBalance | Decimal | @db.Decimal(20, 2) |  |
| status | String | @default("draft") |  |
| conclusion | String? | - |  |
| evidenceRef | String? | - |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| bankAccount | FinanceBankAccount | @relation(fields: [bankAccountId], references: [id], onDelete: Restrict) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| items | FinanceBankReconciliationItem[] | - |  |

### FinanceBankReconciliationItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| reconciliationId | Int | - |  |
| voucherItemId | Int? | - |  |
| itemKind | String | - |  |
| occurredOn | DateTime? | @db.Date |  |
| referenceNo | String? | - |  |
| description | String | - |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| clearedOn | DateTime? | @db.Date |  |
| status | String | @default("open") |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| reconciliation | FinanceBankReconciliation | @relation(fields: [reconciliationId], references: [id], onDelete: Restrict) |  |
| voucherItem | FinanceVoucherItem? | @relation(fields: [voucherItemId], references: [id], onDelete: Restrict) |  |

### FinanceInterestWorkpaper

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| loanId | Int | - |  |
| periodId | Int | - |  |
| status | String | @default("draft") |  |
| calculationVersion | String | - |  |
| inputFingerprint | String | - |  |
| note | String? | - |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| loan | FinanceLoan | @relation(fields: [loanId], references: [id], onDelete: Restrict) |  |
| period | FinancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| lines | FinanceInterestWorkpaperLine[] | - |  |
| voucherLinks | FinanceInterestVoucherLink[] | - |  |

### FinanceInterestWorkpaperLine

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workpaperId | Int | - |  |
| lineNo | Int | - |  |
| accrualFrom | DateTime | @db.Date |  |
| accrualThrough | DateTime | @db.Date |  |
| principalBasis | Decimal | @db.Decimal(20, 2) |  |
| annualRate | Decimal | @db.Decimal(18, 10) |  |
| dayCount | Int | - |  |
| sourceReportedInterestAmount | Decimal? | @db.Decimal(20, 2) |  |
| note | String? | - |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| workpaper | FinanceInterestWorkpaper | @relation(fields: [workpaperId], references: [id], onDelete: Restrict) |  |

### FinanceInterestVoucherLink

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| workpaperId | Int | - |  |
| voucherItemId | Int | - |  |
| linkKind | String | - |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| note | String? | - |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| workpaper | FinanceInterestWorkpaper | @relation(fields: [workpaperId], references: [id], onDelete: Restrict) |  |
| voucherItem | FinanceVoucherItem | @relation(fields: [voucherItemId], references: [id], onDelete: Restrict) |  |

### FinanceCurrency

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### FinanceBankAccount

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int? | - |  |
| identityKey | String? | @unique |  |
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
| openedOn | DateTime? | @db.Date |  |
| closedOn | DateTime? | @db.Date |  |
| isActive | Boolean | @default(true) |  |
| latestImportId | Int? | - |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| account | FinanceAccount? | @relation(fields: [accountId], references: [id]) |  |
| latestImport | FinanceLedgerImport? | @relation(fields: [latestImportId], references: [id]) |  |
| reconciliations | FinanceBankReconciliation[] | - |  |

### FinanceLoan

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyId | Int | - |  |
| lenderPartyId | Int | - |  |
| identityKey | String | @unique |  |
| loanNo | String | - |  |
| name | String | - |  |
| currencyCode | String | @db.VarChar(3) |  |
| contractPrincipalAmount | Decimal | @db.Decimal(20, 2) |  |
| startOn | DateTime | @db.Date |  |
| endOn | DateTime? | @db.Date |  |
| status | String | @default("active") |  |
| note | String? | - |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| lenderParty | Party | @relation(fields: [lenderPartyId], references: [id], onDelete: Restrict) |  |
| rateTerms | FinanceLoanRateTerm[] | - |  |
| principalEvents | FinanceLoanPrincipalEvent[] | - |  |
| interestWorkpapers | FinanceInterestWorkpaper[] | - |  |

### FinanceLoanRateTerm

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| loanId | Int | - |  |
| effectiveFrom | DateTime | @db.Date |  |
| effectiveThrough | DateTime? | @db.Date |  |
| annualRate | Decimal | @db.Decimal(18, 10) |  |
| spreadRate | Decimal? | @db.Decimal(18, 10) |  |
| rateKind | String | @default("fixed") |  |
| benchmark | String? | - |  |
| dayCountConvention | String | @default("actual_365") |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| createdAt | DateTime | @default(now()) |  |
| loan | FinanceLoan | @relation(fields: [loanId], references: [id], onDelete: Restrict) |  |

### FinanceLoanPrincipalEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| loanId | Int | - |  |
| voucherItemId | Int? | - |  |
| eventKind | String | - |  |
| occurredOn | DateTime | @db.Date |  |
| amount | Decimal | @db.Decimal(20, 2) |  |
| referenceNo | String? | - |  |
| note | String? | - |  |
| reversesEventId | Int? | @unique |  |
| idempotencyKey | String | @unique |  |
| sourceKind | String? | - |  |
| sourceReleaseId | String? | - |  |
| sourceSha256 | String? | - |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceRange | String? | - |  |
| sourceKey | String? | - |  |
| recordedAt | DateTime | @default(now()) |  |
| loan | FinanceLoan | @relation(fields: [loanId], references: [id], onDelete: Restrict) |  |
| voucherItem | FinanceVoucherItem? | @relation(fields: [voucherItemId], references: [id], onDelete: Restrict) |  |
| reversesEvent | FinanceLoanPrincipalEvent? | @relation("FinanceLoanPrincipalEventReversal", fields: [reversesEventId], references: [id], onDelete: Restrict) |  |
| reversedByEvent | FinanceLoanPrincipalEvent? | @relation("FinanceLoanPrincipalEventReversal") |  |

### Company

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| partyId | Int | @unique |  |
| code | String | @unique |  |
| description | String? | - |  |
| registeredCapital | String? | - |  |
| bankName | String? | - |  |
| registeredAddress | String? | - |  |
| registeredDate | String? | - |  |
| managementGroup | String | - |  |
| codePoolCode | String? | - |  |
| isActive | Boolean | @default(true) |  |
| sortOrder | Int | @default(0) |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| party | Party | @relation(fields: [partyId], references: [id], onDelete: Restrict) |  |
| issuedOwnerships | OwnershipInterest[] | - |  |
| ownershipProjectionRuns | OwnershipProjectionRun[] | - |  |
| shareCapitalEvents | ShareCapitalEvent[] | - |  |
| shareholderGroups | ShareholderGroup[] | - |  |
| registryChanges | CompanyRegistryChange[] | - |  |
| positionReportOverrides | PositionReportOverride[] | - |  |
| reportingEdps | EDP[] | @relation("EDPReportingCompany") |  |
| financeAuxiliaryMembers | FinanceAuxiliaryMember[] | @relation("FinanceAuxiliaryMemberLinkedCompany") |  |
| ownedFinanceAuxiliaryMembers | FinanceAuxiliaryMember[] | @relation("FinanceAuxiliaryMemberOwnerCompany") |  |
| financeVoucherCompanyMappingRules | FinanceVoucherCompanyMappingRule[] | - |  |
| sourceFinanceVoucherCompanyMappingRules | FinanceVoucherCompanyMappingRule[] | @relation("FinanceVoucherCompanyMappingRuleSourceCompany") |  |
| financeCurrencyPolicy | FinanceCompanyCurrencyPolicy? | - |  |
| financeBankAccounts | FinanceBankAccount[] | - |  |
| financeLoans | FinanceLoan[] | - |  |
| financeTaxRegistrations | FinanceTaxRegistration[] | - |  |
| financeTaxPayments | FinanceTaxPayment[] | - |  |
| financeCloseRuns | FinanceCloseRun[] | - |  |
| financeCloseWorkpapers | FinanceCloseWorkpaper[] | - |  |
| financeBudgetVersions | FinanceBudgetVersion[] | - |  |
| financeStatementSourcePackages | FinanceStatementSourcePackage[] | @relation("FinanceStatementSourcePackageCompany") |  |
| financeConsolidationParentBatches | FinanceConsolidationBatch[] | @relation("FinanceConsolidationBatchParentCompany") |  |
| financeConsolidationEntities | FinanceConsolidationEntitySnapshot[] | @relation("FinanceConsolidationEntityCompany") |  |
| financeConsolidationChildEntities | FinanceConsolidationEntitySnapshot[] | @relation("FinanceConsolidationEntityDirectParentCompany") |  |
| financeConsolidationEntryLines | FinanceConsolidationEntryLine[] | @relation("FinanceConsolidationEntryLineCompany") |  |
| financeConsolidationCounterparties | FinanceConsolidationEntryLine[] | @relation("FinanceConsolidationEntryLineCounterpartyCompany") |  |
| financeConsolidationParentScopes | FinanceConsolidationScopeSelection[] | @relation("FinanceConsolidationScopeParentCompany") |  |
| financeConsolidationCompanyScopes | FinanceConsolidationScopeSelection[] | @relation("FinanceConsolidationScopeCompany") |  |
| externalPartySourceMappings | ExternalPartySourceMapping[] | - |  |
| ownedContracts | Contract[] | @relation("ContractOwningCompany") |  |
| socialInsurancePeriods | EmployeeSocialInsurancePeriod[] | - |  |
| employmentRecords | Employment[] | - |  |
| financeAccountBalances | FinanceAccountBalance[] | - |  |
| financeAccounts | FinanceAccount[] | - |  |
| financeAssetAdjustments | FinanceAssetAdjustment[] | - |  |
| financeAssetCards | FinanceAssetCard[] | - |  |
| financeAssetAcquisitionEvidence | FinanceAssetAcquisitionEvidence[] | - |  |
| financeAssetCategoryPolicies | FinanceAssetCategoryPolicy[] | - |  |
| financeAssetDisposals | FinanceAssetDisposal[] | - |  |
| financeAssetImpairmentAssessments | FinanceAssetImpairmentAssessment[] | - |  |
| financeAssetImportBatches | FinanceAssetImportBatch[] | - |  |
| financeAuxiliaryBalances | FinanceAuxiliaryBalance[] | - |  |
| financeBalanceReclassAdjustments | FinanceBalanceReclassAdjustment[] | - |  |
| financeBalanceReclassAdjustmentHistories | FinanceBalanceReclassAdjustmentHistory[] | - |  |
| financeBalanceSnapshots | FinanceBalanceSnapshot[] | - |  |
| financeCashFlowAllocations | FinanceCashFlowAllocation[] | - |  |
| financeCashFlowAllocationAdjustments | FinanceCashFlowAllocationAdjustment[] | - |  |
| financeCashFlowItems | FinanceCashFlowItem[] | - |  |
| financeCurrencies | FinanceCurrency[] | - |  |
| originFinanceGroupAccounts | FinanceGroupAccount[] | - |  |
| financeGroupAccountMappings | FinanceGroupAccountMapping[] | - |  |
| financeLedgerImports | FinanceLedgerImport[] | - |  |
| financeOpenItems | FinanceOpenItem[] | - |  |
| financePeriods | FinancePeriod[] | - |  |
| financeReclassItemRules | FinanceReclassItemRule[] | - |  |
| financeSourceAccountBalances | FinanceSourceAccountBalance[] | - |  |
| financeSourceLedgerMappings | FinanceSourceLedgerMapping[] | - |  |
| financeStatementVoucherExclusions | FinanceStatementVoucherExclusion[] | - |  |
| financeStatementWorkpapers | FinanceStatementWorkpaper[] | - |  |
| financeVouchers | FinanceVoucher[] | - |  |
| inventoryDocuments | InventoryDocument[] | - |  |
| inventoryItems | InventoryItem[] | - |  |
| inventoryImportBatches | InventoryImportBatch[] | - |  |
| inventoryLedgerEntries | InventoryLedgerEntry[] | - |  |
| inventoryPeriodCloses | InventoryPeriodClose[] | - |  |
| inventoryStocktakes | InventoryStocktake[] | - |  |
| inventoryWarehouses | InventoryWarehouse[] | - |  |
| stockFinishedGoods | StockFinishedGoods[] | - |  |
| stockPackagings | StockPackaging[] | - |  |
| stockRawMaterials | StockRawMaterial[] | - |  |

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
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| positions | Position[] | - |  |
| revisions | PositionDescriptionRevision[] | @relation("PositionDescriptionRevisions") |  |
| responsibilityNodes | PositionResponsibilityNode[] | - |  |
| workResponsibilityReferences | WorkResponsibilityReference[] | @relation("WorkResponsibilityPositionDescription") |  |

### PositionDescriptionRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| revisionUid | String | @unique |  |
| positionDescriptionId | Int | - |  |
| sequence | Int | - |  |
| changeKind | String | @default("change") |  |
| supersedesRevisionId | Int? | - |  |
| positionPurpose | String? | - |  |
| summary | String? | - |  |
| headcount | Int? | - |  |
| version | String? | - |  |
| effectiveDate | String? | - |  |
| sourceFile | String | - |  |
| details | String? | - |  |
| changeReason | String? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| positionDescription | PositionDescription | @relation("PositionDescriptionRevisions", fields: [positionDescriptionId], references: [id], onDelete: Restrict) |  |
| supersedesRevision | PositionDescriptionRevision? | @relation("PositionDescriptionRevisionSupersedes", fields: [supersedesRevisionId], references: [id], onDelete: Restrict) |  |
| supersededByRevisions | PositionDescriptionRevision[] | @relation("PositionDescriptionRevisionSupersedes") |  |
| responsibilityNodes | PositionResponsibilityNode[] | - |  |

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

### EmploymentAgreement

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| agreementUid | String | @unique @default(dbgenerated("(gen_random_uuid())::text")) |  |
| employmentId | Int | - |  |
| recordState | String | @default("confirmed") |  |
| isPrimary | Boolean | @default(false) |  |
| sourceKind | String | @default("workspace") |  |
| sourceRef | String? | - |  |
| missingFieldsJson | String | @default("[]") |  |
| actualEndDate | String? | - |  |
| reason | String? | - |  |
| version | Int | @default(1) |  |
| currentPublishedRevisionId | Int? | @unique |  |
| createdBy | Int? | - |  |
| updatedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| employment | Employment | @relation(fields: [employmentId], references: [id], onDelete: Restrict) |  |
| currentPublishedRevision | EmploymentAgreementRevision? | @relation("EmploymentAgreementCurrentRevision", fields: [currentPublishedRevisionId], references: [id], onDelete: Restrict) |  |
| revisions | EmploymentAgreementRevision[] | @relation("EmploymentAgreementRevisions") |  |
| terms | EmploymentAgreementTerm[] | - |  |
| attachments | EmploymentAgreementAttachment[] | - |  |
| changes | EmploymentAgreementChange[] | @relation("EmploymentAgreementChangeAgreement") |  |

### EmploymentAgreementAttachment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| attachmentUid | String | @unique @default(uuid()) |  |
| agreementId | Int | - |  |
| fileName | String | - |  |
| mimeType | String | - |  |
| originalStoragePath | String | - |  |
| originalSizeBytes | Int | - |  |
| originalChecksumSha256 | String | - |  |
| optimizedStoragePath | String? | - |  |
| optimizedSizeBytes | Int? | - |  |
| optimizedChecksumSha256 | String? | - |  |
| optimizationStatus | String | @default("not_applicable") |  |
| optimizationError | String? | - |  |
| compressionSavingsRatio | Decimal? | @db.Decimal(8, 6) |  |
| pageCount | Int? | - |  |
| note | String? | - |  |
| uploadedBy | Int? | - |  |
| uploadedAt | DateTime | @default(now()) |  |
| removedBy | Int? | - |  |
| removedAt | DateTime? | - |  |
| removalReason | String? | - |  |
| version | Int | @default(1) |  |
| agreement | EmploymentAgreement | @relation(fields: [agreementId], references: [id], onDelete: Restrict) |  |
| uploader | User? | @relation("EmploymentAgreementAttachmentUploader", fields: [uploadedBy], references: [id], onDelete: SetNull) |  |
| remover | User? | @relation("EmploymentAgreementAttachmentRemover", fields: [removedBy], references: [id], onDelete: SetNull) |  |

### EmploymentAgreementTerm

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| termUid | String | @unique @default(dbgenerated("(gen_random_uuid())::text")) |  |
| agreementId | Int | - |  |
| sequence | Int | - |  |
| termKind | String | @default("initial") |  |
| effectiveFrom | String? | - |  |
| effectiveThrough | String? | - |  |
| recordState | String | @default("confirmed") |  |
| changeKind | String | @default("schedule") |  |
| supersedesId | Int? | - |  |
| sourceKind | String | @default("workspace") |  |
| sourceRef | String? | - |  |
| reason | String? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| agreement | EmploymentAgreement | @relation(fields: [agreementId], references: [id], onDelete: Restrict) |  |
| supersedes | EmploymentAgreementTerm? | @relation("EmploymentAgreementTermSupersession", fields: [supersedesId], references: [id], onDelete: Restrict) |  |
| supersededBy | EmploymentAgreementTerm[] | @relation("EmploymentAgreementTermSupersession") |  |

### EmploymentAgreementRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| revisionUid | String | @unique @default(dbgenerated("(gen_random_uuid())::text")) |  |
| agreementId | Int | - |  |
| revisionNo | Int | - |  |
| recordState | String | @default("draft") |  |
| changeKind | String | @default("initial") |  |
| contentJson | String | - |  |
| supersedesRevisionId | Int? | - |  |
| sourceKind | String | @default("workspace") |  |
| sourceRef | String? | - |  |
| reason | String? | - |  |
| createdBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| agreement | EmploymentAgreement | @relation("EmploymentAgreementRevisions", fields: [agreementId], references: [id], onDelete: Restrict) |  |
| currentForAgreement | EmploymentAgreement? | @relation("EmploymentAgreementCurrentRevision") |  |
| supersedes | EmploymentAgreementRevision? | @relation("EmploymentAgreementRevisionSupersession", fields: [supersedesRevisionId], references: [id], onDelete: Restrict) |  |
| supersededBy | EmploymentAgreementRevision[] | @relation("EmploymentAgreementRevisionSupersession") |  |

### EmploymentAgreementChange

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | String | @id @default(dbgenerated("(gen_random_uuid())::text")) |  |
| employeeId | Int | - |  |
| agreementId | Int? | - |  |
| commandKind | String | - |  |
| idempotencyKey | String | @unique |  |
| requestFingerprint | String | - |  |
| expectedVersion | Int? | - |  |
| effectManifestJson | String | - |  |
| actorUserId | Int | - |  |
| recordedAt | DateTime | @default(now()) |  |
| employee | Employee | @relation("EmploymentAgreementChangeEmployee", fields: [employeeId], references: [id], onDelete: Restrict) |  |
| agreement | EmploymentAgreement? | @relation("EmploymentAgreementChangeAgreement", fields: [agreementId], references: [id], onDelete: Restrict) |  |
| actorUser | User | @relation("EmploymentAgreementChangeActor", fields: [actorUserId], references: [id], onDelete: Restrict) |  |

### Employment

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | Int | - |  |
| isActive | Boolean | @default(true) |  |
| currentCompany | String? | - |  |
| companyId | Int? | - |  |
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
| agreements | EmploymentAgreement[] | - |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### EmployeeLifecycleEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | Int | - |  |
| eventType | String | - |  |
| effectiveDate | String | - |  |
| reason | String? | - |  |
| detailsJson | String | - |  |
| recordedByUserId | Int | - |  |
| recordedAt | DateTime | @default(now()) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Cascade) |  |
| recordedBy | User | @relation("EmployeeLifecycleEventRecorder", fields: [recordedByUserId], references: [id], onDelete: Restrict) |  |

### EmployeePeriodRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | String | @id @default(dbgenerated("(gen_random_uuid())::text")) |  |
| employeeId | Int | - |  |
| entityType | String | - |  |
| periodId | Int | - |  |
| expectedVersion | Int | - |  |
| beforeJson | String | - |  |
| afterJson | String | - |  |
| reason | String | - |  |
| recordedByUserId | Int | - |  |
| recordedAt | DateTime | @default(now()) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Restrict) |  |
| recordedBy | User | @relation("EmployeePeriodRevisionRecorder", fields: [recordedByUserId], references: [id], onDelete: Restrict) |  |

### OrganizationStructureChange

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | String | @id @default(uuid()) |  |
| aggregateType | String | - |  |
| aggregateId | Int | - |  |
| commandKind | String | - |  |
| effectiveOn | String | - |  |
| expectedSequence | Int | - |  |
| idempotencyKey | String | @unique |  |
| requestFingerprint | String | - |  |
| reason | String? | - |  |
| effectManifestJson | String | - |  |
| actorUserId | Int | - |  |
| recordedAt | DateTime | @default(now()) |  |
| departmentVersions | DepartmentEffectiveVersion[] | - |  |
| positionVersions | PositionEffectiveVersion[] | - |  |
| overrideVersions | PositionReportOverrideEffectiveVersion[] | - |  |

### DepartmentEffectiveVersion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| departmentId | Int | - |  |
| sequence | Int | - |  |
| validFrom | String? | - |  |
| validToExclusive | String? | - |  |
| recordState | String | @default("confirmed") |  |
| changeKind | String | - |  |
| supersedesId | Int? | - |  |
| sourceChangeId | String | - |  |
| code | String | - |  |
| name | String | - |  |
| alias | String? | - |  |
| hierarchyKind | String | - |  |
| level | Int | - |  |
| parentId | Int? | - |  |
| managerPositionId | Int? | - |  |
| createdBy | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| department | Department | @relation("DepartmentEffectiveVersionAggregate", fields: [departmentId], references: [id], onDelete: Restrict) |  |
| parent | Department? | @relation("DepartmentEffectiveVersionParent", fields: [parentId], references: [id], onDelete: Restrict) |  |
| managerPosition | Position? | @relation("DepartmentEffectiveVersionManagerPosition", fields: [managerPositionId], references: [id], onDelete: Restrict) |  |
| sourceChange | OrganizationStructureChange | @relation(fields: [sourceChangeId], references: [id], onDelete: Restrict) |  |
| supersedes | DepartmentEffectiveVersion? | @relation("DepartmentEffectiveVersionSupersession", fields: [supersedesId], references: [id], onDelete: Restrict) |  |
| supersededBy | DepartmentEffectiveVersion[] | @relation("DepartmentEffectiveVersionSupersession") |  |

### PositionEffectiveVersion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| positionId | Int | - |  |
| sequence | Int | - |  |
| validFrom | String? | - |  |
| validToExclusive | String? | - |  |
| recordState | String | @default("confirmed") |  |
| changeKind | String | - |  |
| supersedesId | Int? | - |  |
| sourceChangeId | String | - |  |
| code | String | - |  |
| name | String | - |  |
| alias | String? | - |  |
| departmentId | Int? | - |  |
| reportToPositionId | Int? | - |  |
| createdBy | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| position | Position | @relation("PositionEffectiveVersionAggregate", fields: [positionId], references: [id], onDelete: Restrict) |  |
| department | Department? | @relation("PositionEffectiveVersionDepartment", fields: [departmentId], references: [id], onDelete: Restrict) |  |
| reportToPosition | Position? | @relation("PositionEffectiveVersionReportTo", fields: [reportToPositionId], references: [id], onDelete: Restrict) |  |
| sourceChange | OrganizationStructureChange | @relation(fields: [sourceChangeId], references: [id], onDelete: Restrict) |  |
| supersedes | PositionEffectiveVersion? | @relation("PositionEffectiveVersionSupersession", fields: [supersedesId], references: [id], onDelete: Restrict) |  |
| supersededBy | PositionEffectiveVersion[] | @relation("PositionEffectiveVersionSupersession") |  |

### PositionReportOverrideEffectiveVersion

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| positionReportOverrideId | Int | - |  |
| sequence | Int | - |  |
| validFrom | String? | - |  |
| validToExclusive | String? | - |  |
| recordState | String | @default("confirmed") |  |
| changeKind | String | - |  |
| supersedesId | Int? | - |  |
| sourceChangeId | String | - |  |
| reportToPositionId | Int? | - |  |
| headcount | Int? | - |  |
| remark | String? | - |  |
| departmentId | Int? | - |  |
| createdBy | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| positionReportOverride | PositionReportOverride | @relation(fields: [positionReportOverrideId], references: [id], onDelete: Restrict, map: "PROEffectiveVersion_anchor_fkey") |  |
| reportToPosition | Position? | @relation("PositionReportOverrideVersionReportTo", fields: [reportToPositionId], references: [id], onDelete: Restrict) |  |
| department | Department? | @relation("PositionReportOverrideVersionDepartment", fields: [departmentId], references: [id], onDelete: Restrict) |  |
| sourceChange | OrganizationStructureChange | @relation(fields: [sourceChangeId], references: [id], onDelete: Restrict) |  |
| supersedes | PositionReportOverrideEffectiveVersion? | @relation("PositionReportOverrideEffectiveVersionSupersession", fields: [supersedesId], references: [id], onDelete: Restrict) |  |
| supersededBy | PositionReportOverrideEffectiveVersion[] | @relation("PositionReportOverrideEffectiveVersionSupersession") |  |

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

### EmployeeSocialInsurancePeriod

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| periodUid | String | @unique @default(uuid()) |  |
| employeeId | Int | - |  |
| insuranceStatus | String | @default("insured") |  |
| companyId | Int? | - |  |
| companyNameSnapshot | String? | - |  |
| startMonth | DateTime? | @db.Date |  |
| endMonth | DateTime? | @db.Date |  |
| stopReason | String? | - |  |
| note | String? | - |  |
| missingFieldsJson | String | @default("[]") |  |
| recordState | String | @default("confirmed") |  |
| sourceKind | String | @default("workspace") |  |
| sourceRef | String? | - |  |
| createdBy | Int? | - |  |
| updatedBy | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| version | Int | @default(1) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Restrict) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| creator | User? | @relation("EmployeeSocialInsuranceCreator", fields: [createdBy], references: [id], onDelete: SetNull) |  |
| updater | User? | @relation("EmployeeSocialInsuranceUpdater", fields: [updatedBy], references: [id], onDelete: SetNull) |  |
| revisions | EmployeeSocialInsurancePeriodRevision[] | - |  |

### EmployeeSocialInsurancePeriodRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| revisionUid | String | @unique @default(uuid()) |  |
| periodId | Int | - |  |
| revisionNo | Int | - |  |
| changeKind | String | - |  |
| beforeJson | String | - |  |
| afterJson | String | - |  |
| reason | String | - |  |
| recordedBy | Int | - |  |
| recordedAt | DateTime | @default(now()) |  |
| period | EmployeeSocialInsurancePeriod | @relation(fields: [periodId], references: [id], onDelete: Restrict) |  |
| actor | User | @relation("EmployeeSocialInsuranceRevisionRecorder", fields: [recordedBy], references: [id], onDelete: Restrict) |  |

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
| positions | EDP[] | @relation("EmployeePositions") |  |
| lifecycleEvents | EmployeeLifecycleEvent[] | - |  |
| periodRevisions | EmployeePeriodRevision[] | - |  |
| projects | EmployeeProject[] | - |  |
| projectMembershipChanges | ProjectMembershipChange[] | - |  |
| employmentAgreementChanges | EmploymentAgreementChange[] | @relation("EmploymentAgreementChangeEmployee") |  |
| socialInsurancePeriods | EmployeeSocialInsurancePeriod[] | - |  |
| ownedWorkItems | WorkItem[] | @relation("WorkItemOwner") |  |
| ownedWorkPlans | WorkPlan[] | @relation("WorkPlanOwner") |  |
| employments | Employment[] | - |  |
| partyIdentityLink | EmployeePartyIdentityLink? | - |  |
| financeAuxiliaryMembers | FinanceAuxiliaryMember[] | @relation("FinanceAuxiliaryMemberLinkedEmployee") |  |
| financeSalesSalaries | FinanceSalesSalary[] | - |  |
| financeShipments | FinanceShipment[] | - |  |
| financeWorkshopReports | FinanceWorkshopReport[] | - |  |
| performanceReviews | HrPerformanceReview[] | - |  |
| ownedKpiAssignments | WorkKpiAssignment[] | - |  |
| handledContracts | Contract[] | @relation("ContractHandlerEmployee") |  |
| financeCloseTasksAssigned | FinanceCloseTask[] | - |  |
| workResponsibilityReferences | WorkResponsibilityReference[] | @relation("WorkResponsibilityLockedEmployee") |  |
| productionQcSignatures | ProductionQcSignature[] | @relation("ProductionQcSignatureSignerEmployee") |  |
| productionQcAuditEvents | ProductionQcAuditEvent[] | @relation("ProductionQcAuditActorEmployee") |  |

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
| ownedContracts | Contract[] | @relation("ContractOwnerDepartment") |  |
| financeBudgetRows | FinanceBudgetDept[] | - |  |
| effectiveVersions | DepartmentEffectiveVersion[] | @relation("DepartmentEffectiveVersionAggregate") |  |
| effectiveChildVersions | DepartmentEffectiveVersion[] | @relation("DepartmentEffectiveVersionParent") |  |
| positionEffectiveVersions | PositionEffectiveVersion[] | @relation("PositionEffectiveVersionDepartment") |  |
| overrideEffectiveVersions | PositionReportOverrideEffectiveVersion[] | @relation("PositionReportOverrideVersionDepartment") |  |
| erpDueDiligenceSubmissions | ErpDueDiligenceSubmission[] | - |  |

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
| edps | EDP[] | @relation("EDPPosition") |  |
| reportedEdps | EDP[] | @relation("EDPReportToPosition") |  |
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
| workResponsibilityReferences | WorkResponsibilityReference[] | @relation("WorkResponsibilityLockedPosition") |  |
| effectiveVersions | PositionEffectiveVersion[] | @relation("PositionEffectiveVersionAggregate") |  |
| effectiveReportees | PositionEffectiveVersion[] | @relation("PositionEffectiveVersionReportTo") |  |
| effectiveManagedDepartments | DepartmentEffectiveVersion[] | @relation("DepartmentEffectiveVersionManagerPosition") |  |
| effectiveOverrideReports | PositionReportOverrideEffectiveVersion[] | @relation("PositionReportOverrideVersionReportTo") |  |

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
| reportToPositionId | Int? | - |  |
| allocationWeight | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| position | Position? | @relation("EDPPosition", fields: [positionId], references: [id]) |  |
| department | Department? | @relation(fields: [departmentId], references: [id]) |  |
| reportingCompany | Company? | @relation("EDPReportingCompany", fields: [reportingCompanyId], references: [id], onDelete: SetNull) |  |
| positionReportOverride | PositionReportOverride? | @relation(fields: [positionReportOverrideId], references: [id], onDelete: SetNull) |  |
| employee | Employee | @relation("EmployeePositions", fields: [employeeId], references: [id], onDelete: Cascade) |  |
| reportToPosition | Position? | @relation("EDPReportToPosition", fields: [reportToPositionId], references: [id], onDelete: SetNull) |  |
| erpDueDiligenceSubmissions | ErpDueDiligenceSubmission[] | @relation("ErpDueDiligencePositionAssignment") |  |
| workResponsibilityReferences | WorkResponsibilityReference[] | @relation("WorkResponsibilityLockedEmployeePosition") |  |

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
| version | Int | @default(1) |  |
| position | Position | @relation("PositionReportOverrideSource", fields: [positionId], references: [id], onDelete: Cascade) |  |
| company | Company | @relation(fields: [companyId], references: [id], onDelete: Cascade) |  |
| department | Department | @relation(fields: [departmentId], references: [id], onDelete: Cascade) |  |
| reportToPosition | Position? | @relation("PositionReportOverrideReportTo", fields: [reportToPositionId], references: [id]) |  |
| edps | EDP[] | - |  |
| effectiveVersions | PositionReportOverrideEffectiveVersion[] | - |  |

### InventoryItem

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| productMasterId | Int? | - |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
| code | String | - |  |
| name | String | - |  |
| itemType | String | @default("finished_goods") |  |
| specification | String? | - |  |
| baseUnit | String | - |  |
| contentUnit | String? | - |  |
| unitsPerPackage | Decimal? | @db.Decimal(18, 4) |  |
| packagesPerCase | Decimal? | @db.Decimal(18, 4) |  |
| barcode | String? | - |  |
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
| productMaster | Product? | @relation(fields: [productMasterId], references: [id], onDelete: Restrict) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| productSourceMappings | ProductSourceMapping[] | - |  |
| inventoryReceiptOutputs | InventoryReceiptOutput[] | - |  |
| financeCostStructureRows | FinanceCostStructureRow[] | - |  |
| financeShipments | FinanceShipment[] | - |  |

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
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
| documentNo | String | - |  |
| documentType | String | - |  |
| documentDate | String | - |  |
| status | String | @default("draft") |  |
| counterparty | String? | - |  |
| counterpartyPartyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |
| counterpartyParty | Party? | @relation(fields: [counterpartyPartyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### InventoryStocktake

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### InventoryImportBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| companyCode | String | - |  |
| companyId | Int? | - |  |
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
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

### InventoryReceiptReport

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| recordUid | String | @unique @default(uuid()) |  |
| year | Int | - |  |
| month | Int | - |  |
| workshopName | String | @default("固体制剂车间") |  |
| status | String | @default("draft") |  |
| preparedBy | String? | - |  |
| preparedByUserId | Int? | - |  |
| preparedAt | DateTime? | - |  |
| reviewedBy | String? | - |  |
| reviewedByUserId | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| confirmedSnapshot | Json? | - |  |
| confirmedSnapshotHash | String? | - |  |
| confirmationSource | String? | - |  |
| sourceKey | String? | @unique |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| version | Int | @default(1) |  |
| createdByUserId | Int? | - |  |
| updatedByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| batches | InventoryReceiptBatch[] | - |  |
| productWorkPoints | InventoryReceiptProductWorkPoint[] | - |  |
| events | InventoryReceiptReportEvent[] | - |  |
| costStructureRows | FinanceCostStructureRow[] | - |  |

### InventoryReceiptProductWorkPoint

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| reportId | Int | - |  |
| productId | Int? | - |  |
| sortOrder | Int | @default(0) |  |
| productName | String | - |  |
| workPoints | Decimal | @db.Decimal(18, 4) |  |
| sourceKey | String? | @unique |  |
| version | Int | @default(1) |  |
| createdByUserId | Int? | - |  |
| updatedByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| report | InventoryReceiptReport | @relation(fields: [reportId], references: [id], onDelete: Cascade) |  |
| product | Product? | @relation(fields: [productId], references: [id], onDelete: Restrict) |  |

### InventoryReceiptReportEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| reportId | Int | - |  |
| eventType | String | - |  |
| actorUserId | Int? | - |  |
| actorName | String | - |  |
| reportVersion | Int | - |  |
| snapshotHash | String | - |  |
| sourceKey | String? | @unique |  |
| payload | Json? | - |  |
| createdAt | DateTime | @default(now()) |  |
| report | InventoryReceiptReport | @relation(fields: [reportId], references: [id], onDelete: Restrict) |  |

### InventoryReceiptBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| reportId | Int | - |  |
| productId | Int? | - |  |
| sortOrder | Int | @default(0) |  |
| productName | String | - |  |
| specification | String? | - |  |
| batchNumber | String | - |  |
| inputQuantityTenThousands | Decimal? | @db.Decimal(18, 4) |  |
| sourceKey | String? | @unique |  |
| sourceRowStart | Int? | - |  |
| sourceRowEnd | Int? | - |  |
| version | Int | @default(1) |  |
| createdByUserId | Int? | - |  |
| updatedByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| report | InventoryReceiptReport | @relation(fields: [reportId], references: [id], onDelete: Cascade) |  |
| product | Product? | @relation(fields: [productId], references: [id], onDelete: Restrict) |  |
| outputs | InventoryReceiptOutput[] | - |  |

### InventoryReceiptOutput

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| productSkuId | Int? | - |  |
| sortOrder | Int | @default(0) |  |
| productionQuantityText | String? | - |  |
| caseQuantity | Decimal? | @db.Decimal(18, 4) |  |
| extraPackageQuantity | Decimal? | @db.Decimal(18, 4) |  |
| packagesPerCase | Decimal | @db.Decimal(18, 4) |  |
| unitsPerPackage | Decimal | @db.Decimal(18, 4) |  |
| packageUnit | String | - |  |
| packagingNote | String | - |  |
| sourceKey | String? | @unique |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceConvertedPackages | Decimal? | @db.Decimal(18, 4) |  |
| sourceConvertedTenThousands | Decimal? | @db.Decimal(18, 4) |  |
| sourceConvertedPackagesFormula | String? | - |  |
| sourceConvertedTenThousandsFormula | String? | - |  |
| auditStatus | String | @default("ok") |  |
| auditNote | String? | - |  |
| version | Int | @default(1) |  |
| createdByUserId | Int? | - |  |
| updatedByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| batch | InventoryReceiptBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |
| productSku | InventoryItem? | @relation(fields: [productSkuId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("StockRawMaterialEditor", fields: [editedBy], references: [id]) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("StockPackagingEditor", fields: [editedBy], references: [id]) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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
| companyId | Int? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| editor | User? | @relation("StockFinishedGoodsEditor", fields: [editedBy], references: [id]) |  |
| company | Company? | @relation(fields: [companyId], references: [id], onDelete: Restrict) |  |

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

### NotificationSubscription

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| userId | Int | - |  |
| eventKey | String | - |  |
| enabled | Boolean | @default(true) |  |
| channel | String | @default("workspace") |  |
| cadence | String | @default("immediate") |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| user | User | @relation(fields: [userId], references: [id], onDelete: Cascade) |  |
| notifications | Notification[] | - |  |

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

### EmployeePartyIdentityLink

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| employeeId | Int | @unique |  |
| partyId | Int | @unique |  |
| recordStatus | String | @default("confirmed") |  |
| linkMethod | String | - |  |
| linkEvidence | String | - |  |
| confirmedBy | Int? | - |  |
| confirmedAt | DateTime | @default(now()) |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Restrict) |  |
| party | Party | @relation(fields: [partyId], references: [id], onDelete: Restrict) |  |

### Product

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| code | String | @unique |  |
| identityKey | String | @unique |  |
| name | String | - |  |
| dosageForm | String? | - |  |
| strength | String? | - |  |
| approvalNumber | String? | - |  |
| status | String | @default("active") |  |
| note | String? | - |  |
| editedByUserId | Int? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| skus | InventoryItem[] | - |  |
| sourceMappings | ProductSourceMapping[] | - |  |
| inventoryReceiptBatches | InventoryReceiptBatch[] | - |  |
| inventoryReceiptWorkPoints | InventoryReceiptProductWorkPoint[] | - |  |
| productionQcBatches | ProductionQcBatch[] | - |  |
| financeWorkshopReports | FinanceWorkshopReport[] | - |  |

### ProductSourceMapping

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| productId | Int? | - |  |
| productSkuId | Int? | - |  |
| sourceSystem | String | - |  |
| sourceKey | String | - |  |
| sourceCode | String? | - |  |
| sourceName | String | - |  |
| sourceSpecification | String? | - |  |
| normalizedName | String | - |  |
| normalizedSpecification | String? | - |  |
| status | String | @default("confirmed") |  |
| sourceFile | String? | - |  |
| sourceSheet | String? | - |  |
| sourceRow | Int? | - |  |
| sourceData | Json? | - |  |
| reviewedByUserId | Int? | - |  |
| reviewedAt | DateTime? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| product | Product? | @relation(fields: [productId], references: [id], onDelete: Restrict) |  |
| productSku | InventoryItem? | @relation(fields: [productSkuId], references: [id], onDelete: Restrict) |  |

### ProductionQcBatch

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| recordUid | String | @unique @default(uuid()) |  |
| legacyFileId | Int? | @unique |  |
| batchNumber | String | - |  |
| productId | Int? | - |  |
| productKey | String | - |  |
| productName | String | - |  |
| templateId | Int | - |  |
| templateVersion | Int | - |  |
| templateSnapshot | Json | - |  |
| templateHash | String | - |  |
| status | String | @default("draft") |  |
| version | Int | @default(1) |  |
| createdByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| product | Product? | @relation(fields: [productId], references: [id], onDelete: Restrict) |  |
| template | DocumentTemplate | @relation(fields: [templateId], references: [id], onDelete: Restrict) |  |
| fieldValues | ProductionQcFieldValue[] | - |  |
| signatures | ProductionQcSignature[] | - |  |

### ProductionQcFieldValue

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| fieldKey | String | - |  |
| value | String | - |  |
| valueType | String? | - |  |
| unit | String? | - |  |
| source | String | @default("manual") |  |
| lastRecordVersion | Int | - |  |
| updatedByUserId | Int? | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| batch | ProductionQcBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |

### ProductionQcSignature

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int | - |  |
| fieldKey | String | - |  |
| scopeKey | String | - |  |
| scopeKind | String | - |  |
| stageKey | String | - |  |
| testName | String? | - |  |
| role | String | - |  |
| meaning | String | - |  |
| signerUserId | Int? | - |  |
| signerEmployeeId | String? | - |  |
| signerEmployeeRefId | Int? | - |  |
| signerName | String | - |  |
| signedAt | DateTime | @default(now()) |  |
| signedRecordVersion | Int | - |  |
| signedPayloadHash | String | - |  |
| authMethod | String | - |  |
| batch | ProductionQcBatch | @relation(fields: [batchId], references: [id], onDelete: Cascade) |  |
| signerEmployee | Employee? | @relation("ProductionQcSignatureSignerEmployee", fields: [signerEmployeeRefId], references: [id], onDelete: Restrict) |  |

### ProductionQcAuditEvent

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| batchId | Int? | - |  |
| batchRecordUid | String | - |  |
| batchNumber | String | - |  |
| eventType | String | - |  |
| action | String? | - |  |
| fieldKey | String? | - |  |
| stageKey | String? | - |  |
| testName | String? | - |  |
| role | String? | - |  |
| actorUserId | Int? | - |  |
| actorEmployeeId | String? | - |  |
| actorEmployeeRefId | Int? | - |  |
| actorName | String? | - |  |
| signatureMeaning | String? | - |  |
| signedPayloadHash | String? | - |  |
| beforeValue | String? | - |  |
| afterValue | String? | - |  |
| recordVersion | Int | - |  |
| payload | Json? | - |  |
| createdAt | DateTime | @default(now()) |  |
| actorEmployee | Employee? | @relation("ProductionQcAuditActorEmployee", fields: [actorEmployeeRefId], references: [id], onDelete: Restrict) |  |

### SystemConfig

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| key | String | @id |  |
| value | String | - |  |

### BusinessCodeSequence

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| ruleKey | String | - |  |
| scopeKey | String | - |  |
| nextValue | Int | @default(1) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |

### BusinessCodeRule

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| objectKey | String | @unique |  |
| configJson | Json | - |  |
| version | Int | @default(1) |  |
| isActive | Boolean | @default(true) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| allocations | BusinessCodeAllocation[] | - |  |

### BusinessCodeAllocation

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| objectKey | String | - |  |
| idempotencyKey | String | - |  |
| inputFingerprint | String | - |  |
| ruleId | Int | - |  |
| ruleVersion | Int | - |  |
| scopeKey | String | - |  |
| sequence | Int | - |  |
| code | String | - |  |
| createdAt | DateTime | @default(now()) |  |
| rule | BusinessCodeRule | @relation(fields: [ruleId], references: [id], onDelete: Restrict) |  |

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
| membershipChanges | ProjectMembershipChange[] | - |  |
| enablingDepartments | ProjectEnablingDepartment[] | - |  |
| planPhases | ProjectPlanPhase[] | @relation("ProjectPlanPhases") |  |
| planDependencies | ProjectPlanDependency[] | @relation("ProjectPlanDependencies") |  |
| planBaselines | ProjectPlanBaseline[] | @relation("ProjectPlanBaselines") |  |
| workAssignees | ProjectWorkAssignee[] | - |  |
| linkedWorkItems | WorkItem[] | @relation("WorkItemLinkedProject") |  |
| linkedWorkPlans | WorkPlan[] | @relation("WorkPlanLinkedProject") |  |
| financeBudgetRows | FinanceBudgetRd[] | - |  |

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
| membershipUid | String | @default(dbgenerated("(gen_random_uuid())::text")) |  |
| sequence | Int | @default(1) |  |
| employeeId | Int | - |  |
| projectId | Int | - |  |
| role | String? | - |  |
| startDate | String? | - |  |
| endDate | String? | - |  |
| recordState | String | @default("confirmed") |  |
| changeKind | String | @default("initial") |  |
| supersedesId | Int? | - |  |
| createdByChangeId | Int? | - |  |
| terminalChangeId | Int? | - |  |
| reason | String? | - |  |
| editedBy | Int? | - |  |
| editedAt | DateTime? | - |  |
| version | Int | @default(1) |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @default(now()) @updatedAt |  |
| project | Project | @relation(fields: [projectId], references: [id], onDelete: Restrict) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Restrict) |  |
| supersedes | EmployeeProject? | @relation("EmployeeProjectSupersession", fields: [supersedesId], references: [id], onDelete: Restrict) |  |
| supersededBy | EmployeeProject[] | @relation("EmployeeProjectSupersession") |  |
| createdByChange | ProjectMembershipChange? | @relation("ProjectMembershipCreatedVersions", fields: [createdByChangeId], references: [id], onDelete: Restrict) |  |
| terminalChange | ProjectMembershipChange? | @relation("ProjectMembershipTerminatedVersions", fields: [terminalChangeId], references: [id], onDelete: Restrict) |  |

### ProjectMembershipChange

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| changeUid | String | @unique @default(dbgenerated("(gen_random_uuid())::text")) |  |
| idempotencyKey | String? | @unique |  |
| requestFingerprint | String | - |  |
| membershipUid | String | - |  |
| employeeId | Int | - |  |
| projectId | Int | - |  |
| commandKind | String | - |  |
| effectiveOn | String? | - |  |
| reason | String? | - |  |
| effectsJson | String | - |  |
| recordedBy | Int? | - |  |
| recordedAt | DateTime | @default(now()) |  |
| employee | Employee | @relation(fields: [employeeId], references: [id], onDelete: Restrict) |  |
| project | Project | @relation(fields: [projectId], references: [id], onDelete: Restrict) |  |
| createdVersions | EmployeeProject[] | @relation("ProjectMembershipCreatedVersions") |  |
| terminatedVersions | EmployeeProject[] | @relation("ProjectMembershipTerminatedVersions") |  |

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
| positionDescriptionRevisionId | Int | - |  |
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
| positionDescriptionRevision | PositionDescriptionRevision | @relation(fields: [positionDescriptionRevisionId], references: [id], onDelete: Restrict) |  |
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

### WorkspaceAnalysisTemplate

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| scopeType | String | - |  |
| scopeId | Int | - |  |
| name | String | - |  |
| description | String? | - |  |
| code | String | @db.Text |  |
| status | String | @default("active") |  |
| sortOrder | Int | @default(0) |  |
| revision | Int | @default(1) |  |
| publishedRevision | Int? | - |  |
| publishedBy | Int? | - |  |
| publishedAt | DateTime? | - |  |
| archivedBy | Int? | - |  |
| archivedAt | DateTime? | - |  |
| createdBy | Int | - |  |
| updatedBy | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| updatedAt | DateTime | @updatedAt |  |
| revisions | WorkspaceAnalysisTemplateRevision[] | - |  |

### WorkspaceAnalysisTemplateRevision

| 字段 | 类型 | 属性 | 说明 |
|------|------|------|------|
| id | Int | @id @default(autoincrement()) |  |
| templateId | Int | - |  |
| revision | Int | - |  |
| name | String | - |  |
| description | String? | - |  |
| code | String | @db.Text |  |
| changeKind | String | @default("draft") |  |
| sourceRevision | Int? | - |  |
| reason | String? | - |  |
| createdBy | Int | - |  |
| createdAt | DateTime | @default(now()) |  |
| template | WorkspaceAnalysisTemplate | @relation(fields: [templateId], references: [id], onDelete: Cascade) |  |
