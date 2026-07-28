# HR Database Schema (248 tables)

## 

### 1-1 ErpDueDiligenceSubmission

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `campaignKey` | String | * | cUK |  |
| `definitionVersion` | Int | * |  |  |
| `respondentUserId` | Int | * | cUK+FK | → User.id |
| `positionAssignmentId` | Int |  | FK | → EDP.id |
| `respondentName` | String | * |  |  |
| `departmentName` | String | * |  |  |
| `roleTitle` | String | * |  |  |
| `primaryArea` | String | * |  |  |
| `status` | String | * |  |  |
| `answersJson` | Json | * |  |  |
| `processStepsJson` | Json | * |  |  |
| `evidenceItemsJson` | Json | * |  |  |
| `submittedAt` | DateTime |  |  |  |
| `editedAt` | DateTime | * |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-11 User](#user), [1-145 EDP](#edp)

← Referenced by: [1-2 ErpDueDiligenceEvidenceAttachment](#erpduediligenceevidenceattachment)

### 1-2 ErpDueDiligenceEvidenceAttachment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `attachmentUid` | String | * | UK |  |
| `submissionId` | Int | * | FK | → ErpDueDiligenceSubmission.id |
| `evidenceKey` | String | * |  |  |
| `fileName` | String | * |  |  |
| `mimeType` | String | * |  |  |
| `fileSize` | Int | * |  |  |
| `checksumSha256` | String | * |  |  |
| `fileContent` | Bytes | * |  |  |
| `uploadedBy` | Int | * |  |  |
| `uploadedAt` | DateTime | * |  |  |

→ Depends on: [1-1 ErpDueDiligenceSubmission](#erpduediligencesubmission)

### 1-3 AgentProfile

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `key` | String | * | UK |  |
| `actorUserId` | Int | * | UK+FK | → User.id |
| `displayName` | String | * |  |  |
| `roleName` | String | * |  |  |
| `responsibilities` | String | * |  |  |
| `allowedToolKeysJson` | String | * |  |  |
| `status` | String | * |  | active | suspended |
| `createdBy` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-11 User](#user)

← Referenced by: [1-4 AgentRuntimeBinding](#agentruntimebinding), [1-5 AgentSession](#agentsession), [1-6 AgentProposal](#agentproposal), [1-7 AgentRun](#agentrun)

### 1-4 AgentRuntimeBinding

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `agentProfileId` | Int | * | cUK+FK | → AgentProfile.id |
| `runtimeKind` | String | * | cUK | workspace | codex_local | ci | server_ops |
| `status` | String | * |  | active | suspended |
| `interactive` | Boolean | * |  |  |
| `capabilityKeysJson` | String | * |  |  |
| `instructions` | String | * |  |  |
| `createdBy` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-3 AgentProfile](#agentprofile)

← Referenced by: [1-7 AgentRun](#agentrun)

### 1-5 AgentSession

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | String | * | PK+REF |  |
| `userId` | Int | * |  |  |
| `agentProfileId` | Int |  | FK | → AgentProfile.id |
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

→ Depends on: [1-3 AgentProfile](#agentprofile)

← Referenced by: [1-7 AgentRun](#agentrun)

### 1-6 AgentProposal

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `userId` | Int | * |  |  |
| `actorUserId` | Int |  |  |  |
| `agentProfileId` | Int |  | FK | → AgentProfile.id |
| `sessionId` | String |  |  |  |
| `status` | String | * |  | pending | executing | confirmed | cancelled | failed | expired |
| `actionKey` | String | * |  | 工具 key，如 hr.updateEmployee |
| `toolKey` | String |  |  |  |
| `targetType` | String | * |  | 目标实体，如 Employee |
| `targetId` | String |  |  | 目标记录标识 |
| `payloadJson` | String | * |  | 变更内容 JSON |
| `diffJson` | String |  |  | 变更前后对比 JSON |
| `resultJson` | String |  |  | 执行结果 JSON |
| `executionToken` | String |  |  |  |
| `executionStartedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `confirmedAt` | DateTime |  |  |  |

→ Depends on: [1-3 AgentProfile](#agentprofile)

### 1-7 AgentRun

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | String | * | PK |  |
| `sessionId` | String | * | FK | → AgentSession.id |
| `requesterUserId` | Int | * |  |  |
| `actorUserId` | Int | * |  |  |
| `agentProfileId` | Int |  | FK | → AgentProfile.id |
| `runtimeBindingId` | Int |  | FK | → AgentRuntimeBinding.id |
| `runtimeKind` | String | * |  | workspace | codex_local | ci | server_ops |
| `runtimeConfigJson` | String |  |  |  |
| `runtimeConfigHash` | String |  |  |  |
| `status` | String | * |  | running | succeeded | failed | aborted |
| `pagePath` | String |  |  |  |
| `toolKey` | String |  |  |  |
| `resultType` | String |  |  |  |
| `proposalId` | Int |  |  |  |
| `errorMessage` | String |  |  |  |
| `inputOtherTokens` | Int |  |  |  |
| `inputCacheReadTokens` | Int |  |  |  |
| `inputCacheCreationTokens` | Int |  |  |  |
| `outputTokens` | Int |  |  |  |
| `contextUsagePeak` | Float |  |  |  |
| `runtimeStepCount` | Int |  |  |  |
| `runtimeOutcome` | String |  |  |  |
| `startedAt` | DateTime | * |  |  |
| `finishedAt` | DateTime |  |  |  |

→ Depends on: [1-5 AgentSession](#agentsession), [1-3 AgentProfile](#agentprofile), [1-4 AgentRuntimeBinding](#agentruntimebinding)

### 1-8 ApprovalRequest

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
| `sourceWorkflowPolicyId` | Int |  |  |  |
| `sourceWorkflowPolicyVersion` | Int |  |  |  |
| `sourceActionContractVersion` | Int |  |  |  |
| `sourceOkrControlVersion` | Int |  |  |  |
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

→ Depends on: [1-11 User](#user), [1-11 User](#user)

← Referenced by: [1-9 ApprovalEvent](#approvalevent)

### 1-9 ApprovalEvent

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

→ Depends on: [1-8 ApprovalRequest](#approvalrequest), [1-11 User](#user)

### 1-10 WorkflowPolicy

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

### 1-11 User

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

← Referenced by: [1-1 ErpDueDiligenceSubmission](#erpduediligencesubmission), [1-3 AgentProfile](#agentprofile), [1-8 ApprovalRequest](#approvalrequest), [1-8 ApprovalRequest](#approvalrequest), [1-9 ApprovalEvent](#approvalevent), [1-14 UserResourceActionGrant](#userresourceactiongrant), [1-17 PermissionGrantLedgerEvent](#permissiongrantledgerevent), [1-18 Notification](#notification), [1-18 Notification](#notification), [1-31 Contract](#contract), [1-31 Contract](#contract), [1-32 ContractAttachment](#contractattachment), [1-32 ContractAttachment](#contractattachment), [1-33 ContractRecord](#contractrecord), [1-34 DataQualityRun](#dataqualityrun), [1-101 FinanceLedgerImport](#financeledgerimport), [1-103 FinanceAccount](#financeaccount), [1-105 FinanceVoucher](#financevoucher), [1-108 FinanceBalanceSnapshot](#financebalancesnapshot), [1-108 FinanceBalanceSnapshot](#financebalancesnapshot), [1-110 FinanceReclassRule](#financereclassrule), [1-114 ReclassResult](#reclassresult), [1-118 FinanceStatementWorkpaper](#financestatementworkpaper), [1-127 EmploymentAgreementAttachment](#employmentagreementattachment), [1-127 EmploymentAgreementAttachment](#employmentagreementattachment), [1-130 EmploymentAgreementChange](#employmentagreementchange), [1-131 EmployeeLifecycleEvent](#employeelifecycleevent), [1-132 EmployeePeriodRevision](#employeeperiodrevision), [1-138 EmployeeSocialInsurancePeriod](#employeesocialinsuranceperiod), [1-138 EmployeeSocialInsurancePeriod](#employeesocialinsuranceperiod), [1-139 EmployeeSocialInsurancePeriodRevision](#employeesocialinsuranceperiodrevision), [1-140 Employee](#employee), [1-147 EditHistory](#edithistory), [1-164 StockRawMaterial](#stockrawmaterial), [1-165 StockPackaging](#stockpackaging), [1-166 StockFinishedGoods](#stockfinishedgoods), [1-168 StockOperation](#stockoperation), [1-170 LibraryTagCandidate](#librarytagcandidate), [1-172 LibraryMetadataCandidate](#librarymetadatacandidate), [1-173 LibraryEvaluationCase](#libraryevaluationcase), [1-173 LibraryEvaluationCase](#libraryevaluationcase), [1-179 LibraryExportJob](#libraryexportjob), [1-180 LibraryDocument](#librarydocument), [1-180 LibraryDocument](#librarydocument), [1-180 LibraryDocument](#librarydocument), [1-181 LibraryDocumentVersion](#librarydocumentversion), [1-190 LibraryDocumentTag](#librarydocumenttag), [1-191 MutationImpactBatch](#mutationimpactbatch), [1-193 NotificationSubscription](#notificationsubscription), [1-207 DepartmentCollaboration](#departmentcollaboration), [1-208 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-210 WorkKpiDefinition](#workkpidefinition), [1-211 WorkKpiAssignment](#workkpiassignment), [1-212 WorkKpiResultSnapshot](#workkpiresultsnapshot), [1-215 Meeting](#meeting), [1-215 Meeting](#meeting), [1-216 MeetingParticipant](#meetingparticipant), [1-220 MeetingVote](#meetingvote), [1-237 WorkReport](#workreport), [1-245 DepartmentWorkAssignee](#departmentworkassignee), [1-246 ProjectWorkAssignee](#projectworkassignee)

### 1-12 Resource

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

→ Depends on: [1-12 Resource](#resource)

← Referenced by: [1-14 UserResourceActionGrant](#userresourceactiongrant), [1-15 PositionResourceActionGrant](#positionresourceactiongrant), [1-16 DepartmentResourceActionGrant](#departmentresourceactiongrant), [1-17 PermissionGrantLedgerEvent](#permissiongrantledgerevent)

### 1-13 PermissionActionNormalization

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `key` | String | * |  |  |
| `appliedAt` | DateTime | * |  |  |

### 1-14 UserResourceActionGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `userId` | Int | * | cUK+FK | → User.id |
| `resourceId` | Int | * | cUK+FK | → Resource.id |
| `actionKey` | String | * | cUK |  |
| `scopeId` | String |  | cUK |  |

→ Depends on: [1-12 Resource](#resource), [1-11 User](#user)

### 1-15 PositionResourceActionGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `positionId` | Int | * | cUK+FK | → Position.id |
| `resourceId` | Int | * | cUK+FK | → Resource.id |
| `actionKey` | String | * | cUK |  |
| `scopeId` | String |  | cUK |  |

→ Depends on: [1-12 Resource](#resource), [1-144 Position](#position)

### 1-16 DepartmentResourceActionGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `resourceId` | Int | * | cUK+FK | → Resource.id |
| `actionKey` | String | * | cUK |  |
| `scopeId` | String |  | cUK |  |

→ Depends on: [1-12 Resource](#resource), [1-143 Department](#department)

### 1-17 PermissionGrantLedgerEvent

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

→ Depends on: [1-11 User](#user), [1-12 Resource](#resource)

### 1-18 Notification

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
| `recipientReason` | String |  |  |  |
| `resourceKey` | String |  |  |  |
| `scopeId` | String |  |  |  |
| `subscriptionId` | Int |  | FK | → NotificationSubscription.id |
| `isImportant` | Boolean | * |  |  |
| `isStrongReminder` | Boolean | * |  |  |
| `requiresAcknowledgement` | Boolean | * |  |  |
| `readAt` | DateTime |  |  |  |
| `acknowledgedAt` | DateTime |  |  |  |
| `rejectedAt` | DateTime |  |  |  |
| `clearedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-11 User](#user), [1-11 User](#user), [1-193 NotificationSubscription](#notificationsubscription)

### 1-19 OwnershipInterest

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `ownerPartyId` | Int | * | FK | → Party.id |
| `issuerCompanyId` | Int | * | FK | → Company.id |
| `shareRatio` | Float |  |  |  |
| `isConsolidated` | Boolean | * |  |  |
| `effectiveFrom` | DateTime |  |  |  |
| `effectiveTo` | DateTime |  |  |  |
| `recordStatus` | String | * |  |  |
| `changeLabel` | String |  |  |  |
| `sourceType` | String |  |  |  |
| `sourceLabel` | String |  |  |  |
| `sourceReference` | String |  |  |  |
| `sourceEventId` | Int |  | FK | → ShareCapitalEvent.id |
| `closedByEventId` | Int |  | FK | → ShareCapitalEvent.id |
| `projectionRunId` | Int |  | FK | → OwnershipProjectionRun.id |
| `projectionGeneration` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 Party](#party), [1-142 Company](#company), [1-23 ShareCapitalEvent](#sharecapitalevent), [1-23 ShareCapitalEvent](#sharecapitalevent), [1-20 OwnershipProjectionRun](#ownershipprojectionrun)

### 1-20 OwnershipProjectionRun

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `issuerCompanyId` | Int | * | FK | → Company.id |
| `generation` | Int | * |  |  |
| `projectorKey` | String | * |  |  |
| `projectorVersion` | Int | * |  |  |
| `ledgerHash` | String | * |  |  |
| `sourceEventCount` | Int | * |  |  |
| `projectionRowCount` | Int | * |  |  |
| `triggerReason` | String |  |  |  |
| `triggeredBy` | Int |  |  |  |
| `projectedAt` | DateTime | * |  |  |

→ Depends on: [1-142 Company](#company)

← Referenced by: [1-19 OwnershipInterest](#ownershipinterest)

### 1-21 CompanyRegistryChange

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyId` | Int | * | FK | → Company.id |
| `sourceKey` | String | * | UK |  |
| `changeDate` | DateTime | * |  |  |
| `changeCategory` | String | * |  |  |
| `changeItem` | String | * |  |  |
| `contentBefore` | String |  |  |  |
| `contentAfter` | String |  |  |  |
| `sourceCreatedDate` | DateTime |  |  |  |
| `sourceType` | String |  |  |  |
| `sourceLabel` | String |  |  |  |
| `sourceReference` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-142 Company](#company)

← Referenced by: [1-22 CompanyRegistryOwnershipParticipant](#companyregistryownershipparticipant)

### 1-22 CompanyRegistryOwnershipParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `registryChangeId` | Int | * | FK | → CompanyRegistryChange.id |
| `snapshotSide` | String | * |  |  |
| `sequence` | Int | * |  |  |
| `partyId` | Int |  | FK | → Party.id |
| `rawName` | String | * |  |  |
| `normalizedName` | String | * |  |  |
| `resolutionStatus` | String | * |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-21 CompanyRegistryChange](#companyregistrychange), [1-42 Party](#party)

### 1-23 ShareCapitalEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `sourceKey` | String |  | UK |  |
| `issuerCompanyId` | Int | * | cUK+FK | → Company.id |
| `sequence` | Int | * | cUK |  |
| `eventType` | String | * |  |  |
| `eventName` | String | * |  |  |
| `effectiveDate` | DateTime |  |  |  |
| `effectiveDatePrecision` | String | * |  |  |
| `ledgerMode` | String | * |  |  |
| `dataCompleteness` | String | * |  |  |
| `registeredCapitalCheckpointYuan` | Decimal |  |  |  |
| `recordStatus` | String | * |  |  |
| `sourceObservedDate` | DateTime |  |  |  |
| `consolidatedByPartyIdAfter` | Int |  | FK | → Party.id |
| `supersedesEventId` | Int |  | FK | → ShareCapitalEvent.id |
| `sourceType` | String |  |  |  |
| `sourceLabel` | String |  |  |  |
| `sourceReference` | String |  |  |  |
| `notes` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-142 Company](#company), [1-42 Party](#party), [1-23 ShareCapitalEvent](#sharecapitalevent)

← Referenced by: [1-19 OwnershipInterest](#ownershipinterest), [1-19 OwnershipInterest](#ownershipinterest), [1-24 ShareCapitalTransaction](#sharecapitaltransaction), [1-25 ShareCapitalSnapshotPosition](#sharecapitalsnapshotposition)

### 1-24 ShareCapitalTransaction

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `eventId` | Int | * | cUK+FK | → ShareCapitalEvent.id |
| `sequence` | Int | * | cUK |  |
| `fromPartyId` | Int |  | FK | → Party.id |
| `toPartyId` | Int |  | FK | → Party.id |
| `registeredCapitalAmountYuan` | Decimal | * |  |  |
| `considerationAmountYuan` | Decimal |  |  |  |
| `sourceReference` | String |  |  |  |
| `notes` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-23 ShareCapitalEvent](#sharecapitalevent), [1-42 Party](#party), [1-42 Party](#party)

### 1-25 ShareCapitalSnapshotPosition

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `eventId` | Int | * | FK | → ShareCapitalEvent.id |
| `sequence` | Int | * |  |  |
| `partyId` | Int | * | FK | → Party.id |
| `registeredCapitalAmountYuan` | Decimal |  |  |  |
| `assertedShareRatio` | Float |  |  |  |
| `sourceReference` | String |  |  |  |
| `notes` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-23 ShareCapitalEvent](#sharecapitalevent), [1-42 Party](#party)

### 1-26 ShareholderGroup

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `issuerCompanyId` | Int | * | cUK+FK | → Company.id |
| `groupKey` | String | * | cUK |  |
| `label` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `sourceType` | String |  |  |  |
| `sourceLabel` | String |  |  |  |
| `sourceReference` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-142 Company](#company)

← Referenced by: [1-27 ShareholderGroupMembership](#shareholdergroupmembership)

### 1-27 ShareholderGroupMembership

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `shareholderGroupId` | Int | * | FK | → ShareholderGroup.id |
| `partyId` | Int | * | FK | → Party.id |
| `sortOrder` | Int | * |  |  |
| `effectiveFrom` | DateTime | * |  |  |
| `effectiveTo` | DateTime |  |  |  |
| `recordStatus` | String | * |  |  |
| `sourceType` | String |  |  |  |
| `sourceLabel` | String |  |  |  |
| `sourceReference` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-26 ShareholderGroup](#shareholdergroup), [1-42 Party](#party)

### 1-28 ContractRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `revisionUid` | String | * | UK |  |
| `contractId` | Int | * | cUK+FK | → Contract.id |
| `revisionNo` | Int | * | cUK |  |
| `recordState` | String | * |  |  |
| `changeKind` | String | * |  |  |
| `effectiveOn` | DateTime | * |  |  |
| `effectiveThrough` | DateTime |  |  |  |
| `snapshotSchemaVersion` | Int | * |  |  |
| `snapshotJson` | Json | * |  |  |
| `reason` | String |  |  |  |
| `sourceRevisionId` | Int |  | FK | → ContractRevision.id |
| `supersededByRevisionId` | Int |  | UK+FK | → ContractRevision.id |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `confirmedBy` | Int |  |  |  |
| `confirmedAt` | DateTime |  |  |  |
| `cancelledBy` | Int |  |  |  |
| `cancelledAt` | DateTime |  |  |  |
| `createIdempotencyKey` | String |  | UK |  |
| `createRequestFingerprint` | String |  |  |  |
| `publishIdempotencyKey` | String |  | UK |  |
| `publishRequestFingerprint` | String |  |  |  |

→ Depends on: [1-31 Contract](#contract), [1-28 ContractRevision](#contractrevision), [1-28 ContractRevision](#contractrevision)

← Referenced by: [1-29 ContractStateEvent](#contractstateevent), [1-31 Contract](#contract)

### 1-29 ContractStateEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `eventUid` | String | * | UK |  |
| `contractId` | Int | * | FK | → Contract.id |
| `axis` | String | * |  |  |
| `eventKind` | String | * |  |  |
| `fromState` | String |  |  |  |
| `toState` | String | * |  |  |
| `effectiveOn` | DateTime | * |  |  |
| `recordState` | String | * |  |  |
| `reason` | String |  |  |  |
| `sourceRevisionId` | Int |  | FK | → ContractRevision.id |
| `reversesEventId` | Int |  | UK+FK | → ContractStateEvent.id |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `reversedBy` | Int |  |  |  |
| `reversedAt` | DateTime |  |  |  |
| `idempotencyKey` | String |  | UK |  |
| `requestFingerprint` | String |  |  |  |

→ Depends on: [1-31 Contract](#contract), [1-28 ContractRevision](#contractrevision), [1-29 ContractStateEvent](#contractstateevent)

### 1-30 ContractCategory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `name` | String | * | UK |  |
| `isActive` | Boolean | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-31 Contract](#contract)

### 1-31 Contract

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `contractUid` | String | * | UK |  |
| `contractNo` | String |  |  |  |
| `name` | String | * |  |  |
| `partyA` | String |  |  |  |
| `partyB` | String |  |  |  |
| `shareholder` | String |  |  |  |
| `categoryId` | Int | * | FK | → ContractCategory.id |
| `content` | String |  |  |  |
| `owningCompanyId` | Int |  | FK | → Company.id |
| `ownerDepartmentId` | Int |  | FK | → Department.id |
| `partyAId` | Int |  | FK | → Party.id |
| `partyBId` | Int |  | FK | → Party.id |
| `handlerEmployeeId` | Int |  | FK | → Employee.id |
| `signedOn` | DateTime |  |  |  |
| `expiresOn` | DateTime |  |  |  |
| `signedOnPrecision` | String |  |  |  |
| `expiresOnPrecision` | String |  |  |  |
| `legacySignDateRaw` | String |  |  |  |
| `legacyEndDateRaw` | String |  |  |  |
| `lifecycleStatus` | String | * |  |  |
| `signatureStatus` | String | * |  |  |
| `performanceStatus` | String | * |  |  |
| `legacyStatusRaw` | String |  |  |  |
| `amount` | Decimal |  |  |  |
| `executedAmount` | Decimal |  |  |  |
| `currencyCode` | String | * |  |  |
| `confidentialityLevel` | Int | * |  |  |
| `location` | String |  |  |  |
| `remark` | String |  |  |  |
| `approvalSourceKey` | String |  | cUK |  |
| `approvalRecordId` | String |  | cUK |  |
| `approvalRecordUrl` | String |  |  |  |
| `approvalStatusSnapshot` | String |  |  |  |
| `approvedOn` | DateTime |  |  |  |
| `approvalSyncedAt` | DateTime |  |  |  |
| `currentRevisionId` | Int |  | UK+FK | → ContractRevision.id |
| `isArchived` | Boolean | * |  |  |
| `archivedAt` | DateTime |  |  |  |
| `archivedBy` | Int |  | FK | → User.id |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-30 ContractCategory](#contractcategory), [1-142 Company](#company), [1-143 Department](#department), [1-42 Party](#party), [1-42 Party](#party), [1-11 User](#user), [1-11 User](#user), [1-140 Employee](#employee), [1-28 ContractRevision](#contractrevision)

← Referenced by: [1-28 ContractRevision](#contractrevision), [1-29 ContractStateEvent](#contractstateevent), [1-32 ContractAttachment](#contractattachment), [1-33 ContractRecord](#contractrecord)

### 1-32 ContractAttachment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `attachmentUid` | String | * | UK |  |
| `contractId` | Int | * | FK | → Contract.id |
| `kind` | String | * |  |  |
| `fileName` | String | * |  |  |
| `mimeType` | String | * |  |  |
| `originalStoragePath` | String | * |  |  |
| `originalSizeBytes` | Int | * |  |  |
| `originalChecksumSha256` | String | * |  |  |
| `optimizedStoragePath` | String |  |  |  |
| `optimizedSizeBytes` | Int |  |  |  |
| `optimizedChecksumSha256` | String |  |  |  |
| `optimizationStatus` | String | * |  |  |
| `optimizationError` | String |  |  |  |
| `compressionSavingsRatio` | Decimal |  |  |  |
| `pageCount` | Int |  |  |  |
| `note` | String |  |  |  |
| `uploadedBy` | Int |  | FK | → User.id |
| `uploadedAt` | DateTime | * |  |  |
| `removedBy` | Int |  | FK | → User.id |
| `removedAt` | DateTime |  |  |  |
| `removalReason` | String |  |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-31 Contract](#contract), [1-11 User](#user), [1-11 User](#user)

### 1-33 ContractRecord

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `recordUid` | String | * | UK |  |
| `contractId` | Int | * | FK | → Contract.id |
| `recordType` | String | * |  |  |
| `occurredOn` | DateTime | * |  |  |
| `title` | String | * |  |  |
| `content` | String |  |  |  |
| `sourceKey` | String |  |  |  |
| `externalRecordId` | String |  |  |  |
| `externalUrl` | String |  |  |  |
| `statusSnapshot` | String |  |  |  |
| `attachmentUid` | String |  |  |  |
| `createdBy` | Int |  | FK | → User.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-31 Contract](#contract), [1-11 User](#user)

### 1-34 DataQualityRun

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `trigger` | String | * |  |  |
| `status` | String | * |  |  |
| `domainsJson` | String | * |  |  |
| `requestedByUserId` | Int |  | FK | → User.id |
| `startedAt` | DateTime | * |  |  |
| `finishedAt` | DateTime |  |  |  |
| `checkCount` | Int | * |  |  |
| `openFindingCount` | Int | * |  |  |
| `newFindingCount` | Int | * |  |  |
| `resolvedFindingCount` | Int | * |  |  |
| `failureMessage` | String |  |  |  |

→ Depends on: [1-11 User](#user)

← Referenced by: [1-35 DataQualityCheckState](#dataqualitycheckstate), [1-36 DataQualityFinding](#dataqualityfinding), [1-37 DataQualityNotificationDelivery](#dataqualitynotificationdelivery), [1-38 DataQualityEvaluationRequest](#dataqualityevaluationrequest)

### 1-35 DataQualityCheckState

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `checkKey` | String | * | REF |  |
| `providerKey` | String | * |  |  |
| `domain` | String | * |  |  |
| `title` | String | * |  |  |
| `description` | String | * |  |  |
| `defaultSeverity` | String | * |  |  |
| `triggerModesJson` | String | * |  |  |
| `lastStatus` | String | * |  |  |
| `lastFindingCount` | Int | * |  |  |
| `lastEvaluatedAt` | DateTime |  |  |  |
| `lastRunId` | Int |  | FK | → DataQualityRun.id |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-34 DataQualityRun](#dataqualityrun)

← Referenced by: [1-36 DataQualityFinding](#dataqualityfinding)

### 1-36 DataQualityFinding

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `fingerprint` | String | * | UK |  |
| `checkKey` | String | * | FK | → DataQualityCheckState.checkKey |
| `domain` | String | * |  |  |
| `severity` | String | * |  |  |
| `status` | String | * |  |  |
| `title` | String | * |  |  |
| `summary` | String | * |  |  |
| `count` | Int | * |  |  |
| `resourceKey` | String |  |  |  |
| `href` | String |  |  |  |
| `samplesJson` | String |  |  |  |
| `firstSeenAt` | DateTime | * |  |  |
| `lastSeenAt` | DateTime | * |  |  |
| `resolvedAt` | DateTime |  |  |  |
| `lastRunId` | Int | * | FK | → DataQualityRun.id |
| `lastWorkspaceNotifiedAt` | DateTime |  |  |  |
| `lastWecomNotifiedAt` | DateTime |  |  |  |

→ Depends on: [1-35 DataQualityCheckState](#dataqualitycheckstate), [1-34 DataQualityRun](#dataqualityrun)

### 1-37 DataQualityNotificationDelivery

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `runId` | Int | * | FK | → DataQualityRun.id |
| `channel` | String | * |  |  |
| `destination` | String | * |  |  |
| `status` | String | * |  |  |
| `findingCount` | Int | * |  |  |
| `error` | String |  |  |  |
| `sentAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-34 DataQualityRun](#dataqualityrun)

### 1-38 DataQualityEvaluationRequest

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `domain` | String | * |  |  |
| `entityType` | String | * |  |  |
| `entityId` | String | * |  |  |
| `status` | String | * |  |  |
| `attempts` | Int | * |  |  |
| `requestedAt` | DateTime | * |  |  |
| `processingAt` | DateTime |  |  |  |
| `processedAt` | DateTime |  |  |  |
| `processedByRunId` | Int |  | FK | → DataQualityRun.id |
| `lastError` | String |  |  |  |

→ Depends on: [1-34 DataQualityRun](#dataqualityrun)

### 1-39 DocumentTemplateSpace

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

← Referenced by: [1-40 DocumentTemplate](#documenttemplate)

### 1-40 DocumentTemplate

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
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

→ Depends on: [1-39 DocumentTemplateSpace](#documenttemplatespace)

← Referenced by: [1-201 ProductionQcBatch](#productionqcbatch)

### 1-41 PartyLegalFactRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `partyId` | Int | * | FK | → Party.id |
| `revision` | Int | * |  |  |
| `commandKind` | String | * |  |  |
| `effectiveOn` | DateTime | * |  |  |
| `recordState` | String | * |  |  |
| `supersedesId` | Int |  | UK+FK | → PartyLegalFactRevision.id |
| `subjectType` | String | * |  |  |
| `name` | String | * |  |  |
| `fullName` | String |  |  |  |
| `identityNumber` | String | * |  |  |
| `legalRepresentative` | String |  |  |  |
| `registeredCapital` | String |  |  |  |
| `registeredAddress` | String |  |  |  |
| `registeredDate` | String |  |  |  |
| `sourceRegistryChangeId` | Int |  |  |  |
| `sourceType` | String |  |  |  |
| `sourceLabel` | String |  |  |  |
| `sourceReference` | String |  |  |  |
| `reason` | String |  |  |  |
| `idempotencyKey` | String | * | UK |  |
| `requestFingerprint` | String | * |  |  |
| `recordedBy` | Int |  |  |  |
| `recordedAt` | DateTime | * |  |  |

→ Depends on: [1-42 Party](#party), [1-41 PartyLegalFactRevision](#partylegalfactrevision)

### 1-42 Party

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `subjectType` | String | * | cUK |  |
| `name` | String | * |  |  |
| `fullName` | String |  |  |  |
| `identityNumber` | String | * | cUK |  |
| `legalRepresentative` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `externalProfile` | ExternalPartyProfile |  |  |  |
| `company` | Company |  |  |  |

← Referenced by: [1-19 OwnershipInterest](#ownershipinterest), [1-22 CompanyRegistryOwnershipParticipant](#companyregistryownershipparticipant), [1-23 ShareCapitalEvent](#sharecapitalevent), [1-24 ShareCapitalTransaction](#sharecapitaltransaction), [1-24 ShareCapitalTransaction](#sharecapitaltransaction), [1-25 ShareCapitalSnapshotPosition](#sharecapitalsnapshotposition), [1-27 ShareholderGroupMembership](#shareholdergroupmembership), [1-31 Contract](#contract), [1-31 Contract](#contract), [1-41 PartyLegalFactRevision](#partylegalfactrevision), [1-43 PartyNameHistory](#partynamehistory), [1-44 ExternalPartyProfile](#externalpartyprofile), [1-45 ExternalPartyRole](#externalpartyrole), [1-142 Company](#company)

### 1-43 PartyNameHistory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `partyId` | Int | * | FK | → Party.id |
| `sourceKey` | String | * | UK |  |
| `nameKind` | String | * |  |  |
| `name` | String | * |  |  |
| `normalizedName` | String | * |  |  |
| `effectiveFrom` | DateTime |  |  |  |
| `effectiveTo` | DateTime |  |  |  |
| `datePrecision` | String | * |  |  |
| `recordStatus` | String | * |  |  |
| `sourceObservedDate` | DateTime |  |  |  |
| `sourceType` | String |  |  |  |
| `sourceLabel` | String |  |  |  |
| `sourceReference` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 Party](#party)

### 1-44 ExternalPartyProfile

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `partyId` | Int | * | FK | → Party.id |
| `relatedPartyType` | String | * |  |  |

→ Depends on: [1-42 Party](#party)

### 1-45 ExternalPartyRole

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `partyId` | Int | * | cUK+FK | → Party.id |
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
| `availabilityVersion` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-42 Party](#party)

← Referenced by: [1-46 ExternalPartyRolePeriod](#externalpartyroleperiod), [1-47 ExternalPartySourceMapping](#externalpartysourcemapping), [1-75 FinanceShipment](#financeshipment)

### 1-46 ExternalPartyRolePeriod

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `roleId` | Int | * | cUK+FK | → ExternalPartyRole.id |
| `sequence` | Int | * | cUK |  |
| `validFrom` | String |  |  |  |
| `validThrough` | String |  |  |  |
| `recordState` | String | * |  |  |
| `commandKind` | String | * |  |  |
| `supersedesId` | Int |  | UK+FK | → ExternalPartyRolePeriod.id |
| `idempotencyKey` | String | * | UK |  |
| `requestFingerprint` | String | * |  |  |
| `reason` | String |  |  |  |
| `recordedBy` | Int |  |  |  |
| `recordedAt` | DateTime | * |  |  |

→ Depends on: [1-45 ExternalPartyRole](#externalpartyrole), [1-46 ExternalPartyRolePeriod](#externalpartyroleperiod)

### 1-47 ExternalPartySourceMapping

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `roleId` | Int | * | FK | → ExternalPartyRole.id |
| `companyId` | Int | * | cUK+FK | → Company.id |
| `sourceSystem` | String | * | cUK |  |
| `sourceKey` | String | * | cUK |  |
| `sourceCode` | String |  |  |  |
| `sourceName` | String | * |  |  |
| `sourceNameNormalized` | String | * |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `sourceData` | Json |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-45 ExternalPartyRole](#externalpartyrole), [1-142 Company](#company)

### 1-48 FinanceAssetCard

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

← Referenced by: [1-49 FinanceAssetCostLine](#financeassetcostline), [1-50 FinanceAssetExpenseAllocation](#financeassetexpenseallocation), [1-52 FinanceAssetPeriodEntry](#financeassetperiodentry), [1-53 FinanceAssetAdjustment](#financeassetadjustment)

### 1-49 FinanceAssetCostLine

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

→ Depends on: [1-48 FinanceAssetCard](#financeassetcard)

### 1-50 FinanceAssetExpenseAllocation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `assetId` | Int | * | cUK+FK | → FinanceAssetCard.id |
| `expenseAccountCode` | String | * | cUK |  |
| `allocationRate` | Decimal | * |  |  |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-48 FinanceAssetCard](#financeassetcard)

### 1-51 FinanceAssetImportBatch

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

### 1-52 FinanceAssetPeriodEntry

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

→ Depends on: [1-48 FinanceAssetCard](#financeassetcard), [1-104 FinancePeriod](#financeperiod), [1-105 FinanceVoucher](#financevoucher)

### 1-53 FinanceAssetAdjustment

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

→ Depends on: [1-48 FinanceAssetCard](#financeassetcard), [1-104 FinancePeriod](#financeperiod), [1-105 FinanceVoucher](#financevoucher)

### 1-54 FinanceBudgetVersion

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

← Referenced by: [1-55 FinanceBudgetDept](#financebudgetdept), [1-56 FinanceBudgetRd](#financebudgetrd)

### 1-55 FinanceBudgetDept

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

→ Depends on: [1-54 FinanceBudgetVersion](#financebudgetversion), [1-103 FinanceAccount](#financeaccount)

### 1-56 FinanceBudgetRd

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

→ Depends on: [1-54 FinanceBudgetVersion](#financebudgetversion), [1-103 FinanceAccount](#financeaccount)

### 1-57 FinanceCashFlowItem

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

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-57 FinanceCashFlowItem](#financecashflowitem)

← Referenced by: [1-58 FinanceCashFlowAllocation](#financecashflowallocation)

### 1-58 FinanceCashFlowAllocation

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
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

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-104 FinancePeriod](#financeperiod), [1-105 FinanceVoucher](#financevoucher), [1-57 FinanceCashFlowItem](#financecashflowitem), [1-106 FinanceVoucherItem](#financevoucheritem), [1-106 FinanceVoucherItem](#financevoucheritem)

← Referenced by: [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline)

### 1-59 FinanceConsolidationEntryLine

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `entryId` | Int | * | cUK+FK | → FinanceConsolidationEntry.id |
| `lineNo` | Int | * | cUK |  |
| `entitySnapshotId` | Int | * | FK | → FinanceConsolidationEntitySnapshot.id |
| `companyId` | Int | * |  |  |
| `companyCode` | String | * |  |  |
| `statementType` | String | * |  | balanceSheet | incomeStatement | cashFlow |
| `lineCode` | String | * |  |  |
| `accountCode` | String |  |  |  |
| `groupAccountId` | Int |  | FK | → FinanceGroupAccount.id |
| `debit` | Decimal | * |  |  |
| `credit` | Decimal | * |  |  |
| `currencyCode` | String | * |  |  |
| `periodBasis` | String | * |  | current | comparative |
| `note` | String |  |  |  |
| `matchSide` | String |  |  | left | right |
| `sourceKind` | String |  |  | auxiliaryBalance | openItem | cashFlowAllocation | workpaper | voucher |
| `sourceId` | String |  |  |  |
| `sourceFingerprint` | String |  |  |  |
| `sourceAmount` | Decimal |  |  |  |
| `sourceCurrency` | String |  |  |  |
| `counterpartyEntitySnapshotId` | Int |  | FK | → FinanceConsolidationEntitySnapshot.id |
| `counterpartyCompanyId` | Int |  |  |  |
| `sourceSnapshotId` | Int |  | FK | → FinanceConsolidationSourceSnapshot.id |
| `sourceAuxiliaryBalanceId` | Int |  | FK | → FinanceAuxiliaryBalance.id |
| `sourceOpenItemId` | Int |  | FK | → FinanceOpenItem.id |
| `sourceCashFlowAllocationId` | Int |  | FK | → FinanceCashFlowAllocation.id |
| `sourceVoucherItemId` | Int |  | FK | → FinanceVoucherItem.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-72 FinanceConsolidationEntry](#financeconsolidationentry), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot), [1-70 FinanceConsolidationSourceSnapshot](#financeconsolidationsourcesnapshot), [1-83 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-85 FinanceOpenItem](#financeopenitem), [1-58 FinanceCashFlowAllocation](#financecashflowallocation), [1-106 FinanceVoucherItem](#financevoucheritem), [1-88 FinanceGroupAccount](#financegroupaccount)

### 1-60 FinanceConsolidationMatchGroup

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `batchId` | Int | * | cUK+FK | → FinanceConsolidationBatch.id |
| `entryId` | Int |  | UK+FK | → FinanceConsolidationEntry.id |
| `category` | String | * |  | investmentEquity | intercompanyBalance |
| `status` | String | * |  | matched | difference | unresolved | accepted | rejected |
| `leftEntitySnapshotId` | Int | * | FK | → FinanceConsolidationEntitySnapshot.id |
| `rightEntitySnapshotId` | Int |  | FK | → FinanceConsolidationEntitySnapshot.id |
| `matchingRule` | String | * |  |  |
| `matchingVersion` | String | * |  |  |
| `matchedAmount` | Decimal | * |  |  |
| `differenceAmount` | Decimal | * |  |  |
| `differenceResolution` | String |  |  |  |
| `generationKey` | String | * | cUK |  |
| `sourceFingerprint` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch), [1-72 FinanceConsolidationEntry](#financeconsolidationentry), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot)

← Referenced by: [1-61 FinanceConsolidationMatchSource](#financeconsolidationmatchsource)

### 1-61 FinanceConsolidationMatchSource

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `matchGroupId` | Int | * | cUK+FK | → FinanceConsolidationMatchGroup.id |
| `entitySnapshotId` | Int | * | FK | → FinanceConsolidationEntitySnapshot.id |
| `counterpartyEntitySnapshotId` | Int |  | FK | → FinanceConsolidationEntitySnapshot.id |
| `sourceKind` | String | * |  | voucher | auxiliaryBalance |
| `voucherItemId` | Int |  | cUK+FK | → FinanceVoucherItem.id |
| `auxiliaryBalanceId` | Int |  | cUK+FK | → FinanceAuxiliaryBalance.id |
| `matchSide` | String | * |  | left | right |
| `sourceAmount` | Decimal | * |  |  |
| `allocatedAmount` | Decimal | * |  |  |
| `currencyCode` | String | * |  |  |
| `sourceFingerprint` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-60 FinanceConsolidationMatchGroup](#financeconsolidationmatchgroup), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot), [1-106 FinanceVoucherItem](#financevoucheritem), [1-83 FinanceAuxiliaryBalance](#financeauxiliarybalance)

### 1-62 FinanceVoucherCompanyMappingRule

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `purpose` | String | * |  | investmentInvestee |
| `sourceCompanyCode` | String | * |  |  |
| `linkedCompanyId` | Int | * | FK | → Company.id |
| `voucherDate` | String |  |  |  |
| `voucherNo` | String |  |  |  |
| `matchText` | String |  |  |  |
| `matchingPolicy` | String | * |  | direct；历史 aggregateCnyMirror 值仅用于识别被投资方，不参与金额折算 |
| `priority` | Int | * |  |  |
| `evidence` | String | * |  |  |
| `isActive` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-142 Company](#company)

### 1-63 FinanceConsolidationOutputSnapshot

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | Int | * | UK+FK | → FinanceConsolidationBatch.id |
| `version` | Int | * |  |  |
| `inputFingerprint` | String | * |  |  |
| `outputFingerprint` | String | * |  |  |
| `reportPayload` | Json | * |  |  |
| `generatedAt` | DateTime | * |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch)

### 1-64 FinanceConsolidationScopeSelection

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `parentCompanyId` | Int | * |  |  |
| `year` | Int | * |  |  |
| `month` | Int | * |  |  |
| `periodKind` | String | * |  |  |
| `companyId` | Int | * |  |  |
| `relationId` | Int | * |  |  |
| `relationVersion` | Int | * |  |  |
| `included` | Boolean | * |  |  |
| `selectedBy` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-65 FinanceConsolidationBatch

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `parentCompanyId` | Int | * |  |  |
| `parentCompanyCode` | String | * |  |  |
| `parentCompanyName` | String | * |  |  |
| `year` | Int | * |  |  |
| `month` | Int | * |  |  |
| `periodKind` | String | * |  | year | quarter | month；既有批次均按月迁移 |
| `version` | Int | * |  |  |
| `revision` | Int | * |  |  |
| `status` | String | * |  | draft | submitted | reviewed | locked | published |
| `baseBatchId` | Int |  | FK | → FinanceConsolidationBatch.id |
| `scopeFingerprint` | String | * |  |  |
| `sourceFingerprint` | String | * |  |  |
| `rateFingerprint` | String | * |  |  |
| `createdBy` | Int | * |  |  |
| `submittedBy` | Int |  |  |  |
| `submittedAt` | DateTime |  |  |  |
| `reviewedBy` | Int |  |  |  |
| `reviewedAt` | DateTime |  |  |  |
| `reviewNote` | String |  |  |  |
| `lockedBy` | Int |  |  |  |
| `lockedAt` | DateTime |  |  |  |
| `publishedBy` | Int |  |  |  |
| `publishedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `outputSnapshot` | FinanceConsolidationOutputSnapshot |  |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch)

← Referenced by: [1-60 FinanceConsolidationMatchGroup](#financeconsolidationmatchgroup), [1-63 FinanceConsolidationOutputSnapshot](#financeconsolidationoutputsnapshot), [1-67 FinanceConsolidationBatchEvent](#financeconsolidationbatchevent), [1-68 FinanceConsolidationControlDecision](#financeconsolidationcontroldecision), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot), [1-70 FinanceConsolidationSourceSnapshot](#financeconsolidationsourcesnapshot), [1-71 FinanceConsolidationRateSnapshot](#financeconsolidationratesnapshot), [1-72 FinanceConsolidationEntry](#financeconsolidationentry)

### 1-66 FinanceCompanyCurrencyPolicy

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `companyId` | Int | * | UK+FK | → Company.id |
| `functionalCurrency` | String | * |  |  |
| `source` | String | * |  |  |
| `evidence` | String | * |  |  |
| `effectiveFrom` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-142 Company](#company)

### 1-67 FinanceConsolidationBatchEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | Int | * | cUK+FK | → FinanceConsolidationBatch.id |
| `eventType` | String | * |  | lifecycle | mutation |
| `action` | String | * |  | create | submit | return | review | lock | publish | entry.* | taxEffect.delete |
| `fromStatus` | String | * |  |  |
| `toStatus` | String | * |  |  |
| `note` | String |  |  |  |
| `actorUserId` | Int | * |  |  |
| `actorName` | String | * |  |  |
| `batchRevision` | Int | * | cUK |  |
| `targetType` | String |  |  |  |
| `targetId` | Int |  |  |  |
| `snapshot` | Json |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch)

### 1-68 FinanceConsolidationControlDecision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | Int | * | cUK+FK | → FinanceConsolidationBatch.id |
| `controlKey` | String | * | cUK | scope | ownership | sources | fx | eliminations | tax |
| `decision` | String | * |  | completed | requiresReview | notApplicable |
| `conclusion` | String | * |  |  |
| `evidence` | String | * |  |  |
| `decidedBy` | Int | * |  |  |
| `decidedAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch)

### 1-69 FinanceConsolidationEntitySnapshot

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `batchId` | Int | * | cUK+FK | → FinanceConsolidationBatch.id |
| `companyId` | Int | * | cUK |  |
| `companyCode` | String | * |  |  |
| `companyName` | String | * |  |  |
| `role` | String | * |  | parent | subsidiary |
| `directParentCompanyId` | Int |  |  |  |
| `directParentCode` | String |  |  |  |
| `relationId` | Int |  |  |  |
| `relationUpdatedAt` | DateTime |  |  |  |
| `relationEffectiveFrom` | DateTime |  |  |  |
| `relationEffectiveTo` | DateTime |  |  |  |
| `relationVersion` | Int |  |  |  |
| `shareRatio` | Decimal |  |  |  |
| `isConsolidated` | Boolean | * |  |  |
| `functionalCurrency` | String |  |  |  |
| `currencyEvidence` | String |  |  |  |
| `currencyDecidedBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch)

← Referenced by: [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline), [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline), [1-60 FinanceConsolidationMatchGroup](#financeconsolidationmatchgroup), [1-60 FinanceConsolidationMatchGroup](#financeconsolidationmatchgroup), [1-61 FinanceConsolidationMatchSource](#financeconsolidationmatchsource), [1-61 FinanceConsolidationMatchSource](#financeconsolidationmatchsource), [1-70 FinanceConsolidationSourceSnapshot](#financeconsolidationsourcesnapshot), [1-73 FinanceConsolidationTaxEffect](#financeconsolidationtaxeffect)

### 1-70 FinanceConsolidationSourceSnapshot

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `batchId` | Int | * | cUK+FK | → FinanceConsolidationBatch.id |
| `entitySnapshotId` | Int | * | cUK+FK | → FinanceConsolidationEntitySnapshot.id |
| `reportType` | String | * | cUK | balanceSheet | incomeStatement | cashFlow |
| `sourceKind` | String | * |  | workpaper | system | missing |
| `sourceStatus` | String | * |  | submitted | draft | available | missing |
| `workpaperId` | Int |  |  |  |
| `workpaperVersion` | Int |  |  |  |
| `sourceChecksum` | String |  |  |  |
| `workpaperUpdatedBy` | Int |  |  |  |
| `sourcePackageId` | Int |  |  |  |
| `sourcePackageRevision` | Int |  |  |  |
| `sourcePackageStatus` | String |  |  |  |
| `sourcePackageChecksum` | String |  |  |  |
| `sourcePackageUploadedBy` | Int |  |  |  |
| `sourcePackageSubmittedBy` | Int |  |  |  |
| `lineCount` | Int | * |  |  |
| `sourcedLineCount` | Int | * |  |  |
| `importedLineCount` | Int | * |  |  |
| `manualLineCount` | Int | * |  |  |
| `formulaLineCount` | Int | * |  |  |
| `reportPayload` | Json | * |  |  |
| `fingerprint` | String | * |  |  |
| `evidence` | String |  |  |  |
| `selectedBy` | Int | * |  |  |
| `selectedAt` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot)

← Referenced by: [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline)

### 1-71 FinanceConsolidationRateSnapshot

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | Int | * | cUK+FK | → FinanceConsolidationBatch.id |
| `exchangeRateId` | Int | * | cUK |  |
| `exchangeRateVersion` | Int | * |  |  |
| `baseCurrency` | String | * |  |  |
| `quoteCurrency` | String | * |  |  |
| `rateKind` | String | * |  |  |
| `rateDate` | String | * |  |  |
| `rate` | Decimal | * |  |  |
| `sourceUrl` | String | * |  |  |
| `publishedAt` | DateTime |  |  |  |
| `recordedBy` | Int |  |  |  |
| `recordedAt` | DateTime |  |  |  |
| `applications` | Json | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch)

### 1-72 FinanceConsolidationEntry

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `batchId` | Int | * | cUK+FK | → FinanceConsolidationBatch.id |
| `entryNo` | String | * | cUK |  |
| `postingDate` | String | * |  |  |
| `documentType` | String | * |  | groupAdjustment | elimination | reclassification |
| `postingLevel` | String | * |  | 10 单边调整 | 20 双边抵销 | 30 集团层调整 |
| `entryType` | String | * |  | investmentEquity | reclassification | nonControllingInterest | intercompanyBalance | internalTrading | internalLongTermAsset | incomeDividend | cashFlow |
| `title` | String | * |  |  |
| `description` | String |  |  |  |
| `evidence` | String | * |  |  |
| `matchDifference` | Decimal |  |  |  |
| `differenceResolution` | String |  |  |  |
| `origin` | String | * |  | manual | system |
| `generationKey` | String |  | cUK |  |
| `generationFingerprint` | String |  |  |  |
| `generatedAt` | DateTime |  |  |  |
| `status` | String | * |  | draft | submitted | approved | reversed |
| `version` | Int | * |  |  |
| `supersedesEntryId` | Int |  | cUK+FK | → FinanceConsolidationEntry.id |
| `reversalOfEntryId` | Int |  | cUK+FK | → FinanceConsolidationEntry.id |
| `predecessorEntryId` | Int |  | UK+FK | → FinanceConsolidationEntry.id |
| `preparedBy` | Int | * |  |  |
| `submittedBy` | Int |  |  |  |
| `submittedAt` | DateTime |  |  |  |
| `approvedBy` | Int |  |  |  |
| `approvedAt` | DateTime |  |  |  |
| `approvalNote` | String |  |  |  |
| `reversedBy` | Int |  |  |  |
| `reversedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `matchGroup` | FinanceConsolidationMatchGroup |  |  |  |

→ Depends on: [1-65 FinanceConsolidationBatch](#financeconsolidationbatch), [1-72 FinanceConsolidationEntry](#financeconsolidationentry), [1-72 FinanceConsolidationEntry](#financeconsolidationentry), [1-72 FinanceConsolidationEntry](#financeconsolidationentry)

← Referenced by: [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline), [1-60 FinanceConsolidationMatchGroup](#financeconsolidationmatchgroup), [1-73 FinanceConsolidationTaxEffect](#financeconsolidationtaxeffect)

### 1-73 FinanceConsolidationTaxEffect

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `entryId` | Int | * | cUK+FK | → FinanceConsolidationEntry.id |
| `entitySnapshotId` | Int |  | FK | → FinanceConsolidationEntitySnapshot.id |
| `effectKey` | String | * | cUK |  |
| `taxEffectType` | String | * |  | deductible | taxable |
| `differenceAmount` | Decimal | * |  |  |
| `taxRate` | Decimal | * |  |  |
| `recognition` | String | * |  | asset | liability | unrecognized |
| `periodBasis` | String | * |  | current | comparative |
| `jurisdiction` | String |  |  |  |
| `recognitionLocation` | String |  |  | profitOrLoss | otherComprehensiveIncome | equity |
| `balanceSheetLineCode` | String |  |  |  |
| `counterpartLineCode` | String |  |  |  |
| `reversalPeriod` | String |  |  |  |
| `recoverabilityConclusion` | String | * |  |  |
| `evidence` | String | * |  |  |
| `preparedBy` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-72 FinanceConsolidationEntry](#financeconsolidationentry), [1-69 FinanceConsolidationEntitySnapshot](#financeconsolidationentitysnapshot)

### 1-74 FinanceDataImport

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

← Referenced by: [1-75 FinanceShipment](#financeshipment), [1-76 FinanceSalesSalary](#financesalessalary), [1-77 FinanceCostStructureRow](#financecoststructurerow), [1-78 FinanceCostAnalysisRow](#financecostanalysisrow), [1-79 FinanceWorkshopReport](#financeworkshopreport)

### 1-75 FinanceShipment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceDataImport.id |
| `customerId` | Int |  | FK | → ExternalPartyRole.id |
| `productId` | Int |  | FK | → InventoryItem.id |
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
| `salesChannel` | String | * |  |  |
| `salespersonName` | String |  |  |  |
| `employeeId` | Int |  | FK | → Employee.id |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-140 Employee](#employee), [1-45 ExternalPartyRole](#externalpartyrole), [1-148 InventoryItem](#inventoryitem), [1-74 FinanceDataImport](#financedataimport)

### 1-76 FinanceSalesSalary

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
| `salesChannel` | String | * |  |  |
| `salespersonName` | String |  |  |  |
| `employeeId` | Int |  | FK | → Employee.id |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-140 Employee](#employee), [1-74 FinanceDataImport](#financedataimport)

### 1-77 FinanceCostStructureRow

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceDataImport.id |
| `productId` | Int |  | FK | → InventoryItem.id |
| `receiptReportId` | Int |  | FK | → InventoryReceiptReport.id |
| `year` | Int | * |  |  |
| `month` | Int |  |  |  |
| `productStatus` | String |  |  |  |
| `productName` | String |  |  |  |
| `workHours` | Float |  |  |  |
| `rawMaterials` | Float |  |  |  |
| `packagingMaterials` | Float |  |  |  |
| `directLaborWage` | Float |  |  |  |
| `directLaborSocialSecurity` | Float |  |  |  |
| `directLaborWelfare` | Float |  |  |  |
| `auxiliaryLaborWage` | Float |  |  |  |
| `auxiliaryLaborSocialSecurity` | Float |  |  |  |
| `auxiliaryLaborWelfare` | Float |  |  |  |
| `utilities` | Float |  |  |  |
| `depreciationDirect` | Float |  |  |  |
| `depreciationAuxiliary` | Float |  |  |  |
| `otherManufacturingCost` | Float |  |  |  |
| `quantity` | Float |  |  |  |
| `unit` | String |  |  |  |
| `sourceFile` | String | * |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-74 FinanceDataImport](#financedataimport), [1-148 InventoryItem](#inventoryitem), [1-159 InventoryReceiptReport](#inventoryreceiptreport)

### 1-78 FinanceCostAnalysisRow

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

→ Depends on: [1-74 FinanceDataImport](#financedataimport)

### 1-79 FinanceWorkshopReport

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

→ Depends on: [1-144 Position](#position), [1-140 Employee](#employee), [1-74 FinanceDataImport](#financedataimport)

### 1-80 FinanceAuxiliaryMember

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
| `linkedCompanyId` | Int |  | FK | → Company.id |
| `companyLinkMethod` | String |  |  |  |
| `companyLinkEvidence` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-142 Company](#company)

← Referenced by: [1-81 FinanceCounterpartyClassification](#financecounterpartyclassification), [1-82 FinanceVoucherItemAuxiliary](#financevoucheritemauxiliary), [1-84 FinanceAuxiliaryBalanceMember](#financeauxiliarybalancemember), [1-87 FinanceOpenItemAuxiliary](#financeopenitemauxiliary)

### 1-81 FinanceCounterpartyClassification

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `memberId` | Int | * | cUK+FK | → FinanceAuxiliaryMember.id |
| `accountId` | Int | * | cUK+FK | → FinanceAccount.id |
| `counterpartyType` | String | * |  |  |
| `classificationMethod` | String | * |  |  |
| `classificationEvidence` | String | * |  |  |
| `lockedAt` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-80 FinanceAuxiliaryMember](#financeauxiliarymember), [1-103 FinanceAccount](#financeaccount)

### 1-82 FinanceVoucherItemAuxiliary

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `itemId` | Int | * | cUK+FK | → FinanceVoucherItem.id |
| `memberId` | Int | * | cUK+FK | → FinanceAuxiliaryMember.id |
| `sourceRole` | String | * | cUK |  |

→ Depends on: [1-106 FinanceVoucherItem](#financevoucheritem), [1-80 FinanceAuxiliaryMember](#financeauxiliarymember)

### 1-83 FinanceAuxiliaryBalance

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

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-104 FinancePeriod](#financeperiod), [1-103 FinanceAccount](#financeaccount)

← Referenced by: [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline), [1-61 FinanceConsolidationMatchSource](#financeconsolidationmatchsource), [1-84 FinanceAuxiliaryBalanceMember](#financeauxiliarybalancemember)

### 1-84 FinanceAuxiliaryBalanceMember

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `balanceId` | Int | * | cUK+FK | → FinanceAuxiliaryBalance.id |
| `memberId` | Int | * | cUK+FK | → FinanceAuxiliaryMember.id |
| `sourceRole` | String | * | cUK |  |

→ Depends on: [1-83 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-80 FinanceAuxiliaryMember](#financeauxiliarymember)

### 1-85 FinanceOpenItem

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
| `originType` | String |  |  |  |
| `sourcePeriodBeginDetailId` | String |  |  |  |
| `agingBaseDate` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-104 FinancePeriod](#financeperiod), [1-103 FinanceAccount](#financeaccount), [1-106 FinanceVoucherItem](#financevoucheritem)

← Referenced by: [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline), [1-86 FinanceOpenItemSettlement](#financeopenitemsettlement), [1-87 FinanceOpenItemAuxiliary](#financeopenitemauxiliary)

### 1-86 FinanceOpenItemSettlement

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `openItemId` | Int | * | FK | → FinanceOpenItem.id |
| `settlementDate` | String | * |  |  |
| `settlementType` | String | * |  |  |
| `referenceNo` | String |  |  |  |
| `settledDebit` | Decimal | * |  |  |
| `settledCredit` | Decimal | * |  |  |
| `currencyCode` | String |  |  |  |
| `note` | String |  |  |  |
| `sourceSystem` | String |  | cUK |  |
| `sourceDatabase` | String |  | cUK |  |
| `sourceKey` | String |  | cUK |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-85 FinanceOpenItem](#financeopenitem)

### 1-87 FinanceOpenItemAuxiliary

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `openItemId` | Int | * | cUK+FK | → FinanceOpenItem.id |
| `memberId` | Int | * | cUK+FK | → FinanceAuxiliaryMember.id |
| `sourceRole` | String | * | cUK |  |

→ Depends on: [1-85 FinanceOpenItem](#financeopenitem), [1-80 FinanceAuxiliaryMember](#financeauxiliarymember)

### 1-88 FinanceGroupAccount

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String | * | UK |  |
| `name` | String | * |  |  |
| `category` | String | * |  |  |
| `balanceDirection` | String | * |  |  |
| `mnemonicCode` | String |  |  |  |
| `currency` | String |  |  |  |
| `subjectLevel` | Int |  |  |  |
| `parentId` | Int |  | FK | → FinanceGroupAccount.id |
| `sourceKind` | String | * |  | reference_seed | suggested | manual |
| `reviewStatus` | String | * |  | confirmed | reviewed | pending_review | pending_delete |
| `reviewedBy` | Int |  |  |  |
| `reviewedAt` | DateTime |  |  |  |
| `originCompanyCode` | String |  |  |  |
| `originSourceScopeKey` | String |  |  |  |
| `originLocalAccountCode` | String |  |  |  |
| `isActive` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-88 FinanceGroupAccount](#financegroupaccount)

← Referenced by: [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline), [1-90 FinanceGroupAccountRevision](#financegroupaccountrevision), [1-90 FinanceGroupAccountRevision](#financegroupaccountrevision), [1-92 FinanceConsolidationRuleSelector](#financeconsolidationruleselector), [1-93 FinanceGroupAccountMapping](#financegroupaccountmapping), [1-110 FinanceReclassRule](#financereclassrule), [1-110 FinanceReclassRule](#financereclassrule), [1-112 FinanceBalanceReclassAdjustment](#financebalancereclassadjustment), [1-112 FinanceBalanceReclassAdjustment](#financebalancereclassadjustment)

### 1-89 FinanceAccountingPolicyVersion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `versionNo` | Int | * | UK |  |
| `code` | String | * | UK |  |
| `name` | String | * |  |  |
| `effectiveFrom` | DateTime |  |  |  |
| `effectiveTo` | DateTime |  |  |  |
| `status` | String | * |  |  |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-90 FinanceGroupAccountRevision](#financegroupaccountrevision), [1-91 FinanceConsolidationRule](#financeconsolidationrule), [1-93 FinanceGroupAccountMapping](#financegroupaccountmapping), [1-110 FinanceReclassRule](#financereclassrule), [1-112 FinanceBalanceReclassAdjustment](#financebalancereclassadjustment)

### 1-90 FinanceGroupAccountRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `policyVersionId` | Int | * | FK | → FinanceAccountingPolicyVersion.id |
| `groupAccountId` | Int | * | FK | → FinanceGroupAccount.id |
| `code` | String | * |  |  |
| `name` | String | * |  |  |
| `category` | String | * |  |  |
| `balanceDirection` | String | * |  |  |
| `mnemonicCode` | String |  |  |  |
| `currency` | String |  |  |  |
| `subjectLevel` | Int |  |  |  |
| `parentGroupAccountId` | Int |  | FK | → FinanceGroupAccount.id |
| `isActive` | Boolean | * |  |  |
| `reviewStatus` | String | * |  | confirmed | reviewed | pending_review | pending_delete |
| `reviewedBy` | Int |  |  |  |
| `reviewedAt` | DateTime |  |  |  |
| `consolidationRole` | String | * |  | none | intercompanyReceivable | intercompanyPayable | intercompanyRevenue | intercompanyExpense | investmentInSubsidiary | shareCapital | capitalReserve | dividendReceivable | dividendPayable | inventory | fixedAsset | cashFlow | difference |
| `counterpartyRequirement` | String | * |  | none | optional | required |
| `movementType` | String | * |  | closingBalance | periodMovement | transaction |
| `translationRateType` | String | * |  | closing | average | historical | transactionDate |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-89 FinanceAccountingPolicyVersion](#financeaccountingpolicyversion), [1-88 FinanceGroupAccount](#financegroupaccount), [1-88 FinanceGroupAccount](#financegroupaccount)

### 1-91 FinanceConsolidationRule

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `policyVersionId` | Int | * | FK | → FinanceAccountingPolicyVersion.id |
| `ruleCode` | String | * |  |  |
| `name` | String | * |  |  |
| `ruleType` | String | * |  | intercompanyBalance | investmentEquity | intercompanyRevenueExpense | intercompanyDividend | inventoryProfit | fixedAssetProfit | internalCashFlow | manualReclassification |
| `dataBasis` | String | * |  | closingBalance | periodMovement | voucher | openItem |
| `matchMode` | String | * |  | partnerAggregate | ownershipChain | documentReference | manual |
| `amountMode` | String | * |  | lowerOfTwoSides | fullSource | netChange | fixed |
| `postingSide` | String | * |  | both | leading | partner |
| `differenceHandling` | String | * |  | exception | postToDifferenceAccount | carryForward |
| `toleranceAmount` | Decimal | * |  |  |
| `currencyRateType` | String | * |  | source | closing | average | historical | transactionDate |
| `enabled` | Boolean | * |  |  |
| `priority` | Int | * |  |  |
| `sourceKind` | String | * |  | systemDefault | manual |
| `note` | String |  |  |  |
| `createdBy` | Int |  |  |  |
| `updatedBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-89 FinanceAccountingPolicyVersion](#financeaccountingpolicyversion)

← Referenced by: [1-92 FinanceConsolidationRuleSelector](#financeconsolidationruleselector)

### 1-92 FinanceConsolidationRuleSelector

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `ruleId` | Int | * | FK | → FinanceConsolidationRule.id |
| `side` | String | * |  | left | right | difference |
| `sequence` | Int | * |  |  |
| `selectorType` | String | * |  | role | groupAccount |
| `consolidationRole` | String |  |  |  |
| `groupAccountId` | Int |  | FK | → FinanceGroupAccount.id |
| `includeChildren` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-91 FinanceConsolidationRule](#financeconsolidationrule), [1-88 FinanceGroupAccount](#financegroupaccount)

### 1-93 FinanceGroupAccountMapping

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `policyVersionId` | Int | * | FK | → FinanceAccountingPolicyVersion.id |
| `groupAccountId` | Int |  | FK | → FinanceGroupAccount.id |
| `companyCode` | String | * |  |  |
| `sourceScopeKey` | String | * |  |  |
| `sourceSystem` | String |  |  |  |
| `sourceDatabase` | String |  |  |  |
| `sourceLedger` | String |  |  |  |
| `localAccountCode` | String | * |  |  |
| `localAccountName` | String | * |  |  |
| `localCategory` | String | * |  |  |
| `localBalanceDirection` | String | * |  |  |
| `latestYear` | Int |  |  |  |
| `mappingMethod` | String | * |  | unmatched | reference_seed | exact_code_name | exact_name | suggested | hierarchy_match | manual_override |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-89 FinanceAccountingPolicyVersion](#financeaccountingpolicyversion), [1-88 FinanceGroupAccount](#financegroupaccount)

### 1-94 FinanceReadableSourcePackage

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `packageKey` | String | * | UK |  |
| `archiveRevision` | String | * |  |  |
| `sourceSystem` | String | * |  |  |
| `sourcePath` | String | * |  |  |
| `snapshotDate` | String | * |  |  |
| `cutoffDate` | String | * |  |  |
| `isAccountingClose` | Boolean | * |  |  |
| `previousSnapshot` | String |  |  |  |
| `sourceMapChecksum` | String | * |  |  |
| `manifestChecksum` | String | * |  |  |
| `validationChecksum` | String | * |  |  |
| `selectedDatabaseChecksum` | String | * |  |  |
| `validationStatus` | String | * |  |  |
| `manifestEntryCount` | Int | * |  |  |
| `validatedTableCount` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

← Referenced by: [1-95 FinanceReadableImportRun](#financereadableimportrun), [1-101 FinanceLedgerImport](#financeledgerimport)

### 1-95 FinanceReadableImportRun

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `runKey` | String | * | UK |  |
| `ledgerImportId` | Int | * | FK | → FinanceLedgerImport.id |
| `sourcePackageId` | Int | * | FK | → FinanceReadableSourcePackage.id |
| `status` | String | * |  |  |
| `controlJson` | Json |  |  |  |
| `errorMessage` | String |  |  |  |
| `startedAt` | DateTime | * |  |  |
| `completedAt` | DateTime |  |  |  |

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-94 FinanceReadableSourcePackage](#financereadablesourcepackage)

### 1-96 FinanceSourceLedgerMapping

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `sourceSystem` | String | * | cUK |  |
| `sourceLedger` | String | * | cUK |  |
| `sourceName` | String | * |  |  |
| `mappingMode` | String | * |  | recurring | historical |
| `effectiveFromYear` | Int | * | cUK |  |
| `effectiveToYear` | Int |  |  |  |
| `successorSourceSystem` | String |  |  |  |
| `successorSourceLedger` | String |  |  |  |
| `baseCurrencyCode` | String |  |  |  |
| `baseCurrencyName` | String |  |  |  |
| `accountingStandard` | String |  |  |  |
| `entityType` | String |  |  |  |
| `evidence` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-101 FinanceLedgerImport](#financeledgerimport)

### 1-97 FinanceAccountAuxiliaryRequirement

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `accountId` | Int | * | cUK+FK | → FinanceAccount.id |
| `importId` | Int | * | FK | → FinanceLedgerImport.id |
| `dimensionType` | String | * | cUK |  |
| `sourceField` | String | * |  |  |
| `sourceSystem` | String | * |  |  |
| `sourceDatabase` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-103 FinanceAccount](#financeaccount), [1-101 FinanceLedgerImport](#financeledgerimport)

### 1-98 FinanceSourcePeriodStatus

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | cUK+FK | → FinanceLedgerImport.id |
| `periodId` | Int | * | cUK+FK | → FinancePeriod.id |
| `sourceKey` | String | * |  |  |
| `glMonthEnd` | Boolean |  |  |  |
| `accountingClosed` | Boolean |  |  |  |
| `moduleStatuses` | Json | * |  |  |
| `derivationVersion` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-104 FinancePeriod](#financeperiod)

### 1-99 FinanceSourceSubsystemStatus

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | cUK+FK | → FinanceLedgerImport.id |
| `sourceKey` | String | * |  |  |
| `subsystemCode` | String | * | cUK |  |
| `isDeleted` | Boolean | * |  |  |
| `isYearClosed` | Boolean |  |  |  |
| `lastProcessedPeriod` | Int |  |  |  |
| `enabledFrom` | String |  |  |  |
| `sourceUser` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport)

### 1-100 FinanceAccountLineage

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `importId` | Int | * | FK | → FinanceLedgerImport.id |
| `currentAccountId` | Int | * | FK | → FinanceAccount.id |
| `previousAccountId` | Int | * | FK | → FinanceAccount.id |
| `sourceSystem` | String | * | cUK |  |
| `sourceDatabase` | String | * | cUK |  |
| `sourceKey` | String | * | cUK |  |
| `currentYear` | Int | * |  |  |
| `previousYear` | Int | * |  |  |
| `relationType` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-103 FinanceAccount](#financeaccount), [1-103 FinanceAccount](#financeaccount)

### 1-101 FinanceLedgerImport

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
| `sourcePackageId` | Int |  | FK | → FinanceReadableSourcePackage.id |
| `sourceLedgerMappingId` | Int |  | FK | → FinanceSourceLedgerMapping.id |
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

→ Depends on: [1-11 User](#user), [1-94 FinanceReadableSourcePackage](#financereadablesourcepackage), [1-96 FinanceSourceLedgerMapping](#financesourceledgermapping)

← Referenced by: [1-57 FinanceCashFlowItem](#financecashflowitem), [1-58 FinanceCashFlowAllocation](#financecashflowallocation), [1-80 FinanceAuxiliaryMember](#financeauxiliarymember), [1-83 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-85 FinanceOpenItem](#financeopenitem), [1-95 FinanceReadableImportRun](#financereadableimportrun), [1-97 FinanceAccountAuxiliaryRequirement](#financeaccountauxiliaryrequirement), [1-98 FinanceSourcePeriodStatus](#financesourceperiodstatus), [1-99 FinanceSourceSubsystemStatus](#financesourcesubsystemstatus), [1-100 FinanceAccountLineage](#financeaccountlineage), [1-102 FinanceSourceAccountBalance](#financesourceaccountbalance), [1-105 FinanceVoucher](#financevoucher), [1-106 FinanceVoucherItem](#financevoucheritem), [1-121 FinanceCurrency](#financecurrency), [1-122 FinanceBankAccount](#financebankaccount)

### 1-102 FinanceSourceAccountBalance

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

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport), [1-104 FinancePeriod](#financeperiod), [1-103 FinanceAccount](#financeaccount)

### 1-103 FinanceAccount

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

→ Depends on: [1-11 User](#user), [1-103 FinanceAccount](#financeaccount)

← Referenced by: [1-55 FinanceBudgetDept](#financebudgetdept), [1-56 FinanceBudgetRd](#financebudgetrd), [1-81 FinanceCounterpartyClassification](#financecounterpartyclassification), [1-83 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-85 FinanceOpenItem](#financeopenitem), [1-97 FinanceAccountAuxiliaryRequirement](#financeaccountauxiliaryrequirement), [1-100 FinanceAccountLineage](#financeaccountlineage), [1-100 FinanceAccountLineage](#financeaccountlineage), [1-102 FinanceSourceAccountBalance](#financesourceaccountbalance), [1-106 FinanceVoucherItem](#financevoucheritem), [1-107 FinanceAccountBalance](#financeaccountbalance), [1-109 FinanceBalanceSnapshotRow](#financebalancesnapshotrow), [1-122 FinanceBankAccount](#financebankaccount)

### 1-104 FinancePeriod

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

← Referenced by: [1-52 FinanceAssetPeriodEntry](#financeassetperiodentry), [1-53 FinanceAssetAdjustment](#financeassetadjustment), [1-58 FinanceCashFlowAllocation](#financecashflowallocation), [1-83 FinanceAuxiliaryBalance](#financeauxiliarybalance), [1-85 FinanceOpenItem](#financeopenitem), [1-98 FinanceSourcePeriodStatus](#financesourceperiodstatus), [1-102 FinanceSourceAccountBalance](#financesourceaccountbalance), [1-105 FinanceVoucher](#financevoucher), [1-107 FinanceAccountBalance](#financeaccountbalance), [1-114 ReclassResult](#reclassresult)

### 1-105 FinanceVoucher

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
| `voucherTypeCode` | String |  |  |  |
| `voucherTypeName` | String |  |  |  |
| `isAdjustment` | Boolean | * |  |  |
| `preparerName` | String |  |  |  |
| `reviewerName` | String |  |  |  |
| `posterName` | String |  |  |  |
| `cashierName` | String |  |  |  |
| `attachmentCount` | Int | * |  |  |
| `sourcePosted` | Boolean |  |  |  |
| `sourceAudited` | Boolean |  |  |  |
| `sourceInvalid` | Boolean |  |  |  |
| `externalSourceSystem` | String |  |  |  |
| `externalSourceDocumentNo` | String |  |  |  |
| `externalSourceDocumentId` | String |  |  |  |
| `externalSourceAccountSet` | String |  |  |  |
| `externalSourceDate` | String |  |  |  |
| `sourceMetadata` | Json |  |  |  |
| `editedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-11 User](#user), [1-104 FinancePeriod](#financeperiod), [1-101 FinanceLedgerImport](#financeledgerimport)

← Referenced by: [1-52 FinanceAssetPeriodEntry](#financeassetperiodentry), [1-53 FinanceAssetAdjustment](#financeassetadjustment), [1-58 FinanceCashFlowAllocation](#financecashflowallocation), [1-106 FinanceVoucherItem](#financevoucheritem)

### 1-106 FinanceVoucherItem

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
| `settlementStyle` | String |  |  |  |
| `settlementNo` | String |  |  |  |
| `settlementDate` | String |  |  |  |
| `sourceMetadata` | Json |  |  |  |
| `importId` | Int |  | FK | → FinanceLedgerImport.id |

→ Depends on: [1-103 FinanceAccount](#financeaccount), [1-105 FinanceVoucher](#financevoucher), [1-101 FinanceLedgerImport](#financeledgerimport)

← Referenced by: [1-58 FinanceCashFlowAllocation](#financecashflowallocation), [1-58 FinanceCashFlowAllocation](#financecashflowallocation), [1-59 FinanceConsolidationEntryLine](#financeconsolidationentryline), [1-61 FinanceConsolidationMatchSource](#financeconsolidationmatchsource), [1-82 FinanceVoucherItemAuxiliary](#financevoucheritemauxiliary), [1-85 FinanceOpenItem](#financeopenitem), [1-114 ReclassResult](#reclassresult)

### 1-107 FinanceAccountBalance

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

→ Depends on: [1-104 FinancePeriod](#financeperiod), [1-103 FinanceAccount](#financeaccount)

### 1-108 FinanceBalanceSnapshot

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

→ Depends on: [1-11 User](#user), [1-11 User](#user)

← Referenced by: [1-109 FinanceBalanceSnapshotRow](#financebalancesnapshotrow)

### 1-109 FinanceBalanceSnapshotRow

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

→ Depends on: [1-108 FinanceBalanceSnapshot](#financebalancesnapshot), [1-103 FinanceAccount](#financeaccount)

### 1-110 FinanceReclassRule

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `policyVersionId` | Int | * | FK | → FinanceAccountingPolicyVersion.id |
| `sourceGroupAccountId` | Int | * | FK | → FinanceGroupAccount.id |
| `targetGroupAccountId` | Int |  | FK | → FinanceGroupAccount.id |
| `sourceAccountCode` | String | * |  | 规则确认时的集团科目编码快照 |
| `abnormalSide` | String | * |  | debit | credit | both |
| `decision` | String | * |  | reclassify | no_reclass |
| `basis` | String | * |  | 计算口径：account_net = 按科目净额 | counterparty_gross = 按往来户逐户毛额 |
| `targetAccountCode` | String |  |  | 规则确认时的集团目标科目编码快照 |
| `enabled` | Boolean | * |  |  |
| `source` | String | * |  | 仅保留 manual；字段用于历史追溯 |
| `confirmedBy` | Int |  | FK | → User.id |
| `confirmedAt` | DateTime |  |  |  |
| `note` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-89 FinanceAccountingPolicyVersion](#financeaccountingpolicyversion), [1-88 FinanceGroupAccount](#financegroupaccount), [1-88 FinanceGroupAccount](#financegroupaccount), [1-11 User](#user)

← Referenced by: [1-114 ReclassResult](#reclassresult)

### 1-111 FinanceReclassItemRule

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

### 1-112 FinanceBalanceReclassAdjustment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `policyVersionId` | Int | * | FK | → FinanceAccountingPolicyVersion.id |
| `sourceGroupAccountId` | Int |  | FK | → FinanceGroupAccount.id |
| `targetGroupAccountId` | Int |  | FK | → FinanceGroupAccount.id |
| `periodId` | Int | * | cUK |  |
| `companyCode` | String | * |  |  |
| `year` | Int | * |  |  |
| `sourceAccountCode` | String | * | cUK |  |
| `targetAccountCode` | String |  |  |  |
| `amount` | Float | * |  |  |
| `decision` | String | * |  | reclassify | no_reclass |
| `basis` | String | * |  | 实际执行口径：account_net = 按科目净额 | counterparty_gross = 按往来户逐户毛额 |
| `sourceType` | String | * |  | automatic_rule | auxiliary_balance | balance_residual | manual |
| `ruleId` | Int |  |  |  |
| `status` | String | * |  | approved | adjusted | rejected |
| `note` | String |  |  |  |
| `adjustedBy` | Int |  |  |  |
| `adjustedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-89 FinanceAccountingPolicyVersion](#financeaccountingpolicyversion), [1-88 FinanceGroupAccount](#financegroupaccount), [1-88 FinanceGroupAccount](#financegroupaccount)

### 1-113 FinanceBalanceReclassAdjustmentHistory

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `adjustmentIdSnapshot` | Int | * |  |  |
| `policyVersionIdSnapshot` | Int |  |  |  |
| `sourceGroupAccountIdSnapshot` | Int |  |  |  |
| `targetGroupAccountIdSnapshot` | Int |  |  |  |
| `periodId` | Int | * |  |  |
| `companyCode` | String | * |  |  |
| `year` | Int | * |  |  |
| `sourceAccountCode` | String | * |  |  |
| `targetAccountCode` | String |  |  |  |
| `amount` | Float | * |  |  |
| `decision` | String | * |  |  |
| `sourceType` | String | * |  |  |
| `status` | String | * |  |  |
| `ruleIdSnapshot` | Int |  |  |  |
| `adjustedBySnapshot` | Int |  |  |  |
| `adjustedAtSnapshot` | DateTime |  |  |  |
| `note` | String |  |  |  |
| `archiveReason` | String | * |  |  |
| `archivedBy` | Int |  |  |  |
| `archivedAt` | DateTime | * |  |  |

### 1-114 ReclassResult

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

→ Depends on: [1-104 FinancePeriod](#financeperiod), [1-106 FinanceVoucherItem](#financevoucheritem), [1-110 FinanceReclassRule](#financereclassrule), [1-11 User](#user)

### 1-115 FinanceStatementSourcePackage

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyId` | Int | * | cUK |  |
| `companyCode` | String | * |  |  |
| `companyName` | String | * |  |  |
| `year` | Int | * | cUK |  |
| `month` | Int | * | cUK |  |
| `revision` | Int | * | cUK |  |
| `version` | Int | * |  |  |
| `status` | String | * |  | draft | submitted | rejected |
| `fileName` | String | * |  |  |
| `mimeType` | String | * |  |  |
| `fileSize` | Int | * |  |  |
| `fileChecksum` | String | * |  |  |
| `fileContent` | Bytes | * |  |  |
| `parsedCompanyName` | String | * |  |  |
| `note` | String |  |  |  |
| `uploadedBy` | Int | * |  |  |
| `uploadedAt` | DateTime | * |  |  |
| `submittedBy` | Int |  |  |  |
| `submittedAt` | DateTime |  |  |  |
| `rejectedBy` | Int |  |  |  |
| `rejectedAt` | DateTime |  |  |  |
| `rejectionReason` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-116 FinanceStatementSourceSheet](#financestatementsourcesheet), [1-118 FinanceStatementWorkpaper](#financestatementworkpaper)

### 1-116 FinanceStatementSourceSheet

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `packageId` | Int | * | cUK+FK | → FinanceStatementSourcePackage.id |
| `reportType` | String | * | cUK | balanceSheet | incomeStatement | cashFlow |
| `previousYear` | Int | * |  |  |
| `currentYear` | Int | * |  |  |
| `lineCount` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-115 FinanceStatementSourcePackage](#financestatementsourcepackage)

← Referenced by: [1-117 FinanceStatementSourceLine](#financestatementsourceline)

### 1-117 FinanceStatementSourceLine

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `sheetId` | Int | * | cUK+FK | → FinanceStatementSourceSheet.id |
| `lineCode` | String | * | cUK |  |
| `previousAmount` | Decimal | * |  |  |
| `currentAmount` | Decimal | * |  |  |
| `sourceLabel` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-116 FinanceStatementSourceSheet](#financestatementsourcesheet)

### 1-118 FinanceStatementWorkpaper

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `year` | Int | * | cUK |  |
| `month` | Int | * | cUK |  |
| `reportType` | String | * | cUK | balanceSheet | incomeStatement | cashFlow |
| `status` | String | * |  | draft | submitted |
| `note` | String |  |  |  |
| `sourcePackageId` | Int |  | FK | → FinanceStatementSourcePackage.id |
| `sourcePackageRevision` | Int |  |  |  |
| `sourceChecksum` | String |  |  |  |
| `updatedBy` | Int |  | FK | → User.id |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-11 User](#user), [1-115 FinanceStatementSourcePackage](#financestatementsourcepackage)

← Referenced by: [1-119 FinanceStatementWorkpaperLine](#financestatementworkpaperline)

### 1-119 FinanceStatementWorkpaperLine

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

→ Depends on: [1-118 FinanceStatementWorkpaper](#financestatementworkpaper)

### 1-120 FinanceStatementExchangeRate

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `baseCurrency` | String | * |  |  |
| `quoteCurrency` | String | * |  |  |
| `rateKind` | String | * |  | centralParity；历史数据可能为 closing | historicalInvestment |
| `rateDate` | String | * |  | YYYY-MM-DD |
| `rate` | Decimal | * |  | 人民币/1外币 |
| `sourceName` | String | * |  |  |
| `sourceField` | String | * |  |  |
| `sourceUrl` | String | * |  |  |
| `publishedAt` | DateTime |  |  |  |
| `capturedAt` | DateTime | * |  |  |
| `note` | String |  |  |  |
| `version` | Int | * |  |  |
| `updatedBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

### 1-121 FinanceCurrency

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

→ Depends on: [1-101 FinanceLedgerImport](#financeledgerimport)

### 1-122 FinanceBankAccount

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

→ Depends on: [1-103 FinanceAccount](#financeaccount), [1-101 FinanceLedgerImport](#financeledgerimport)

### 1-123 DepartmentDescription

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

→ Depends on: [1-143 Department](#department)

### 1-124 PositionDescription

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-125 PositionDescriptionRevision](#positiondescriptionrevision), [1-144 Position](#position), [1-239 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-125 PositionDescriptionRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `revisionUid` | String | * | UK |  |
| `positionDescriptionId` | Int | * | cUK+FK | → PositionDescription.id |
| `sequence` | Int | * | cUK |  |
| `changeKind` | String | * |  |  |
| `supersedesRevisionId` | Int |  | FK | → PositionDescriptionRevision.id |
| `positionPurpose` | String |  |  |  |
| `summary` | String |  |  |  |
| `headcount` | Int |  |  |  |
| `version` | String |  |  |  |
| `effectiveDate` | String |  |  |  |
| `sourceFile` | String | * |  |  |
| `details` | String |  |  |  |
| `changeReason` | String |  |  |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-124 PositionDescription](#positiondescription), [1-125 PositionDescriptionRevision](#positiondescriptionrevision)

← Referenced by: [1-239 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-126 EmploymentAgreement

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `agreementUid` | String | * | UK |  |
| `employmentId` | Int | * | FK | → Employment.id |
| `recordState` | String | * |  |  |
| `isPrimary` | Boolean | * |  |  |
| `sourceKind` | String | * |  |  |
| `sourceRef` | String |  |  |  |
| `missingFieldsJson` | String | * |  |  |
| `actualEndDate` | String |  |  |  |
| `reason` | String |  |  |  |
| `version` | Int | * |  |  |
| `currentPublishedRevisionId` | Int |  | UK+FK | → EmploymentAgreementRevision.id |
| `createdBy` | Int |  |  |  |
| `updatedBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-141 Employment](#employment), [1-129 EmploymentAgreementRevision](#employmentagreementrevision)

← Referenced by: [1-127 EmploymentAgreementAttachment](#employmentagreementattachment), [1-128 EmploymentAgreementTerm](#employmentagreementterm), [1-129 EmploymentAgreementRevision](#employmentagreementrevision), [1-130 EmploymentAgreementChange](#employmentagreementchange)

### 1-127 EmploymentAgreementAttachment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `attachmentUid` | String | * | UK |  |
| `agreementId` | Int | * | FK | → EmploymentAgreement.id |
| `fileName` | String | * |  |  |
| `mimeType` | String | * |  |  |
| `originalStoragePath` | String | * |  |  |
| `originalSizeBytes` | Int | * |  |  |
| `originalChecksumSha256` | String | * |  |  |
| `optimizedStoragePath` | String |  |  |  |
| `optimizedSizeBytes` | Int |  |  |  |
| `optimizedChecksumSha256` | String |  |  |  |
| `optimizationStatus` | String | * |  |  |
| `optimizationError` | String |  |  |  |
| `compressionSavingsRatio` | Decimal |  |  |  |
| `pageCount` | Int |  |  |  |
| `note` | String |  |  |  |
| `uploadedBy` | Int |  | FK | → User.id |
| `uploadedAt` | DateTime | * |  |  |
| `removedBy` | Int |  | FK | → User.id |
| `removedAt` | DateTime |  |  |  |
| `removalReason` | String |  |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-126 EmploymentAgreement](#employmentagreement), [1-11 User](#user), [1-11 User](#user)

### 1-128 EmploymentAgreementTerm

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `termUid` | String | * | UK |  |
| `agreementId` | Int | * | cUK+FK | → EmploymentAgreement.id |
| `sequence` | Int | * | cUK |  |
| `termKind` | String | * |  |  |
| `effectiveFrom` | String |  |  |  |
| `effectiveThrough` | String |  |  |  |
| `recordState` | String | * |  |  |
| `changeKind` | String | * |  |  |
| `supersedesId` | Int |  | FK | → EmploymentAgreementTerm.id |
| `sourceKind` | String | * |  |  |
| `sourceRef` | String |  |  |  |
| `reason` | String |  |  |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-126 EmploymentAgreement](#employmentagreement), [1-128 EmploymentAgreementTerm](#employmentagreementterm)

### 1-129 EmploymentAgreementRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `revisionUid` | String | * | UK |  |
| `agreementId` | Int | * | cUK+FK | → EmploymentAgreement.id |
| `revisionNo` | Int | * | cUK |  |
| `recordState` | String | * |  |  |
| `changeKind` | String | * |  |  |
| `contentJson` | String | * |  |  |
| `supersedesRevisionId` | Int |  | FK | → EmploymentAgreementRevision.id |
| `sourceKind` | String | * |  |  |
| `sourceRef` | String |  |  |  |
| `reason` | String |  |  |  |
| `createdBy` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-126 EmploymentAgreement](#employmentagreement), [1-129 EmploymentAgreementRevision](#employmentagreementrevision)

← Referenced by: [1-126 EmploymentAgreement](#employmentagreement)

### 1-130 EmploymentAgreementChange

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | String | * | PK |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `agreementId` | Int |  | FK | → EmploymentAgreement.id |
| `commandKind` | String | * |  |  |
| `idempotencyKey` | String | * | UK |  |
| `requestFingerprint` | String | * |  |  |
| `expectedVersion` | Int |  |  |  |
| `effectManifestJson` | String | * |  |  |
| `actorUserId` | Int | * | FK | → User.id |
| `recordedAt` | DateTime | * |  |  |

→ Depends on: [1-140 Employee](#employee), [1-126 EmploymentAgreement](#employmentagreement), [1-11 User](#user)

### 1-131 EmployeeLifecycleEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `eventType` | String | * |  |  |
| `effectiveDate` | String | * |  |  |
| `reason` | String |  |  |  |
| `detailsJson` | String | * |  |  |
| `recordedByUserId` | Int | * | FK | → User.id |
| `recordedAt` | DateTime | * |  |  |

→ Depends on: [1-140 Employee](#employee), [1-11 User](#user)

### 1-132 EmployeePeriodRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | String | * | PK |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `entityType` | String | * |  |  |
| `periodId` | Int | * |  |  |
| `expectedVersion` | Int | * |  |  |
| `beforeJson` | String | * |  |  |
| `afterJson` | String | * |  |  |
| `reason` | String | * |  |  |
| `recordedByUserId` | Int | * | FK | → User.id |
| `recordedAt` | DateTime | * |  |  |

→ Depends on: [1-140 Employee](#employee), [1-11 User](#user)

### 1-133 OrganizationStructureChange

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | String | * | PK+REF |  |
| `aggregateType` | String | * |  |  |
| `aggregateId` | Int | * |  |  |
| `commandKind` | String | * |  |  |
| `effectiveOn` | String | * |  |  |
| `expectedSequence` | Int | * |  |  |
| `idempotencyKey` | String | * | UK |  |
| `requestFingerprint` | String | * |  |  |
| `reason` | String |  |  |  |
| `effectManifestJson` | String | * |  |  |
| `actorUserId` | Int | * |  |  |
| `recordedAt` | DateTime | * |  |  |

← Referenced by: [1-134 DepartmentEffectiveVersion](#departmenteffectiveversion), [1-135 PositionEffectiveVersion](#positioneffectiveversion), [1-136 PositionReportOverrideEffectiveVersion](#positionreportoverrideeffectiveversion)

### 1-134 DepartmentEffectiveVersion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `sequence` | Int | * | cUK |  |
| `validFrom` | String |  |  |  |
| `validToExclusive` | String |  |  |  |
| `recordState` | String | * |  |  |
| `changeKind` | String | * |  |  |
| `supersedesId` | Int |  | FK | → DepartmentEffectiveVersion.id |
| `sourceChangeId` | String | * | FK | → OrganizationStructureChange.id |
| `code` | String | * |  |  |
| `name` | String | * |  |  |
| `alias` | String |  |  |  |
| `hierarchyKind` | String | * |  |  |
| `level` | Int | * |  |  |
| `parentId` | Int |  | FK | → Department.id |
| `managerPositionId` | Int |  | FK | → Position.id |
| `createdBy` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-143 Department](#department), [1-143 Department](#department), [1-144 Position](#position), [1-133 OrganizationStructureChange](#organizationstructurechange), [1-134 DepartmentEffectiveVersion](#departmenteffectiveversion)

### 1-135 PositionEffectiveVersion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `positionId` | Int | * | cUK+FK | → Position.id |
| `sequence` | Int | * | cUK |  |
| `validFrom` | String |  |  |  |
| `validToExclusive` | String |  |  |  |
| `recordState` | String | * |  |  |
| `changeKind` | String | * |  |  |
| `supersedesId` | Int |  | FK | → PositionEffectiveVersion.id |
| `sourceChangeId` | String | * | FK | → OrganizationStructureChange.id |
| `code` | String | * |  |  |
| `name` | String | * |  |  |
| `alias` | String |  |  |  |
| `departmentId` | Int |  | FK | → Department.id |
| `reportToPositionId` | Int |  | FK | → Position.id |
| `createdBy` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-144 Position](#position), [1-143 Department](#department), [1-144 Position](#position), [1-133 OrganizationStructureChange](#organizationstructurechange), [1-135 PositionEffectiveVersion](#positioneffectiveversion)

### 1-136 PositionReportOverrideEffectiveVersion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `positionReportOverrideId` | Int | * | FK | → PositionReportOverride.id |
| `sequence` | Int | * |  |  |
| `validFrom` | String |  |  |  |
| `validToExclusive` | String |  |  |  |
| `recordState` | String | * |  |  |
| `changeKind` | String | * |  |  |
| `supersedesId` | Int |  | FK | → PositionReportOverrideEffectiveVersion.id |
| `sourceChangeId` | String | * | FK | → OrganizationStructureChange.id |
| `reportToPositionId` | Int |  | FK | → Position.id |
| `headcount` | Int |  |  |  |
| `remark` | String |  |  |  |
| `departmentId` | Int |  | FK | → Department.id |
| `createdBy` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-146 PositionReportOverride](#positionreportoverride), [1-144 Position](#position), [1-143 Department](#department), [1-133 OrganizationStructureChange](#organizationstructurechange), [1-136 PositionReportOverrideEffectiveVersion](#positionreportoverrideeffectiveversion)

### 1-137 HrPerformanceReview

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
| `workEvidenceSnapshotJson` | String | * |  |  |
| `archivedByUserId` | Int |  |  |  |
| `archivedAt` | DateTime | * |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-140 Employee](#employee)

### 1-138 EmployeeSocialInsurancePeriod

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `periodUid` | String | * | UK |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `insuranceStatus` | String | * |  |  |
| `companyId` | Int |  | FK | → Company.id |
| `companyNameSnapshot` | String |  |  |  |
| `startMonth` | DateTime |  |  |  |
| `endMonth` | DateTime |  |  |  |
| `stopReason` | String |  |  |  |
| `note` | String |  |  |  |
| `missingFieldsJson` | String | * |  |  |
| `recordState` | String | * |  |  |
| `sourceKind` | String | * |  |  |
| `sourceRef` | String |  |  |  |
| `createdBy` | Int |  | FK | → User.id |
| `updatedBy` | Int |  | FK | → User.id |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-140 Employee](#employee), [1-142 Company](#company), [1-11 User](#user), [1-11 User](#user)

← Referenced by: [1-139 EmployeeSocialInsurancePeriodRevision](#employeesocialinsuranceperiodrevision)

### 1-139 EmployeeSocialInsurancePeriodRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `revisionUid` | String | * | UK |  |
| `periodId` | Int | * | cUK+FK | → EmployeeSocialInsurancePeriod.id |
| `revisionNo` | Int | * | cUK |  |
| `changeKind` | String | * |  |  |
| `beforeJson` | String | * |  |  |
| `afterJson` | String | * |  |  |
| `reason` | String | * |  |  |
| `recordedBy` | Int | * | FK | → User.id |
| `recordedAt` | DateTime | * |  |  |

→ Depends on: [1-138 EmployeeSocialInsurancePeriod](#employeesocialinsuranceperiod), [1-11 User](#user)

### 1-140 Employee

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

→ Depends on: [1-11 User](#user)

← Referenced by: [1-31 Contract](#contract), [1-75 FinanceShipment](#financeshipment), [1-76 FinanceSalesSalary](#financesalessalary), [1-79 FinanceWorkshopReport](#financeworkshopreport), [1-130 EmploymentAgreementChange](#employmentagreementchange), [1-131 EmployeeLifecycleEvent](#employeelifecycleevent), [1-132 EmployeePeriodRevision](#employeeperiodrevision), [1-137 HrPerformanceReview](#hrperformancereview), [1-138 EmployeeSocialInsurancePeriod](#employeesocialinsuranceperiod), [1-141 Employment](#employment), [1-145 EDP](#edp), [1-211 WorkKpiAssignment](#workkpiassignment), [1-231 EmployeeProject](#employeeproject), [1-232 ProjectMembershipChange](#projectmembershipchange), [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem)

### 1-141 Employment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
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

→ Depends on: [1-140 Employee](#employee)

← Referenced by: [1-126 EmploymentAgreement](#employmentagreement)

### 1-142 Company

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `partyId` | Int | * | UK+FK | → Party.id |
| `code` | String | * | UK |  |
| `description` | String |  |  |  |
| `registeredCapital` | String |  |  |  |
| `bankName` | String |  |  |  |
| `registeredAddress` | String |  |  |  |
| `registeredDate` | String |  |  |  |
| `managementGroup` | String | * |  |  |
| `codePoolCode` | String |  |  |  |
| `isActive` | Boolean | * |  |  |
| `sortOrder` | Int | * |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |
| `financeCurrencyPolicy` | FinanceCompanyCurrencyPolicy |  |  |  |

→ Depends on: [1-42 Party](#party)

← Referenced by: [1-19 OwnershipInterest](#ownershipinterest), [1-20 OwnershipProjectionRun](#ownershipprojectionrun), [1-21 CompanyRegistryChange](#companyregistrychange), [1-23 ShareCapitalEvent](#sharecapitalevent), [1-26 ShareholderGroup](#shareholdergroup), [1-31 Contract](#contract), [1-47 ExternalPartySourceMapping](#externalpartysourcemapping), [1-62 FinanceVoucherCompanyMappingRule](#financevouchercompanymappingrule), [1-66 FinanceCompanyCurrencyPolicy](#financecompanycurrencypolicy), [1-80 FinanceAuxiliaryMember](#financeauxiliarymember), [1-138 EmployeeSocialInsurancePeriod](#employeesocialinsuranceperiod), [1-145 EDP](#edp), [1-146 PositionReportOverride](#positionreportoverride)

### 1-143 Department

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

→ Depends on: [1-144 Position](#position), [1-143 Department](#department)

← Referenced by: [1-16 DepartmentResourceActionGrant](#departmentresourceactiongrant), [1-31 Contract](#contract), [1-123 DepartmentDescription](#departmentdescription), [1-134 DepartmentEffectiveVersion](#departmenteffectiveversion), [1-134 DepartmentEffectiveVersion](#departmenteffectiveversion), [1-135 PositionEffectiveVersion](#positioneffectiveversion), [1-136 PositionReportOverrideEffectiveVersion](#positionreportoverrideeffectiveversion), [1-144 Position](#position), [1-145 EDP](#edp), [1-146 PositionReportOverride](#positionreportoverride), [1-207 DepartmentCollaboration](#departmentcollaboration), [1-208 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-210 WorkKpiDefinition](#workkpidefinition), [1-229 Project](#project), [1-230 ProjectEnablingDepartment](#projectenablingdepartment), [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem), [1-245 DepartmentWorkAssignee](#departmentworkassignee)

### 1-144 Position

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

→ Depends on: [1-124 PositionDescription](#positiondescription), [1-144 Position](#position), [1-143 Department](#department)

← Referenced by: [1-15 PositionResourceActionGrant](#positionresourceactiongrant), [1-79 FinanceWorkshopReport](#financeworkshopreport), [1-134 DepartmentEffectiveVersion](#departmenteffectiveversion), [1-135 PositionEffectiveVersion](#positioneffectiveversion), [1-135 PositionEffectiveVersion](#positioneffectiveversion), [1-136 PositionReportOverrideEffectiveVersion](#positionreportoverrideeffectiveversion), [1-143 Department](#department), [1-145 EDP](#edp), [1-145 EDP](#edp), [1-146 PositionReportOverride](#positionreportoverride), [1-146 PositionReportOverride](#positionreportoverride), [1-209 DepartmentCollaborationPosition](#departmentcollaborationposition)

### 1-145 EDP

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `reportingCompanyId` | Int |  | FK | → Company.id |
| `departmentId` | Int |  | FK | → Department.id |
| `positionId` | Int |  | FK | → Position.id |
| `positionReportOverrideId` | Int |  | FK | → PositionReportOverride.id |
| `isPrimary` | Boolean | * |  |  |
| `startDate` | String |  |  |  |
| `endDate` | String |  |  |  |
| `reportTo` | String |  |  |  |
| `reportToPositionId` | Int |  | FK | → Position.id |
| `allocationWeight` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |

→ Depends on: [1-144 Position](#position), [1-143 Department](#department), [1-142 Company](#company), [1-146 PositionReportOverride](#positionreportoverride), [1-140 Employee](#employee), [1-144 Position](#position)

← Referenced by: [1-1 ErpDueDiligenceSubmission](#erpduediligencesubmission)

### 1-146 PositionReportOverride

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
| `version` | Int | * |  |  |

→ Depends on: [1-144 Position](#position), [1-142 Company](#company), [1-143 Department](#department), [1-144 Position](#position)

← Referenced by: [1-136 PositionReportOverrideEffectiveVersion](#positionreportoverrideeffectiveversion), [1-145 EDP](#edp)

### 1-147 EditHistory

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

→ Depends on: [1-11 User](#user)

### 1-148 InventoryItem

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `productMasterId` | Int |  | FK | → Product.id |
| `companyCode` | String | * | cUK |  |
| `code` | String | * | cUK |  |
| `name` | String | * |  |  |
| `itemType` | String | * |  |  |
| `specification` | String |  |  |  |
| `baseUnit` | String | * |  |  |
| `contentUnit` | String |  |  |  |
| `unitsPerPackage` | Decimal |  |  |  |
| `packagesPerCase` | Decimal |  |  |  |
| `barcode` | String |  |  |  |
| `status` | String | * |  |  |
| `note` | String |  |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceKey` | String |  | cUK |  |
| `editedBy` | Int |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-199 Product](#product)

← Referenced by: [1-75 FinanceShipment](#financeshipment), [1-77 FinanceCostStructureRow](#financecoststructurerow), [1-149 InventoryUnitConversion](#inventoryunitconversion), [1-151 InventoryBatch](#inventorybatch), [1-153 InventoryDocumentLine](#inventorydocumentline), [1-154 InventoryLedgerEntry](#inventoryledgerentry), [1-156 InventoryStocktakeLine](#inventorystocktakeline), [1-163 InventoryReceiptOutput](#inventoryreceiptoutput), [1-200 ProductSourceMapping](#productsourcemapping)

### 1-149 InventoryUnitConversion

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `itemId` | Int | * | cUK+FK | → InventoryItem.id |
| `unit` | String | * | cUK |  |
| `factor` | Decimal | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-148 InventoryItem](#inventoryitem)

### 1-150 InventoryWarehouse

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `companyCode` | String | * | cUK |  |
| `code` | String | * | cUK |  |
| `name` | String | * |  |  |
| `status` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-151 InventoryBatch](#inventorybatch), [1-153 InventoryDocumentLine](#inventorydocumentline), [1-154 InventoryLedgerEntry](#inventoryledgerentry), [1-155 InventoryStocktake](#inventorystocktake), [1-156 InventoryStocktakeLine](#inventorystocktakeline)

### 1-151 InventoryBatch

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

→ Depends on: [1-148 InventoryItem](#inventoryitem), [1-150 InventoryWarehouse](#inventorywarehouse)

← Referenced by: [1-153 InventoryDocumentLine](#inventorydocumentline), [1-154 InventoryLedgerEntry](#inventoryledgerentry), [1-156 InventoryStocktakeLine](#inventorystocktakeline)

### 1-152 InventoryDocument

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

← Referenced by: [1-153 InventoryDocumentLine](#inventorydocumentline)

### 1-153 InventoryDocumentLine

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

→ Depends on: [1-152 InventoryDocument](#inventorydocument), [1-148 InventoryItem](#inventoryitem), [1-150 InventoryWarehouse](#inventorywarehouse), [1-151 InventoryBatch](#inventorybatch)

← Referenced by: [1-154 InventoryLedgerEntry](#inventoryledgerentry)

### 1-154 InventoryLedgerEntry

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

→ Depends on: [1-153 InventoryDocumentLine](#inventorydocumentline), [1-148 InventoryItem](#inventoryitem), [1-150 InventoryWarehouse](#inventorywarehouse), [1-151 InventoryBatch](#inventorybatch)

### 1-155 InventoryStocktake

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

→ Depends on: [1-150 InventoryWarehouse](#inventorywarehouse)

← Referenced by: [1-156 InventoryStocktakeLine](#inventorystocktakeline)

### 1-156 InventoryStocktakeLine

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

→ Depends on: [1-155 InventoryStocktake](#inventorystocktake), [1-148 InventoryItem](#inventoryitem), [1-150 InventoryWarehouse](#inventorywarehouse), [1-151 InventoryBatch](#inventorybatch)

### 1-157 InventoryPeriodClose

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

### 1-158 InventoryImportBatch

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

### 1-159 InventoryReceiptReport

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `recordUid` | String | * | UK |  |
| `year` | Int | * | cUK |  |
| `month` | Int | * | cUK |  |
| `workshopName` | String | * | cUK |  |
| `status` | String | * |  |  |
| `preparedBy` | String |  |  |  |
| `preparedByUserId` | Int |  |  |  |
| `preparedAt` | DateTime |  |  |  |
| `reviewedBy` | String |  |  |  |
| `reviewedByUserId` | Int |  |  |  |
| `reviewedAt` | DateTime |  |  |  |
| `confirmedSnapshot` | Json |  |  |  |
| `confirmedSnapshotHash` | String |  |  |  |
| `confirmationSource` | String |  |  |  |
| `sourceKey` | String |  | UK |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `version` | Int | * |  |  |
| `createdByUserId` | Int |  |  |  |
| `updatedByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-77 FinanceCostStructureRow](#financecoststructurerow), [1-160 InventoryReceiptProductWorkPoint](#inventoryreceiptproductworkpoint), [1-161 InventoryReceiptReportEvent](#inventoryreceiptreportevent), [1-162 InventoryReceiptBatch](#inventoryreceiptbatch)

### 1-160 InventoryReceiptProductWorkPoint

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `reportId` | Int | * | cUK+FK | → InventoryReceiptReport.id |
| `productId` | Int |  | cUK+FK | → Product.id |
| `sortOrder` | Int | * |  |  |
| `productName` | String | * | cUK |  |
| `workPoints` | Decimal | * |  |  |
| `sourceKey` | String |  | UK |  |
| `version` | Int | * |  |  |
| `createdByUserId` | Int |  |  |  |
| `updatedByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-159 InventoryReceiptReport](#inventoryreceiptreport), [1-199 Product](#product)

### 1-161 InventoryReceiptReportEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `reportId` | Int | * | FK | → InventoryReceiptReport.id |
| `eventType` | String | * |  |  |
| `actorUserId` | Int |  |  |  |
| `actorName` | String | * |  |  |
| `reportVersion` | Int | * |  |  |
| `snapshotHash` | String | * |  |  |
| `sourceKey` | String |  | UK |  |
| `payload` | Json |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-159 InventoryReceiptReport](#inventoryreceiptreport)

### 1-162 InventoryReceiptBatch

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `reportId` | Int | * | FK | → InventoryReceiptReport.id |
| `productId` | Int |  | FK | → Product.id |
| `sortOrder` | Int | * |  |  |
| `productName` | String | * |  |  |
| `specification` | String |  |  |  |
| `batchNumber` | String | * |  |  |
| `inputQuantityTenThousands` | Decimal |  |  |  |
| `sourceKey` | String |  | UK |  |
| `sourceRowStart` | Int |  |  |  |
| `sourceRowEnd` | Int |  |  |  |
| `version` | Int | * |  |  |
| `createdByUserId` | Int |  |  |  |
| `updatedByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-159 InventoryReceiptReport](#inventoryreceiptreport), [1-199 Product](#product)

← Referenced by: [1-163 InventoryReceiptOutput](#inventoryreceiptoutput)

### 1-163 InventoryReceiptOutput

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | Int | * | FK | → InventoryReceiptBatch.id |
| `productSkuId` | Int |  | FK | → InventoryItem.id |
| `sortOrder` | Int | * |  |  |
| `productionQuantityText` | String |  |  |  |
| `caseQuantity` | Decimal |  |  |  |
| `extraPackageQuantity` | Decimal |  |  |  |
| `packagesPerCase` | Decimal | * |  |  |
| `unitsPerPackage` | Decimal | * |  |  |
| `packageUnit` | String | * |  |  |
| `packagingNote` | String | * |  |  |
| `sourceKey` | String |  | UK |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `sourceConvertedPackages` | Decimal |  |  |  |
| `sourceConvertedTenThousands` | Decimal |  |  |  |
| `sourceConvertedPackagesFormula` | String |  |  |  |
| `sourceConvertedTenThousandsFormula` | String |  |  |  |
| `auditStatus` | String | * |  |  |
| `auditNote` | String |  |  |  |
| `version` | Int | * |  |  |
| `createdByUserId` | Int |  |  |  |
| `updatedByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-162 InventoryReceiptBatch](#inventoryreceiptbatch), [1-148 InventoryItem](#inventoryitem)

### 1-164 StockRawMaterial

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

→ Depends on: [1-11 User](#user)

### 1-165 StockPackaging

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

→ Depends on: [1-11 User](#user)

### 1-166 StockFinishedGoods

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

→ Depends on: [1-11 User](#user)

### 1-167 StockBatch

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

### 1-168 StockOperation

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

→ Depends on: [1-11 User](#user)

### 1-169 StockReturn

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `finishedGoodsId` | Int | * |  |  |
| `returnDate` | String | * |  |  |
| `quantity` | Float | * |  |  |
| `salesman` | String |  |  |  |
| `reason` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-170 LibraryTagCandidate

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

→ Depends on: [1-180 LibraryDocument](#librarydocument), [1-181 LibraryDocumentVersion](#librarydocumentversion), [1-189 LibraryTag](#librarytag), [1-11 User](#user)

### 1-171 LibraryEntityMention

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

→ Depends on: [1-181 LibraryDocumentVersion](#librarydocumentversion), [1-177 LibraryContentChunk](#librarycontentchunk)

### 1-172 LibraryMetadataCandidate

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

→ Depends on: [1-180 LibraryDocument](#librarydocument), [1-181 LibraryDocumentVersion](#librarydocumentversion), [1-11 User](#user)

### 1-173 LibraryEvaluationCase

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

→ Depends on: [1-11 User](#user), [1-11 User](#user)

← Referenced by: [1-174 LibraryEvaluationEvidence](#libraryevaluationevidence)

### 1-174 LibraryEvaluationEvidence

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

→ Depends on: [1-173 LibraryEvaluationCase](#libraryevaluationcase), [1-181 LibraryDocumentVersion](#librarydocumentversion)

### 1-175 LibraryProcessingJob

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

→ Depends on: [1-181 LibraryDocumentVersion](#librarydocumentversion)

← Referenced by: [1-176 LibraryArtifact](#libraryartifact)

### 1-176 LibraryArtifact

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

→ Depends on: [1-181 LibraryDocumentVersion](#librarydocumentversion), [1-175 LibraryProcessingJob](#libraryprocessingjob)

← Referenced by: [1-177 LibraryContentChunk](#librarycontentchunk), [1-178 LibrarySearchIndex](#librarysearchindex)

### 1-177 LibraryContentChunk

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

→ Depends on: [1-181 LibraryDocumentVersion](#librarydocumentversion), [1-176 LibraryArtifact](#libraryartifact)

← Referenced by: [1-171 LibraryEntityMention](#libraryentitymention)

### 1-178 LibrarySearchIndex

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

→ Depends on: [1-181 LibraryDocumentVersion](#librarydocumentversion), [1-176 LibraryArtifact](#libraryartifact)

### 1-179 LibraryExportJob

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

→ Depends on: [1-11 User](#user)

### 1-180 LibraryDocument

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

→ Depends on: [1-11 User](#user), [1-11 User](#user), [1-11 User](#user), [1-182 LibraryCategory](#librarycategory), [1-183 LibraryDirectory](#librarydirectory), [1-181 LibraryDocumentVersion](#librarydocumentversion)

← Referenced by: [1-170 LibraryTagCandidate](#librarytagcandidate), [1-172 LibraryMetadataCandidate](#librarymetadatacandidate), [1-181 LibraryDocumentVersion](#librarydocumentversion), [1-187 DueDiligenceMaterialSelection](#duediligencematerialselection), [1-190 LibraryDocumentTag](#librarydocumenttag)

### 1-181 LibraryDocumentVersion

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

→ Depends on: [1-180 LibraryDocument](#librarydocument), [1-11 User](#user)

← Referenced by: [1-170 LibraryTagCandidate](#librarytagcandidate), [1-171 LibraryEntityMention](#libraryentitymention), [1-172 LibraryMetadataCandidate](#librarymetadatacandidate), [1-174 LibraryEvaluationEvidence](#libraryevaluationevidence), [1-175 LibraryProcessingJob](#libraryprocessingjob), [1-176 LibraryArtifact](#libraryartifact), [1-177 LibraryContentChunk](#librarycontentchunk), [1-178 LibrarySearchIndex](#librarysearchindex), [1-180 LibraryDocument](#librarydocument), [1-187 DueDiligenceMaterialSelection](#duediligencematerialselection)

### 1-182 LibraryCategory

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

→ Depends on: [1-182 LibraryCategory](#librarycategory)

← Referenced by: [1-180 LibraryDocument](#librarydocument)

### 1-183 LibraryDirectory

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

← Referenced by: [1-180 LibraryDocument](#librarydocument)

### 1-184 DueDiligenceParty

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

← Referenced by: [1-185 DueDiligenceRequest](#duediligencerequest)

### 1-185 DueDiligenceRequest

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

→ Depends on: [1-184 DueDiligenceParty](#duediligenceparty)

← Referenced by: [1-186 DueDiligenceQuestion](#duediligencequestion)

### 1-186 DueDiligenceQuestion

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

→ Depends on: [1-185 DueDiligenceRequest](#duediligencerequest)

← Referenced by: [1-187 DueDiligenceMaterialSelection](#duediligencematerialselection)

### 1-187 DueDiligenceMaterialSelection

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

→ Depends on: [1-186 DueDiligenceQuestion](#duediligencequestion), [1-180 LibraryDocument](#librarydocument), [1-181 LibraryDocumentVersion](#librarydocumentversion)

### 1-188 LibraryGeneratedSource

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

### 1-189 LibraryTag

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

← Referenced by: [1-170 LibraryTagCandidate](#librarytagcandidate), [1-190 LibraryDocumentTag](#librarydocumenttag)

### 1-190 LibraryDocumentTag

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `documentId` | Int | * | cUK+FK | → LibraryDocument.id |
| `tagId` | Int | * | cUK+FK | → LibraryTag.id |
| `createdBy` | Int |  | FK | → User.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-180 LibraryDocument](#librarydocument), [1-189 LibraryTag](#librarytag), [1-11 User](#user)

### 1-191 MutationImpactBatch

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | String | * | PK+REF |  |
| `actorUserId` | Int |  | FK | → User.id |
| `actorLabel` | String |  |  |  |
| `scopeType` | String |  |  |  |
| `scopeId` | String |  |  |  |
| `requestId` | String |  |  |  |
| `rootEntityType` | String | * |  |  |
| `rootEntityId` | String | * |  |  |
| `intent` | String | * |  |  |
| `policyRevision` | String | * |  |  |
| `impactFingerprint` | String | * |  |  |
| `resolutionsJson` | String | * |  | 仅保存 relationKey + resolution 的允许列表 |
| `status` | String | * |  | pending, succeeded, failed, stale_confirmation |
| `resultCode` | String |  |  |  |
| `resultMessage` | String |  |  |  |
| `sourceBatchId` | String |  | FK | restore 批次指向其使用的 archive provenance 批次 |
| `startedAt` | DateTime | * |  |  |
| `finishedAt` | DateTime |  |  |  |

→ Depends on: [1-11 User](#user), [1-191 MutationImpactBatch](#mutationimpactbatch)

← Referenced by: [1-192 MutationImpactEffect](#mutationimpacteffect)

### 1-192 MutationImpactEffect

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | String | * | cUK+FK | → MutationImpactBatch.id |
| `sequence` | Int | * | cUK |  |
| `relationKey` | String | * |  |  |
| `relationPathJson` | String | * |  | 从 root 到 effect 的 relationKey 有序列表 |
| `policyKey` | String | * |  |  |
| `entityType` | String | * |  |  |
| `entityId` | String | * |  |  |
| `operation` | String | * |  |  |
| `beforeRevision` | String |  |  | adapter 提供的版本、updatedAt 或稳定状态指纹 |
| `afterRevision` | String |  |  | restore 前必须与当前 revision 重新比较 |
| `beforeSummaryJson` | String |  |  | 仅允许模块声明的非敏感摘要字段 |
| `afterSummaryJson` | String |  |  | 仅允许模块声明的非敏感摘要字段 |
| `changedInBatch` | Boolean | * |  | false 表示已处于目标状态，本批次未改写 |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-191 MutationImpactBatch](#mutationimpactbatch)

### 1-193 NotificationSubscription

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `userId` | Int | * | cUK+FK | → User.id |
| `eventKey` | String | * | cUK |  |
| `enabled` | Boolean | * |  |  |
| `channel` | String | * | cUK |  |
| `cadence` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-11 User](#user)

← Referenced by: [1-18 Notification](#notification)

### 1-194 OpenApiClient

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

← Referenced by: [1-197 OpenApiClientScopeGrant](#openapiclientscopegrant), [1-198 OpenApiAccessLog](#openapiaccesslog)

### 1-195 OpenApiResource

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

← Referenced by: [1-196 OpenApiScope](#openapiscope)

### 1-196 OpenApiScope

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

→ Depends on: [1-195 OpenApiResource](#openapiresource)

← Referenced by: [1-197 OpenApiClientScopeGrant](#openapiclientscopegrant)

### 1-197 OpenApiClientScopeGrant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `clientId` | Int | * | cUK+FK | → OpenApiClient.id |
| `scopeId` | Int | * | cUK+FK | → OpenApiScope.id |
| `action` | String | * | cUK |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-194 OpenApiClient](#openapiclient), [1-196 OpenApiScope](#openapiscope)

### 1-198 OpenApiAccessLog

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

→ Depends on: [1-194 OpenApiClient](#openapiclient)

### 1-199 Product

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String | * | UK |  |
| `identityKey` | String | * | UK |  |
| `name` | String | * |  |  |
| `dosageForm` | String |  |  |  |
| `strength` | String |  |  |  |
| `approvalNumber` | String |  |  |  |
| `status` | String | * |  |  |
| `note` | String |  |  |  |
| `editedByUserId` | Int |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-148 InventoryItem](#inventoryitem), [1-160 InventoryReceiptProductWorkPoint](#inventoryreceiptproductworkpoint), [1-162 InventoryReceiptBatch](#inventoryreceiptbatch), [1-200 ProductSourceMapping](#productsourcemapping), [1-201 ProductionQcBatch](#productionqcbatch)

### 1-200 ProductSourceMapping

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `productId` | Int |  | FK | → Product.id |
| `productSkuId` | Int |  | FK | → InventoryItem.id |
| `sourceSystem` | String | * | cUK |  |
| `sourceKey` | String | * | cUK |  |
| `sourceCode` | String |  |  |  |
| `sourceName` | String | * |  |  |
| `sourceSpecification` | String |  |  |  |
| `normalizedName` | String | * |  |  |
| `normalizedSpecification` | String |  |  |  |
| `status` | String | * |  |  |
| `sourceFile` | String |  |  |  |
| `sourceSheet` | String |  |  |  |
| `sourceRow` | Int |  |  |  |
| `sourceData` | Json |  |  |  |
| `reviewedByUserId` | Int |  |  |  |
| `reviewedAt` | DateTime |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-199 Product](#product), [1-148 InventoryItem](#inventoryitem)

### 1-201 ProductionQcBatch

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `recordUid` | String | * | UK |  |
| `legacyFileId` | Int |  | UK |  |
| `batchNumber` | String | * |  |  |
| `productId` | Int |  | FK | → Product.id |
| `productKey` | String | * |  |  |
| `productName` | String | * |  |  |
| `templateId` | Int | * | FK | → DocumentTemplate.id |
| `templateVersion` | Int | * |  |  |
| `templateSnapshot` | Json | * |  |  |
| `templateHash` | String | * |  |  |
| `status` | String | * |  |  |
| `version` | Int | * |  |  |
| `createdByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-199 Product](#product), [1-40 DocumentTemplate](#documenttemplate)

← Referenced by: [1-202 ProductionQcFieldValue](#productionqcfieldvalue), [1-203 ProductionQcSignature](#productionqcsignature)

### 1-202 ProductionQcFieldValue

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | Int | * | cUK+FK | → ProductionQcBatch.id |
| `fieldKey` | String | * | cUK |  |
| `value` | String | * |  |  |
| `valueType` | String |  |  |  |
| `unit` | String |  |  |  |
| `source` | String | * |  |  |
| `lastRecordVersion` | Int | * |  |  |
| `updatedByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-201 ProductionQcBatch](#productionqcbatch)

### 1-203 ProductionQcSignature

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | Int | * | FK | → ProductionQcBatch.id |
| `fieldKey` | String | * |  |  |
| `scopeKey` | String | * |  |  |
| `scopeKind` | String | * |  |  |
| `stageKey` | String | * |  |  |
| `testName` | String |  |  |  |
| `role` | String | * |  |  |
| `meaning` | String | * |  |  |
| `signerUserId` | Int |  |  |  |
| `signerEmployeeId` | String |  |  |  |
| `signerName` | String | * |  |  |
| `signedAt` | DateTime | * |  |  |
| `signedRecordVersion` | Int | * |  |  |
| `signedPayloadHash` | String | * |  |  |
| `authMethod` | String | * |  |  |

→ Depends on: [1-201 ProductionQcBatch](#productionqcbatch)

### 1-204 ProductionQcAuditEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `batchId` | Int |  |  |  |
| `batchRecordUid` | String | * |  |  |
| `batchNumber` | String | * |  |  |
| `eventType` | String | * |  |  |
| `action` | String |  |  |  |
| `fieldKey` | String |  |  |  |
| `stageKey` | String |  |  |  |
| `testName` | String |  |  |  |
| `role` | String |  |  |  |
| `actorUserId` | Int |  |  |  |
| `actorEmployeeId` | String |  |  |  |
| `actorName` | String |  |  |  |
| `signatureMeaning` | String |  |  |  |
| `signedPayloadHash` | String |  |  |  |
| `beforeValue` | String |  |  |  |
| `afterValue` | String |  |  |  |
| `recordVersion` | Int | * |  |  |
| `payload` | Json |  |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-205 SystemConfig

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `key` | String | * |  |  |
| `value` | String | * |  |  |

### 1-206 LoginAttempt

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `username` | String | * |  |  |
| `ip` | String | * |  |  |
| `success` | Boolean | * |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-207 DepartmentCollaboration

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

→ Depends on: [1-143 Department](#department), [1-11 User](#user)

← Referenced by: [1-208 DepartmentCollaborationDepartment](#departmentcollaborationdepartment), [1-209 DepartmentCollaborationPosition](#departmentcollaborationposition), [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem)

### 1-208 DepartmentCollaborationDepartment

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

→ Depends on: [1-207 DepartmentCollaboration](#departmentcollaboration), [1-143 Department](#department), [1-11 User](#user)

### 1-209 DepartmentCollaborationPosition

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `collaborationId` | Int | * | cUK+FK | → DepartmentCollaboration.id |
| `kind` | String | * | cUK |  |
| `positionId` | Int | * | cUK+FK | → Position.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-207 DepartmentCollaboration](#departmentcollaboration), [1-144 Position](#position)

### 1-210 WorkKpiDefinition

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `code` | String | * | cUK |  |
| `version` | Int | * | cUK |  |
| `status` | String | * |  |  |
| `name` | String | * |  |  |
| `description` | String | * |  |  |
| `valueType` | String | * |  |  |
| `displayType` | String | * |  |  |
| `unit` | String | * |  |  |
| `direction` | String | * |  |  |
| `defaultScoringRuleJson` | String | * |  |  |
| `measurementMode` | String | * |  |  |
| `ownerDepartmentId` | Int | * | FK | → Department.id |
| `createdByUserId` | Int | * | FK | → User.id |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-143 Department](#department), [1-11 User](#user)

← Referenced by: [1-211 WorkKpiAssignment](#workkpiassignment)

### 1-211 WorkKpiAssignment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `workPlanId` | Int | * | cUK+FK | → WorkPlan.id |
| `definitionId` | Int | * | cUK+FK | → WorkKpiDefinition.id |
| `workItemId` | Int | * | UK+FK | → WorkItem.id |
| `ownerEmployeeId` | Int | * | FK | → Employee.id |
| `sourceAssignmentId` | Int |  | FK | → WorkKpiAssignment.id |
| `relationKind` | String | * |  |  |
| `weight` | Decimal | * |  |  |
| `baselineValue` | Decimal |  |  |  |
| `targetValue` | Decimal |  |  |  |
| `targetLowerBound` | Decimal |  |  |  |
| `targetUpperBound` | Decimal |  |  |  |
| `currentValue` | Decimal |  |  |  |
| `definitionSnapshotJson` | String | * |  |  |
| `scoringRuleSnapshotJson` | String | * |  |  |
| `version` | Int | * |  |  |
| `updatedByUserId` | Int | * | FK | → User.id |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-241 WorkPlan](#workplan), [1-210 WorkKpiDefinition](#workkpidefinition), [1-242 WorkItem](#workitem), [1-140 Employee](#employee), [1-211 WorkKpiAssignment](#workkpiassignment), [1-11 User](#user)

← Referenced by: [1-212 WorkKpiResultSnapshot](#workkpiresultsnapshot)

### 1-212 WorkKpiResultSnapshot

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `assignmentId` | Int | * | cUK+FK | → WorkKpiAssignment.id |
| `workReportId` | Int | * | FK | → WorkReport.id |
| `version` | Int | * | cUK |  |
| `previousSnapshotId` | Int |  | FK | → WorkKpiResultSnapshot.id |
| `actualValue` | Decimal | * |  |  |
| `scoreBeforeAdjustment` | Decimal | * |  |  |
| `confirmedScore` | Decimal | * |  |  |
| `adjustmentReason` | String | * |  |  |
| `definitionSnapshotJson` | String | * |  |  |
| `assignmentSnapshotJson` | String | * |  |  |
| `scoringRuleSnapshotJson` | String | * |  |  |
| `evidenceSnapshotJson` | String | * |  |  |
| `approvedByUserId` | Int | * | FK | → User.id |
| `approvedAt` | DateTime | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-211 WorkKpiAssignment](#workkpiassignment), [1-237 WorkReport](#workreport), [1-212 WorkKpiResultSnapshot](#workkpiresultsnapshot), [1-11 User](#user)

### 1-213 MeetingType

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

← Referenced by: [1-214 MeetingSeries](#meetingseries), [1-215 Meeting](#meeting)

### 1-214 MeetingSeries

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

→ Depends on: [1-213 MeetingType](#meetingtype)

← Referenced by: [1-215 Meeting](#meeting)

### 1-215 Meeting

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

→ Depends on: [1-213 MeetingType](#meetingtype), [1-214 MeetingSeries](#meetingseries), [1-11 User](#user), [1-11 User](#user)

← Referenced by: [1-216 MeetingParticipant](#meetingparticipant), [1-217 MeetingAgendaItem](#meetingagendaitem), [1-218 MeetingMinuteEntry](#meetingminuteentry), [1-219 MeetingProposal](#meetingproposal), [1-221 MeetingDecision](#meetingdecision), [1-222 MeetingActionCandidate](#meetingactioncandidate), [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem)

### 1-216 MeetingParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `meetingId` | Int | * | cUK+FK | → Meeting.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `role` | String | * |  |  |
| `canVote` | Boolean | * |  |  |
| `attendanceStatus` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-215 Meeting](#meeting), [1-11 User](#user)

### 1-217 MeetingAgendaItem

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

→ Depends on: [1-215 Meeting](#meeting)

← Referenced by: [1-218 MeetingMinuteEntry](#meetingminuteentry), [1-219 MeetingProposal](#meetingproposal), [1-221 MeetingDecision](#meetingdecision), [1-222 MeetingActionCandidate](#meetingactioncandidate)

### 1-218 MeetingMinuteEntry

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

→ Depends on: [1-215 Meeting](#meeting), [1-217 MeetingAgendaItem](#meetingagendaitem)

### 1-219 MeetingProposal

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

→ Depends on: [1-215 Meeting](#meeting), [1-217 MeetingAgendaItem](#meetingagendaitem)

← Referenced by: [1-220 MeetingVote](#meetingvote), [1-221 MeetingDecision](#meetingdecision)

### 1-220 MeetingVote

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `proposalId` | Int | * | cUK+FK | → MeetingProposal.id |
| `voterUserId` | Int | * | cUK+FK | → User.id |
| `choice` | String | * |  |  |
| `note` | String | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-219 MeetingProposal](#meetingproposal), [1-11 User](#user)

### 1-221 MeetingDecision

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

→ Depends on: [1-215 Meeting](#meeting), [1-217 MeetingAgendaItem](#meetingagendaitem), [1-219 MeetingProposal](#meetingproposal)

← Referenced by: [1-222 MeetingActionCandidate](#meetingactioncandidate), [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem)

### 1-222 MeetingActionCandidate

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

→ Depends on: [1-215 Meeting](#meeting), [1-217 MeetingAgendaItem](#meetingagendaitem), [1-221 MeetingDecision](#meetingdecision), [1-242 WorkItem](#workitem), [1-241 WorkPlan](#workplan)

← Referenced by: [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem)

### 1-223 WorkPlanAlignment

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

→ Depends on: [1-241 WorkPlan](#workplan), [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem)

### 1-224 WorkOkrCycle

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

→ Depends on: [1-224 WorkOkrCycle](#workokrcycle)

← Referenced by: [1-225 WorkOkrControlPolicy](#workokrcontrolpolicy), [1-241 WorkPlan](#workplan)

### 1-225 WorkOkrControlPolicy

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
| `version` | Int | * |  |  |
| `createdByUserId` | Int |  |  |  |
| `updatedByUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-224 WorkOkrCycle](#workokrcycle)

### 1-226 WorkOkrControlRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `version` | Int | * | UK |  |
| `settingsJson` | String | * |  |  |
| `actorUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-227 WorkOkrControlPolicyRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `policyId` | Int |  |  |  |
| `cycleId` | Int | * |  |  |
| `scopeType` | String | * |  |  |
| `scopeId` | String | * |  |  |
| `version` | Int | * |  |  |
| `changeKind` | String | * |  |  |
| `snapshotJson` | String | * |  |  |
| `actorUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

### 1-228 WorkPlanGovernanceEvent

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `workPlanId` | Int | * | FK | → WorkPlan.id |
| `fromMode` | String | * |  |  |
| `toMode` | String | * |  |  |
| `fromSnapshotJson` | String | * |  |  |
| `toSnapshotJson` | String | * |  |  |
| `reason` | String | * |  |  |
| `actorUserId` | Int |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-241 WorkPlan](#workplan)

### 1-229 Project

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
| `workspaceEnabled` | Boolean | * |  |  |
| `isArchived` | Boolean | * |  |  |
| `archivedAt` | DateTime |  |  |  |
| `createdBy` | Int |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-143 Department](#department)

← Referenced by: [1-230 ProjectEnablingDepartment](#projectenablingdepartment), [1-231 EmployeeProject](#employeeproject), [1-232 ProjectMembershipChange](#projectmembershipchange), [1-233 ProjectPlanPhase](#projectplanphase), [1-234 ProjectPlanDependency](#projectplandependency), [1-235 ProjectPlanBaseline](#projectplanbaseline), [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem), [1-246 ProjectWorkAssignee](#projectworkassignee)

### 1-230 ProjectEnablingDepartment

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-229 Project](#project), [1-143 Department](#department)

### 1-231 EmployeeProject

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `membershipUid` | String | * | cUK |  |
| `sequence` | Int | * | cUK |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `projectId` | Int | * | FK | → Project.id |
| `role` | String |  |  |  |
| `startDate` | String |  |  |  |
| `endDate` | String |  |  |  |
| `recordState` | String | * |  |  |
| `changeKind` | String | * |  |  |
| `supersedesId` | Int |  | FK | → EmployeeProject.id |
| `createdByChangeId` | Int |  | FK | → ProjectMembershipChange.id |
| `terminalChangeId` | Int |  | FK | → ProjectMembershipChange.id |
| `reason` | String |  |  |  |
| `editedBy` | Int |  |  |  |
| `editedAt` | DateTime |  |  |  |
| `version` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

→ Depends on: [1-229 Project](#project), [1-140 Employee](#employee), [1-231 EmployeeProject](#employeeproject), [1-232 ProjectMembershipChange](#projectmembershipchange), [1-232 ProjectMembershipChange](#projectmembershipchange)

### 1-232 ProjectMembershipChange

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `changeUid` | String | * | UK |  |
| `idempotencyKey` | String |  | UK |  |
| `requestFingerprint` | String | * |  |  |
| `membershipUid` | String | * |  |  |
| `employeeId` | Int | * | FK | → Employee.id |
| `projectId` | Int | * | FK | → Project.id |
| `commandKind` | String | * |  |  |
| `effectiveOn` | String |  |  |  |
| `reason` | String |  |  |  |
| `effectsJson` | String | * |  |  |
| `recordedBy` | Int |  |  |  |
| `recordedAt` | DateTime | * |  |  |

→ Depends on: [1-140 Employee](#employee), [1-229 Project](#project)

← Referenced by: [1-231 EmployeeProject](#employeeproject), [1-231 EmployeeProject](#employeeproject)

### 1-233 ProjectPlanPhase

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

→ Depends on: [1-229 Project](#project)

← Referenced by: [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem)

### 1-234 ProjectPlanDependency

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

→ Depends on: [1-229 Project](#project)

### 1-235 ProjectPlanBaseline

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

→ Depends on: [1-229 Project](#project)

← Referenced by: [1-236 ProjectPlanBaselineItem](#projectplanbaselineitem)

### 1-236 ProjectPlanBaselineItem

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

→ Depends on: [1-235 ProjectPlanBaseline](#projectplanbaseline)

### 1-237 WorkReport

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

→ Depends on: [1-11 User](#user)

← Referenced by: [1-212 WorkKpiResultSnapshot](#workkpiresultsnapshot), [1-238 WorkReportItem](#workreportitem)

### 1-238 WorkReportItem

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

→ Depends on: [1-237 WorkReport](#workreport), [1-241 WorkPlan](#workplan), [1-242 WorkItem](#workitem)

### 1-239 PositionResponsibilityNode

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `positionDescriptionId` | Int | * | FK | → PositionDescription.id |
| `positionDescriptionRevisionId` | Int | * | FK | → PositionDescriptionRevision.id |
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

→ Depends on: [1-124 PositionDescription](#positiondescription), [1-125 PositionDescriptionRevision](#positiondescriptionrevision), [1-239 PositionResponsibilityNode](#positionresponsibilitynode)

← Referenced by: [1-240 WorkResponsibilityReference](#workresponsibilityreference)

### 1-240 WorkResponsibilityReference

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

→ Depends on: [1-242 WorkItem](#workitem), [1-239 PositionResponsibilityNode](#positionresponsibilitynode)

### 1-241 WorkPlan

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
| `governanceMode` | String | * |  |  |
| `governanceRevision` | Int | * |  |  |
| `governanceActionKey` | String |  |  |  |
| `governanceWorkflowPolicyId` | Int |  |  |  |
| `governanceWorkflowVersion` | Int |  |  |  |
| `governanceActionContractVersion` | Int |  |  |  |
| `governanceOkrControlVersion` | Int |  |  |  |
| `governanceSnapshotJson` | String | * |  |  |
| `governanceBoundAt` | DateTime |  |  |  |
| `governanceBoundByUserId` | Int |  |  |  |
| `governanceBindingSource` | String | * |  |  |
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

→ Depends on: [1-140 Employee](#employee), [1-207 DepartmentCollaboration](#departmentcollaboration), [1-224 WorkOkrCycle](#workokrcycle), [1-241 WorkPlan](#workplan), [1-241 WorkPlan](#workplan), [1-241 WorkPlan](#workplan), [1-229 Project](#project), [1-233 ProjectPlanPhase](#projectplanphase), [1-215 Meeting](#meeting), [1-221 MeetingDecision](#meetingdecision), [1-222 MeetingActionCandidate](#meetingactioncandidate), [1-143 Department](#department)

← Referenced by: [1-211 WorkKpiAssignment](#workkpiassignment), [1-222 MeetingActionCandidate](#meetingactioncandidate), [1-223 WorkPlanAlignment](#workplanalignment), [1-223 WorkPlanAlignment](#workplanalignment), [1-228 WorkPlanGovernanceEvent](#workplangovernanceevent), [1-238 WorkReportItem](#workreportitem), [1-242 WorkItem](#workitem)

### 1-242 WorkItem

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
| `updatedAt` | DateTime | * |  |  |
| `kpiAssignment` | WorkKpiAssignment |  |  |  |

→ Depends on: [1-241 WorkPlan](#workplan), [1-140 Employee](#employee), [1-207 DepartmentCollaboration](#departmentcollaboration), [1-229 Project](#project), [1-233 ProjectPlanPhase](#projectplanphase), [1-215 Meeting](#meeting), [1-221 MeetingDecision](#meetingdecision), [1-222 MeetingActionCandidate](#meetingactioncandidate), [1-143 Department](#department), [1-242 WorkItem](#workitem), [1-242 WorkItem](#workitem), [1-242 WorkItem](#workitem)

← Referenced by: [1-211 WorkKpiAssignment](#workkpiassignment), [1-222 MeetingActionCandidate](#meetingactioncandidate), [1-223 WorkPlanAlignment](#workplanalignment), [1-238 WorkReportItem](#workreportitem), [1-240 WorkResponsibilityReference](#workresponsibilityreference), [1-243 WorkKrEvidence](#workkrevidence), [1-243 WorkKrEvidence](#workkrevidence), [1-244 WorkParticipant](#workparticipant)

### 1-243 WorkKrEvidence

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `krWorkItemId` | Int | * | cUK+FK | → WorkItem.id |
| `taskWorkItemId` | Int | * | cUK+FK | → WorkItem.id |
| `note` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-242 WorkItem](#workitem), [1-242 WorkItem](#workitem)

### 1-244 WorkParticipant

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `workItemId` | Int | * | FK | → WorkItem.id |
| `name` | String | * |  |  |
| `wxUserId` | String |  |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-242 WorkItem](#workitem)

### 1-245 DepartmentWorkAssignee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `departmentId` | Int | * | cUK+FK | → Department.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `kind` | String | * | cUK | "task" |

→ Depends on: [1-143 Department](#department), [1-11 User](#user)

### 1-246 ProjectWorkAssignee

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `projectId` | Int | * | cUK+FK | → Project.id |
| `userId` | Int | * | cUK+FK | → User.id |
| `kind` | String | * | cUK | "task" |

→ Depends on: [1-229 Project](#project), [1-11 User](#user)

### 1-247 WorkspaceAnalysisTemplate

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK+REF |  |
| `scopeType` | String | * | cUK |  |
| `scopeId` | Int | * | cUK |  |
| `name` | String | * | cUK |  |
| `description` | String |  |  |  |
| `code` | String | * |  |  |
| `status` | String | * |  |  |
| `sortOrder` | Int | * |  |  |
| `revision` | Int | * |  |  |
| `publishedRevision` | Int |  |  |  |
| `publishedBy` | Int |  |  |  |
| `publishedAt` | DateTime |  |  |  |
| `archivedBy` | Int |  |  |  |
| `archivedAt` | DateTime |  |  |  |
| `createdBy` | Int | * |  |  |
| `updatedBy` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |
| `updatedAt` | DateTime | * |  |  |

← Referenced by: [1-248 WorkspaceAnalysisTemplateRevision](#workspaceanalysistemplaterevision)

### 1-248 WorkspaceAnalysisTemplateRevision

| Field | Type | Required | FK | Note |
|-------|------|----------|----|------|
| `id` | Int | * | PK |  |
| `templateId` | Int | * | cUK+FK | → WorkspaceAnalysisTemplate.id |
| `revision` | Int | * | cUK |  |
| `name` | String | * |  |  |
| `description` | String |  |  |  |
| `code` | String | * |  |  |
| `changeKind` | String | * |  |  |
| `sourceRevision` | Int |  |  |  |
| `reason` | String |  |  |  |
| `createdBy` | Int | * |  |  |
| `createdAt` | DateTime | * |  |  |

→ Depends on: [1-247 WorkspaceAnalysisTemplate](#workspaceanalysistemplate)
