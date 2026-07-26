-- workspace:migration-mode=maintenance
-- Sanitized structural baseline. Contains schema only; tenant facts belong outside Git.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ErpDueDiligenceSubmission" (
    "id" SERIAL NOT NULL,
    "campaignKey" TEXT NOT NULL DEFAULT 'order-to-cash-2026',
    "definitionVersion" INTEGER NOT NULL DEFAULT 2,
    "respondentUserId" INTEGER NOT NULL,
    "positionAssignmentId" INTEGER,
    "respondentName" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "primaryArea" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "answersJson" JSONB NOT NULL DEFAULT '{}',
    "processStepsJson" JSONB NOT NULL DEFAULT '[]',
    "evidenceItemsJson" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpDueDiligenceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpDueDiligenceEvidenceAttachment" (
    "id" SERIAL NOT NULL,
    "attachmentUid" TEXT NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "fileContent" BYTEA NOT NULL,
    "uploadedBy" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpDueDiligenceEvidenceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "responsibilities" TEXT NOT NULL,
    "allowedToolKeysJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRuntimeBinding" (
    "id" SERIAL NOT NULL,
    "agentProfileId" INTEGER NOT NULL,
    "runtimeKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "interactive" BOOLEAN NOT NULL DEFAULT false,
    "capabilityKeysJson" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRuntimeBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "agentProfileId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pagePath" TEXT,
    "contextLabel" TEXT,
    "title" TEXT,
    "storageKey" TEXT NOT NULL,
    "summaryShort" TEXT,
    "summaryLongStorageKey" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "compactedMessageCount" INTEGER NOT NULL DEFAULT 0,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProposal" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "agentProfileId" INTEGER,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actionKey" TEXT NOT NULL,
    "toolKey" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "diffJson" TEXT,
    "resultJson" TEXT,
    "executionToken" TEXT,
    "executionStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requesterUserId" INTEGER NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "agentProfileId" INTEGER,
    "runtimeBindingId" INTEGER,
    "runtimeKind" TEXT NOT NULL DEFAULT 'workspace',
    "runtimeConfigJson" TEXT,
    "runtimeConfigHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "pagePath" TEXT,
    "toolKey" TEXT,
    "resultType" TEXT,
    "proposalId" INTEGER,
    "errorMessage" TEXT,
    "inputOtherTokens" INTEGER,
    "inputCacheReadTokens" INTEGER,
    "inputCacheCreationTokens" INTEGER,
    "outputTokens" INTEGER,
    "contextUsagePeak" DOUBLE PRECISION,
    "runtimeStepCount" INTEGER,
    "runtimeOutcome" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" SERIAL NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "scopeId" TEXT,
    "businessActionKey" TEXT NOT NULL DEFAULT 'legacy.approval',
    "flowType" TEXT NOT NULL DEFAULT 'approval',
    "separationPolicy" TEXT NOT NULL DEFAULT 'auto_pass_if_authorized',
    "handlerSource" TEXT NOT NULL DEFAULT 'permission',
    "workflowNodesJson" TEXT NOT NULL DEFAULT '[]',
    "activeWorkflowNodeKey" TEXT,
    "activeWorkflowNodeKeysJson" TEXT NOT NULL DEFAULT '[]',
    "workflowJoinStateJson" TEXT NOT NULL DEFAULT '{}',
    "handlerCanRevise" BOOLEAN NOT NULL DEFAULT true,
    "requestCanWithdraw" BOOLEAN NOT NULL DEFAULT true,
    "requestCanResubmit" BOOLEAN NOT NULL DEFAULT true,
    "requestCanCancel" BOOLEAN NOT NULL DEFAULT true,
    "requestCanRevise" BOOLEAN NOT NULL DEFAULT true,
    "sourceWorkflowPolicyId" INTEGER,
    "sourceWorkflowPolicyVersion" INTEGER,
    "sourceActionContractVersion" INTEGER,
    "sourceOkrControlVersion" INTEGER,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "latestPayloadJson" TEXT NOT NULL DEFAULT '{}',
    "submitterUserId" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "resolvedByUserId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "committedEntityType" TEXT,
    "committedEntityId" TEXT,
    "committedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEvent" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "workflowNodeKey" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "comment" TEXT,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowPolicy" (
    "id" SERIAL NOT NULL,
    "businessActionKey" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'optional',
    "flowType" TEXT NOT NULL DEFAULT 'approval',
    "separationPolicy" TEXT NOT NULL DEFAULT 'auto_pass_if_authorized',
    "handlerSource" TEXT NOT NULL DEFAULT 'permission',
    "workflowNodesJson" TEXT NOT NULL DEFAULT '[]',
    "handlerCanRevise" BOOLEAN NOT NULL DEFAULT true,
    "requestCanWithdraw" BOOLEAN NOT NULL DEFAULT true,
    "requestCanResubmit" BOOLEAN NOT NULL DEFAULT true,
    "requestCanCancel" BOOLEAN NOT NULL DEFAULT true,
    "requestCanRevise" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "wxUserId" TEXT,
    "username" TEXT NOT NULL,
    "password" TEXT,
    "avatar" TEXT,
    "alias" TEXT,
    "phone" TEXT,
    "routineItems" TEXT,
    "preferredDepartmentIds" TEXT,
    "preferredProjectIds" TEXT,
    "portalSlots" TEXT,
    "canLogin" BOOLEAN NOT NULL DEFAULT true,
    "apiKey" TEXT,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    "scopeTypes" TEXT,
    "scopeInheritanceMode" TEXT NOT NULL DEFAULT 'inherit',

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionActionNormalization" (
    "key" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionActionNormalization_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UserResourceActionGrant" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "actionKey" TEXT NOT NULL,
    "scopeId" TEXT,

    CONSTRAINT "UserResourceActionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionResourceActionGrant" (
    "id" SERIAL NOT NULL,
    "positionId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "actionKey" TEXT NOT NULL,
    "scopeId" TEXT,

    CONSTRAINT "PositionResourceActionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentResourceActionGrant" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "actionKey" TEXT NOT NULL,
    "scopeId" TEXT,

    CONSTRAINT "DepartmentResourceActionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionGrantLedgerEvent" (
    "id" SERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "actorLabel" TEXT,
    "actorSnapshotJson" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "subjectLabel" TEXT,
    "subjectSnapshotJson" TEXT,
    "resourceId" INTEGER,
    "resourceKey" TEXT NOT NULL,
    "resourceName" TEXT,
    "actionKey" TEXT NOT NULL,
    "scopeId" TEXT,
    "beforeValue" BOOLEAN NOT NULL,
    "afterValue" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'permission_request',
    "reason" TEXT,
    "batchId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionGrantLedgerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "recipientUserId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "payloadJson" TEXT,
    "isImportant" BOOLEAN NOT NULL DEFAULT false,
    "isStrongReminder" BOOLEAN NOT NULL DEFAULT false,
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipInterest" (
    "id" SERIAL NOT NULL,
    "ownerPartyId" INTEGER NOT NULL,
    "issuerCompanyId" INTEGER NOT NULL,
    "shareRatio" DOUBLE PRECISION,
    "isConsolidated" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "recordStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "changeLabel" TEXT,
    "sourceType" TEXT,
    "sourceLabel" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyRegistryChange" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "changeDate" TIMESTAMP(3) NOT NULL,
    "changeCategory" TEXT NOT NULL,
    "changeItem" TEXT NOT NULL,
    "contentBefore" TEXT,
    "contentAfter" TEXT,
    "sourceCreatedDate" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceLabel" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyRegistryChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyRegistryOwnershipParticipant" (
    "id" SERIAL NOT NULL,
    "registryChangeId" INTEGER NOT NULL,
    "snapshotSide" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "partyId" INTEGER,
    "rawName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "resolutionStatus" TEXT NOT NULL DEFAULT 'unresolved',
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyRegistryOwnershipParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareCapitalEvent" (
    "id" SERIAL NOT NULL,
    "sourceKey" TEXT,
    "issuerCompanyId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "effectiveDatePrecision" TEXT NOT NULL DEFAULT 'day',
    "ledgerMode" TEXT NOT NULL DEFAULT 'transactions',
    "dataCompleteness" TEXT NOT NULL DEFAULT 'complete',
    "registeredCapitalCheckpointYuan" DECIMAL(20,2),
    "recordStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "sourceObservedDate" TIMESTAMP(3),
    "consolidatedByPartyIdAfter" INTEGER,
    "supersedesEventId" INTEGER,
    "sourceType" TEXT,
    "sourceLabel" TEXT,
    "sourceReference" TEXT,
    "notes" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareCapitalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareCapitalTransaction" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "fromPartyId" INTEGER,
    "toPartyId" INTEGER,
    "registeredCapitalAmountYuan" DECIMAL(20,2) NOT NULL,
    "considerationAmountYuan" DECIMAL(20,2),
    "sourceReference" TEXT,
    "notes" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareCapitalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareCapitalSnapshotPosition" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "partyId" INTEGER NOT NULL,
    "registeredCapitalAmountYuan" DECIMAL(20,2),
    "assertedShareRatio" DOUBLE PRECISION,
    "sourceReference" TEXT,
    "notes" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareCapitalSnapshotPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholderGroup" (
    "id" SERIAL NOT NULL,
    "issuerCompanyId" INTEGER NOT NULL,
    "groupKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT,
    "sourceLabel" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareholderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholderGroupMembership" (
    "id" SERIAL NOT NULL,
    "shareholderGroupId" INTEGER NOT NULL,
    "partyId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "recordStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "sourceType" TEXT,
    "sourceLabel" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareholderGroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,
    "contractNo" TEXT,
    "name" TEXT NOT NULL,
    "partyA" TEXT,
    "partyB" TEXT,
    "shareholder" TEXT,
    "category" TEXT,
    "content" TEXT,
    "handlerEmployeeId" INTEGER,
    "signDate" TEXT,
    "endDate" TEXT,
    "status" TEXT,
    "amount" DOUBLE PRECISION,
    "executedAmount" DOUBLE PRECISION,
    "location" TEXT,
    "remark" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityRun" (
    "id" SERIAL NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "domainsJson" TEXT NOT NULL,
    "requestedByUserId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "checkCount" INTEGER NOT NULL DEFAULT 0,
    "openFindingCount" INTEGER NOT NULL DEFAULT 0,
    "newFindingCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedFindingCount" INTEGER NOT NULL DEFAULT 0,
    "failureMessage" TEXT,

    CONSTRAINT "DataQualityRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityCheckState" (
    "checkKey" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultSeverity" TEXT NOT NULL,
    "triggerModesJson" TEXT NOT NULL,
    "lastStatus" TEXT NOT NULL DEFAULT 'never',
    "lastFindingCount" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3),
    "lastRunId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataQualityCheckState_pkey" PRIMARY KEY ("checkKey")
);

-- CreateTable
CREATE TABLE "DataQualityFinding" (
    "id" SERIAL NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resourceKey" TEXT,
    "href" TEXT,
    "samplesJson" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "lastRunId" INTEGER NOT NULL,
    "lastWorkspaceNotifiedAt" TIMESTAMP(3),
    "lastWecomNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "DataQualityFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityNotificationDelivery" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "findingCount" INTEGER NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataQualityNotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityEvaluationRequest" (
    "id" SERIAL NOT NULL,
    "domain" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "processedByRunId" INTEGER,
    "lastError" TEXT,

    CONSTRAINT "DataQualityEvaluationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplateSpace" (
    "id" SERIAL NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentTemplateSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ownerUserId" INTEGER,
    "spaceId" INTEGER NOT NULL,
    "documentContentRef" TEXT,
    "fieldModelContentRef" TEXT,
    "sourceKind" TEXT,
    "sourceProductKey" TEXT,
    "sourceStageKeys" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" INTEGER,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" SERIAL NOT NULL,
    "subjectType" TEXT NOT NULL DEFAULT 'organization',
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "identityNumber" TEXT NOT NULL,
    "legalRepresentative" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyNameHistory" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "nameKind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "datePrecision" TEXT NOT NULL DEFAULT 'day',
    "recordStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "sourceObservedDate" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceLabel" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyNameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPartyProfile" (
    "partyId" INTEGER NOT NULL,
    "relatedPartyType" TEXT NOT NULL DEFAULT 'unrelated',

    CONSTRAINT "ExternalPartyProfile_pkey" PRIMARY KEY ("partyId")
);

-- CreateTable
CREATE TABLE "ExternalPartyRole" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "classification" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "address" TEXT,
    "invoiceTitle" TEXT,
    "invoiceAddressPhone" TEXT,
    "settlementTerms" TEXT,
    "creditLimit" DOUBLE PRECISION,
    "creditDays" INTEGER,
    "taxRate" DOUBLE PRECISION,
    "remark" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalPartyRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPartySourceMapping" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceCode" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceNameNormalized" TEXT NOT NULL,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalPartySourceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetCard" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetKind" TEXT NOT NULL,
    "category" TEXT,
    "assetAccountCode" TEXT NOT NULL,
    "accumulatedAccountCode" TEXT,
    "acquisitionDate" TEXT,
    "depreciationStartDate" TEXT,
    "originalCost" DECIMAL(20,2) NOT NULL,
    "residualRate" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER,
    "method" TEXT NOT NULL DEFAULT 'straight_line',
    "openingAccumulatedAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "openingAsOfDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nonAmortizationReason" TEXT,
    "note" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,
    "editedBy" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetCostLine" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "lineType" TEXT NOT NULL DEFAULT 'invoice',
    "treatment" TEXT NOT NULL DEFAULT 'included',
    "referenceNo" TEXT,
    "referenceDate" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "reason" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetCostLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetExpenseAllocation" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "expenseAccountCode" TEXT NOT NULL,
    "allocationRate" DECIMAL(10,6) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetExpenseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetImportBatch" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "costLineCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "importedBy" INTEGER,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "FinanceAssetImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetPeriodEntry" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "normalAmount" DECIMAL(20,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'calculated',
    "calculationVersion" TEXT NOT NULL DEFAULT 'straight-line-v1',
    "voucherId" INTEGER,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetPeriodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetAdjustment" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "assetId" INTEGER,
    "accountCode" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "reversedById" INTEGER,
    "voucherId" INTEGER,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBudgetVersion" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "companyCode" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceFile" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBudgetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBudgetDept" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "companyCode" TEXT,
    "dept" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL,
    "accountId" INTEGER,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month4" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month5" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month6" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month7" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month8" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month9" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month10" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month11" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month12" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBudgetDept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBudgetRd" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "companyCode" TEXT,
    "project" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accountId" INTEGER,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month4" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month5" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month6" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month7" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month8" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month9" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month10" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month11" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month12" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBudgetRd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCashFlowItem" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "parentId" INTEGER,
    "direction" TEXT,
    "firstYear" INTEGER,
    "lastYear" INTEGER,
    "latestImportId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCashFlowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCashFlowAllocation" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "cashFlowItemId" INTEGER NOT NULL,
    "ownerVoucherItemId" INTEGER,
    "counterpartItemId" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCashFlowAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCashFlowAllocationAdjustment" (
    "id" SERIAL NOT NULL,
    "allocationId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceLineCode" TEXT NOT NULL,
    "targetLineCode" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" TEXT NOT NULL DEFAULT 'reference_workpaper',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCashFlowAllocationAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationEntryLine" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "entitySnapshotId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "statementType" TEXT NOT NULL,
    "lineCode" TEXT NOT NULL,
    "accountCode" TEXT,
    "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "periodBasis" TEXT NOT NULL DEFAULT 'current',
    "note" TEXT,
    "matchSide" TEXT,
    "sourceKind" TEXT,
    "sourceId" TEXT,
    "sourceFingerprint" TEXT,
    "sourceAmount" DECIMAL(20,2),
    "sourceCurrency" TEXT,
    "counterpartyEntitySnapshotId" INTEGER,
    "counterpartyCompanyId" INTEGER,
    "sourceSnapshotId" INTEGER,
    "sourceAuxiliaryBalanceId" INTEGER,
    "sourceOpenItemId" INTEGER,
    "sourceCashFlowAllocationId" INTEGER,
    "sourceVoucherItemId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationMatchGroup" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "entryId" INTEGER,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leftEntitySnapshotId" INTEGER NOT NULL,
    "rightEntitySnapshotId" INTEGER,
    "matchingRule" TEXT NOT NULL,
    "matchingVersion" TEXT NOT NULL,
    "matchedAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "differenceAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "differenceResolution" TEXT,
    "generationKey" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationMatchGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationMatchSource" (
    "id" SERIAL NOT NULL,
    "matchGroupId" INTEGER NOT NULL,
    "entitySnapshotId" INTEGER NOT NULL,
    "counterpartyEntitySnapshotId" INTEGER,
    "voucherItemId" INTEGER NOT NULL,
    "matchSide" TEXT NOT NULL,
    "sourceAmount" DECIMAL(20,2) NOT NULL,
    "allocatedAmount" DECIMAL(20,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "sourceFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationMatchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceVoucherCompanyMappingRule" (
    "id" SERIAL NOT NULL,
    "purpose" TEXT NOT NULL,
    "sourceCompanyCode" TEXT NOT NULL,
    "linkedCompanyId" INTEGER NOT NULL,
    "voucherDate" TEXT,
    "voucherNo" TEXT,
    "matchText" TEXT,
    "matchingPolicy" TEXT NOT NULL DEFAULT 'direct',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "evidence" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceVoucherCompanyMappingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationOutputSnapshot" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "outputFingerprint" TEXT NOT NULL,
    "reportPayload" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationOutputSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationBatch" (
    "id" SERIAL NOT NULL,
    "parentCompanyId" INTEGER NOT NULL,
    "parentCompanyCode" TEXT NOT NULL,
    "parentCompanyName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodKind" TEXT NOT NULL DEFAULT 'month',
    "version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "baseBatchId" INTEGER,
    "scopeFingerprint" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "rateFingerprint" TEXT NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "submittedBy" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "lockedBy" INTEGER,
    "lockedAt" TIMESTAMP(3),
    "publishedBy" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCompanyCurrencyPolicy" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "functionalCurrency" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCompanyCurrencyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationBatchEvent" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "actorUserId" INTEGER NOT NULL,
    "actorName" TEXT NOT NULL,
    "batchRevision" INTEGER NOT NULL,
    "targetType" TEXT,
    "targetId" INTEGER,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationBatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationControlDecision" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "controlKey" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "decidedBy" INTEGER NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationControlDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationEntitySnapshot" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "directParentCompanyId" INTEGER,
    "directParentCode" TEXT,
    "relationId" INTEGER,
    "relationUpdatedAt" TIMESTAMP(3),
    "relationEffectiveFrom" TIMESTAMP(3),
    "relationEffectiveTo" TIMESTAMP(3),
    "relationVersion" INTEGER,
    "shareRatio" DECIMAL(12,8),
    "isConsolidated" BOOLEAN NOT NULL DEFAULT true,
    "functionalCurrency" TEXT,
    "currencyEvidence" TEXT,
    "currencyDecidedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationEntitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationSourceSnapshot" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "entitySnapshotId" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "workpaperId" INTEGER,
    "workpaperVersion" INTEGER,
    "sourceChecksum" TEXT,
    "workpaperUpdatedBy" INTEGER,
    "sourcePackageId" INTEGER,
    "sourcePackageRevision" INTEGER,
    "sourcePackageStatus" TEXT,
    "sourcePackageChecksum" TEXT,
    "sourcePackageUploadedBy" INTEGER,
    "sourcePackageSubmittedBy" INTEGER,
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "sourcedLineCount" INTEGER NOT NULL DEFAULT 0,
    "importedLineCount" INTEGER NOT NULL DEFAULT 0,
    "manualLineCount" INTEGER NOT NULL DEFAULT 0,
    "formulaLineCount" INTEGER NOT NULL DEFAULT 0,
    "reportPayload" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "evidence" TEXT,
    "selectedBy" INTEGER NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationSourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationRateSnapshot" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "exchangeRateId" INTEGER NOT NULL,
    "exchangeRateVersion" INTEGER NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rateKind" TEXT NOT NULL,
    "rateDate" TEXT NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "recordedBy" INTEGER,
    "recordedAt" TIMESTAMP(3),
    "applications" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationRateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationEntry" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "entryNo" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidence" TEXT NOT NULL,
    "matchDifference" DECIMAL(20,2),
    "differenceResolution" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "generationKey" TEXT,
    "generationFingerprint" TEXT,
    "generatedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesEntryId" INTEGER,
    "reversalOfEntryId" INTEGER,
    "predecessorEntryId" INTEGER,
    "preparedBy" INTEGER NOT NULL,
    "submittedBy" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "approvalNote" TEXT,
    "reversedBy" INTEGER,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsolidationTaxEffect" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "entitySnapshotId" INTEGER,
    "effectKey" TEXT NOT NULL,
    "taxEffectType" TEXT NOT NULL,
    "differenceAmount" DECIMAL(20,2) NOT NULL,
    "taxRate" DECIMAL(12,8) NOT NULL,
    "recognition" TEXT NOT NULL,
    "periodBasis" TEXT NOT NULL DEFAULT 'current',
    "jurisdiction" TEXT,
    "recognitionLocation" TEXT,
    "balanceSheetLineCode" TEXT,
    "counterpartLineCode" TEXT,
    "reversalPeriod" TEXT,
    "recoverabilityConclusion" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "preparedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationTaxEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceDataImport" (
    "id" SERIAL NOT NULL,
    "profile" TEXT NOT NULL,
    "year" INTEGER,
    "sourceFile" TEXT NOT NULL,
    "sourcePath" TEXT,
    "normalizedJsonPath" TEXT,
    "checksum" TEXT,
    "status" TEXT NOT NULL DEFAULT 'imported',
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "importedBy" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceDataImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceShipment" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "productId" INTEGER,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "date" TEXT,
    "customerName" TEXT,
    "productName" TEXT,
    "spec" TEXT,
    "batchNo" TEXT,
    "quantity" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "receivedAmount" DOUBLE PRECISION,
    "salesChannel" TEXT NOT NULL DEFAULT 'unknown',
    "salespersonName" TEXT,
    "employeeId" INTEGER,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSalesSalary" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "baseSalary" DOUBLE PRECISION,
    "bonus" DOUBLE PRECISION,
    "deduction" DOUBLE PRECISION,
    "actualSalary" DOUBLE PRECISION,
    "salesChannel" TEXT NOT NULL DEFAULT 'unknown',
    "salespersonName" TEXT,
    "employeeId" INTEGER,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSalesSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCostStructureRow" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "productId" INTEGER,
    "receiptReportId" INTEGER,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "productStatus" TEXT,
    "productName" TEXT,
    "workHours" DOUBLE PRECISION,
    "rawMaterials" DOUBLE PRECISION,
    "packagingMaterials" DOUBLE PRECISION,
    "directLaborWage" DOUBLE PRECISION,
    "directLaborSocialSecurity" DOUBLE PRECISION,
    "directLaborWelfare" DOUBLE PRECISION,
    "auxiliaryLaborWage" DOUBLE PRECISION,
    "auxiliaryLaborSocialSecurity" DOUBLE PRECISION,
    "auxiliaryLaborWelfare" DOUBLE PRECISION,
    "utilities" DOUBLE PRECISION,
    "depreciationDirect" DOUBLE PRECISION,
    "depreciationAuxiliary" DOUBLE PRECISION,
    "otherManufacturingCost" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCostStructureRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCostAnalysisRow" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "tableName" TEXT,
    "rowLabel" TEXT,
    "metricKey" TEXT,
    "metricName" TEXT,
    "value" DOUBLE PRECISION,
    "textValue" TEXT,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCostAnalysisRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceWorkshopReport" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "productName" TEXT,
    "batchNo" TEXT,
    "workPoint" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "employeeId" INTEGER,
    "positionId" INTEGER,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceWorkshopReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAuxiliaryMember" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "dimensionType" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "shortName" TEXT,
    "identityNumber" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "firstYear" INTEGER,
    "lastYear" INTEGER,
    "latestImportId" INTEGER,
    "linkedCompanyId" INTEGER,
    "companyLinkMethod" TEXT,
    "companyLinkEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAuxiliaryMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCounterpartyClassification" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "counterpartyType" TEXT NOT NULL,
    "classificationMethod" TEXT NOT NULL,
    "classificationEvidence" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCounterpartyClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceVoucherItemAuxiliary" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "sourceRole" TEXT NOT NULL,

    CONSTRAINT "FinanceVoucherItemAuxiliary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAuxiliaryBalance" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "openingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "openingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "closingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "closingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAuxiliaryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAuxiliaryBalanceMember" (
    "id" SERIAL NOT NULL,
    "balanceId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "sourceRole" TEXT NOT NULL,

    CONSTRAINT "FinanceAuxiliaryBalanceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOpenItem" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "periodId" INTEGER,
    "accountId" INTEGER,
    "voucherItemId" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "documentNo" TEXT,
    "documentDate" TEXT,
    "dueDate" TEXT,
    "memo" TEXT,
    "currencyCode" TEXT,
    "originalDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "originalCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "outstandingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "outstandingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "originType" TEXT,
    "sourcePeriodBeginDetailId" TEXT,
    "agingBaseDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceOpenItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOpenItemSettlement" (
    "id" SERIAL NOT NULL,
    "openItemId" INTEGER NOT NULL,
    "settlementDate" TEXT NOT NULL,
    "settlementType" TEXT NOT NULL DEFAULT 'manual',
    "referenceNo" TEXT,
    "settledDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "settledCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "note" TEXT,
    "sourceSystem" TEXT,
    "sourceDatabase" TEXT,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceOpenItemSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOpenItemAuxiliary" (
    "id" SERIAL NOT NULL,
    "openItemId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "sourceRole" TEXT NOT NULL,

    CONSTRAINT "FinanceOpenItemAuxiliary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceGroupAccount" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "balanceDirection" TEXT NOT NULL,
    "mnemonicCode" TEXT,
    "currency" TEXT,
    "subjectLevel" INTEGER,
    "parentId" INTEGER,
    "sourceKind" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "originCompanyCode" TEXT,
    "originSourceScopeKey" TEXT,
    "originLocalAccountCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceGroupAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccountingPolicyVersion" (
    "id" SERIAL NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'published',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccountingPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceGroupAccountRevision" (
    "id" SERIAL NOT NULL,
    "policyVersionId" INTEGER NOT NULL,
    "groupAccountId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "balanceDirection" TEXT NOT NULL,
    "mnemonicCode" TEXT,
    "currency" TEXT,
    "subjectLevel" INTEGER,
    "parentGroupAccountId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceGroupAccountRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceGroupAccountMapping" (
    "id" SERIAL NOT NULL,
    "policyVersionId" INTEGER NOT NULL,
    "groupAccountId" INTEGER,
    "companyCode" TEXT NOT NULL,
    "sourceScopeKey" TEXT NOT NULL,
    "sourceSystem" TEXT,
    "sourceDatabase" TEXT,
    "sourceLedger" TEXT,
    "localAccountCode" TEXT NOT NULL,
    "localAccountName" TEXT NOT NULL,
    "localCategory" TEXT NOT NULL,
    "localBalanceDirection" TEXT NOT NULL,
    "latestYear" INTEGER,
    "mappingMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceGroupAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReadableSourcePackage" (
    "id" SERIAL NOT NULL,
    "packageKey" TEXT NOT NULL,
    "archiveRevision" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "cutoffDate" TEXT NOT NULL,
    "isAccountingClose" BOOLEAN NOT NULL,
    "previousSnapshot" TEXT,
    "sourceMapChecksum" TEXT NOT NULL,
    "manifestChecksum" TEXT NOT NULL,
    "validationChecksum" TEXT NOT NULL,
    "selectedDatabaseChecksum" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "manifestEntryCount" INTEGER NOT NULL,
    "validatedTableCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceReadableSourcePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReadableImportRun" (
    "id" SERIAL NOT NULL,
    "runKey" TEXT NOT NULL,
    "ledgerImportId" INTEGER NOT NULL,
    "sourcePackageId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "controlJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceReadableImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSourceLedgerMapping" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "mappingMode" TEXT NOT NULL,
    "effectiveFromYear" INTEGER NOT NULL,
    "effectiveToYear" INTEGER,
    "successorSourceSystem" TEXT,
    "successorSourceLedger" TEXT,
    "baseCurrencyCode" TEXT,
    "baseCurrencyName" TEXT,
    "accountingStandard" TEXT,
    "entityType" TEXT,
    "evidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSourceLedgerMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccountAuxiliaryRequirement" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "importId" INTEGER NOT NULL,
    "dimensionType" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccountAuxiliaryRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSourcePeriodStatus" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "glMonthEnd" BOOLEAN,
    "accountingClosed" BOOLEAN,
    "moduleStatuses" JSONB NOT NULL,
    "derivationVersion" TEXT NOT NULL DEFAULT 't6-GL_mend-bflag-v2',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSourcePeriodStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSourceSubsystemStatus" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "subsystemCode" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL,
    "isYearClosed" BOOLEAN,
    "lastProcessedPeriod" INTEGER,
    "enabledFrom" TEXT,
    "sourceUser" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSourceSubsystemStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccountLineage" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "currentAccountId" INTEGER NOT NULL,
    "previousAccountId" INTEGER NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "currentYear" INTEGER NOT NULL,
    "previousYear" INTEGER NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'yearTransition',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccountLineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLedgerImport" (
    "id" SERIAL NOT NULL,
    "batchKey" TEXT,
    "type" TEXT NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceSystem" TEXT,
    "sourceLedger" TEXT,
    "sourceDatabase" TEXT,
    "sourceFile" TEXT,
    "sourcePath" TEXT,
    "snapshotDate" TEXT,
    "cutoffDate" TEXT,
    "checksum" TEXT,
    "sourcePackageId" INTEGER,
    "sourceLedgerMappingId" INTEGER,
    "controlJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "deletedCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" TEXT,
    "importedBy" INTEGER,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLedgerImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSourceAccountBalance" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "openingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "openingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "closingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "closingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSourceAccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "parentId" INTEGER,
    "balanceDirection" TEXT NOT NULL DEFAULT 'debit',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyCode" TEXT NOT NULL,
    "mnemonicCode" TEXT,
    "currency" TEXT,
    "sourceSystem" TEXT,
    "sourceLedger" TEXT,
    "sourceDatabase" TEXT,
    "sourceKey" TEXT,
    "groupSubjectCode" TEXT,
    "subjectLevel" INTEGER,
    "year" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePeriod" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "sourceSystem" TEXT,
    "sourceDatabase" TEXT,
    "sourceKey" TEXT,
    "sourceClosed" BOOLEAN,
    "companyCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementVoucherExclusion" (
    "id" SERIAL NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "statementType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" TEXT NOT NULL DEFAULT 'reference_workpaper',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementVoucherExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceVoucher" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "totalDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "companyCode" TEXT NOT NULL,
    "importId" INTEGER,
    "sourceSystem" TEXT,
    "sourceDatabase" TEXT,
    "sourceKey" TEXT,
    "voucherTypeCode" TEXT,
    "voucherTypeName" TEXT,
    "isAdjustment" BOOLEAN NOT NULL DEFAULT false,
    "preparerName" TEXT,
    "reviewerName" TEXT,
    "posterName" TEXT,
    "cashierName" TEXT,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "sourcePosted" BOOLEAN,
    "sourceAudited" BOOLEAN,
    "sourceInvalid" BOOLEAN,
    "externalSourceSystem" TEXT,
    "externalSourceDocumentNo" TEXT,
    "externalSourceDocumentId" TEXT,
    "externalSourceAccountSet" TEXT,
    "externalSourceDate" TEXT,
    "sourceMetadata" JSONB,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceVoucherItem" (
    "id" SERIAL NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "relatedEntity" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "importFingerprint" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceSystem" TEXT,
    "sourceDatabase" TEXT,
    "sourceKey" TEXT,
    "currencyCode" TEXT,
    "exchangeRate" DECIMAL(20,8),
    "originalDebit" DECIMAL(20,2),
    "originalCredit" DECIMAL(20,2),
    "settlementStyle" TEXT,
    "settlementNo" TEXT,
    "settlementDate" TEXT,
    "sourceMetadata" JSONB,
    "importId" INTEGER,

    CONSTRAINT "FinanceVoucherItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccountBalance" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "openingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "companyCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBalanceSnapshot" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "snapshotType" TEXT NOT NULL DEFAULT 'reconcile',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sourceFile" TEXT,
    "sourcePath" TEXT,
    "checksum" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedBy" INTEGER,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBalanceSnapshotRow" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "openingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,

    CONSTRAINT "FinanceBalanceSnapshotRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReclassRule" (
    "id" SERIAL NOT NULL,
    "policyVersionId" INTEGER NOT NULL,
    "sourceGroupAccountId" INTEGER NOT NULL,
    "targetGroupAccountId" INTEGER,
    "sourceAccountCode" TEXT NOT NULL,
    "abnormalSide" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'reclassify',
    "basis" TEXT NOT NULL DEFAULT 'account_net',
    "targetAccountCode" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confirmedBy" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceReclassRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReclassItemRule" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceAccountCode" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'exact_description',
    "matchValue" TEXT NOT NULL,
    "targetAccountCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceReclassItemRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBalanceReclassAdjustment" (
    "id" SERIAL NOT NULL,
    "policyVersionId" INTEGER NOT NULL,
    "sourceGroupAccountId" INTEGER,
    "targetGroupAccountId" INTEGER,
    "periodId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceAccountCode" TEXT NOT NULL,
    "targetAccountCode" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'reclassify',
    "basis" TEXT NOT NULL DEFAULT 'account_net',
    "sourceType" TEXT NOT NULL DEFAULT 'automatic_rule',
    "ruleId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "note" TEXT,
    "adjustedBy" INTEGER,
    "adjustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBalanceReclassAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBalanceReclassAdjustmentHistory" (
    "id" SERIAL NOT NULL,
    "adjustmentIdSnapshot" INTEGER NOT NULL,
    "policyVersionIdSnapshot" INTEGER,
    "sourceGroupAccountIdSnapshot" INTEGER,
    "targetGroupAccountIdSnapshot" INTEGER,
    "periodId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceAccountCode" TEXT NOT NULL,
    "targetAccountCode" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "decision" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ruleIdSnapshot" INTEGER,
    "adjustedBySnapshot" INTEGER,
    "adjustedAtSnapshot" TIMESTAMP(3),
    "note" TEXT,
    "archiveReason" TEXT NOT NULL,
    "archivedBy" INTEGER,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBalanceReclassAdjustmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReclassResult" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "voucherItemId" INTEGER,
    "voucherItemIdSnapshot" INTEGER NOT NULL,
    "ruleId" INTEGER,
    "ruleIdSnapshot" INTEGER,
    "sourceAccount" TEXT NOT NULL,
    "targetAccount" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adjustedBy" INTEGER,
    "adjustedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReclassResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementSourcePackage" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileChecksum" TEXT NOT NULL,
    "fileContent" BYTEA NOT NULL,
    "parsedCompanyName" TEXT NOT NULL,
    "note" TEXT,
    "uploadedBy" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedBy" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "rejectedBy" INTEGER,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementSourcePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementSourceSheet" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL,
    "previousYear" INTEGER NOT NULL,
    "currentYear" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementSourceSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementSourceLine" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "lineCode" TEXT NOT NULL,
    "previousAmount" DECIMAL(20,2) NOT NULL,
    "currentAmount" DECIMAL(20,2) NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementSourceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementWorkpaper" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "sourcePackageId" INTEGER,
    "sourcePackageRevision" INTEGER,
    "sourceChecksum" TEXT,
    "updatedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementWorkpaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementWorkpaperLine" (
    "id" SERIAL NOT NULL,
    "workpaperId" INTEGER NOT NULL,
    "lineCode" TEXT NOT NULL,
    "manualAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "importedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formulaText" TEXT,
    "note" TEXT,
    "source" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementWorkpaperLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementExchangeRate" (
    "id" SERIAL NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rateKind" TEXT NOT NULL,
    "rateDate" TEXT NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT '中国外汇交易中心',
    "sourceField" TEXT NOT NULL DEFAULT '人民币汇率中间价',
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCurrency" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "symbol" TEXT,
    "decimalDigits" INTEGER,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "latestImportId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankAccount" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "accountId" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceCode" TEXT,
    "sourceName" TEXT NOT NULL,
    "accountNo" TEXT,
    "bankName" TEXT,
    "currencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "latestImportId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentDescription" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "codeRaw" TEXT,
    "details" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionDescription" (
    "id" SERIAL NOT NULL,
    "positionPurpose" TEXT,
    "summary" TEXT,
    "headcount" INTEGER,
    "version" TEXT,
    "effectiveDate" TEXT,
    "sourceFile" TEXT NOT NULL,
    "details" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLifecycleEvent" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "reason" TEXT,
    "detailsJson" TEXT NOT NULL,
    "recordedByUserId" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPerformanceReview" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "okrCycleId" INTEGER NOT NULL,
    "approvalRequestId" INTEGER,
    "selfScore" INTEGER,
    "selfComment" TEXT NOT NULL DEFAULT '',
    "managerScore" INTEGER,
    "managerComment" TEXT NOT NULL DEFAULT '',
    "finalScore" INTEGER NOT NULL,
    "finalGrade" TEXT NOT NULL,
    "hrComment" TEXT NOT NULL DEFAULT '',
    "workEvidenceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "archivedByUserId" INTEGER,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "employeeId" TEXT NOT NULL,
    "idNumber" TEXT,
    "otherId" TEXT,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "gender" BOOLEAN,
    "birthDate" TEXT,
    "ethnicity" TEXT,
    "hometown" TEXT,
    "politics" TEXT,
    "education" TEXT,
    "title" TEXT,
    "school" TEXT,
    "major" TEXT,
    "phone" TEXT,
    "workStartDate" TEXT,
    "userId" INTEGER,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employment" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentCompany" TEXT,
    "joinDate" TEXT,
    "leaveDate" TEXT,
    "leaveReason" TEXT,
    "leaveNote" TEXT,
    "officeLocation" TEXT,
    "attendanceType" TEXT,
    "personnelType" TEXT,
    "rank" TEXT,
    "title" TEXT,
    "contracts" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "registeredCapital" TEXT,
    "bankName" TEXT,
    "registeredAddress" TEXT,
    "registeredDate" TEXT,
    "managementGroup" TEXT NOT NULL,
    "codePoolCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "hierarchyKind" TEXT NOT NULL DEFAULT 'M',
    "level" INTEGER NOT NULL DEFAULT 1,
    "parentId" INTEGER,
    "managerPositionId" INTEGER,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentManagerEmployee" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentManagerEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "alias" TEXT,
    "name" TEXT NOT NULL,
    "departmentId" INTEGER,
    "positionDescriptionId" INTEGER,
    "reportToPositionId" INTEGER,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePosition" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "reportingCompanyId" INTEGER,
    "departmentId" INTEGER,
    "positionId" INTEGER,
    "positionReportOverrideId" INTEGER,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT,
    "endDate" TEXT,
    "reportTo" TEXT,
    "reportToPositionId" INTEGER,
    "workPercent" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EmployeePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionReportOverride" (
    "id" SERIAL NOT NULL,
    "positionId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "reportToPositionId" INTEGER,
    "headcount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionReportOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditHistory" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dataJson" TEXT NOT NULL,
    "editedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tag" TEXT,

    CONSTRAINT "EditHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "productMasterId" INTEGER,
    "companyCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'finished_goods',
    "specification" TEXT,
    "baseUnit" TEXT NOT NULL,
    "contentUnit" TEXT,
    "unitsPerPackage" DECIMAL(18,4),
    "packagesPerCase" DECIMAL(18,4),
    "barcode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceKey" TEXT,
    "editedBy" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUnitConversion" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "factor" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryUnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryWarehouse" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "productionDate" TEXT,
    "expiryDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocument" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "counterparty" TEXT,
    "referenceNo" TEXT,
    "note" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceKey" TEXT,
    "createdBy" INTEGER,
    "postedBy" INTEGER,
    "postedAt" TIMESTAMP(3),
    "reversedById" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocumentLine" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitFactor" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(20,6),
    "paymentStatus" TEXT,
    "invoiceStatus" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,

    CONSTRAINT "InventoryDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLedgerEntry" (
    "id" SERIAL NOT NULL,
    "documentLineId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "movementDate" TEXT NOT NULL,
    "signedQuantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStocktake" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "stocktakeNo" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "stocktakeDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceKey" TEXT,
    "createdBy" INTEGER,
    "approvedBy" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryStocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStocktakeLine" (
    "id" SERIAL NOT NULL,
    "stocktakeId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "bookQuantity" DECIMAL(20,6) NOT NULL,
    "actualQuantity" DECIMAL(20,6) NOT NULL,
    "note" TEXT,
    "sourceRow" INTEGER,

    CONSTRAINT "InventoryStocktakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPeriodClose" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "voucherId" INTEGER,
    "lockedBy" INTEGER,
    "lockedAt" TIMESTAMP(3),
    "unlockedBy" INTEGER,
    "unlockedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryPeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryImportBatch" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "importedBy" INTEGER,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "InventoryImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReceiptReport" (
    "id" SERIAL NOT NULL,
    "recordUid" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "workshopName" TEXT NOT NULL DEFAULT '固体制剂车间',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "preparedBy" TEXT,
    "preparedByUserId" INTEGER,
    "preparedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedByUserId" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "confirmedSnapshot" JSONB,
    "confirmedSnapshotHash" TEXT,
    "confirmationSource" TEXT,
    "sourceKey" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReceiptReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReceiptProductWorkPoint" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "productId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productName" TEXT NOT NULL,
    "workPoints" DECIMAL(18,4) NOT NULL,
    "sourceKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReceiptProductWorkPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReceiptReportEvent" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "actorName" TEXT NOT NULL,
    "reportVersion" INTEGER NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "sourceKey" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReceiptReportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReceiptBatch" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "productId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productName" TEXT NOT NULL,
    "specification" TEXT,
    "batchNumber" TEXT NOT NULL,
    "inputQuantityTenThousands" DECIMAL(18,4),
    "sourceKey" TEXT,
    "sourceRowStart" INTEGER,
    "sourceRowEnd" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReceiptBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReceiptOutput" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "productSkuId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productionQuantityText" TEXT,
    "caseQuantity" DECIMAL(18,4),
    "extraPackageQuantity" DECIMAL(18,4),
    "packagesPerCase" DECIMAL(18,4) NOT NULL,
    "unitsPerPackage" DECIMAL(18,4) NOT NULL,
    "packageUnit" TEXT NOT NULL,
    "packagingNote" TEXT NOT NULL,
    "sourceKey" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceConvertedPackages" DECIMAL(18,4),
    "sourceConvertedTenThousands" DECIMAL(18,4),
    "sourceConvertedPackagesFormula" TEXT,
    "sourceConvertedTenThousandsFormula" TEXT,
    "auditStatus" TEXT NOT NULL DEFAULT 'ok',
    "auditNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReceiptOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRawMaterial" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "manufacturer" TEXT,
    "status" TEXT NOT NULL DEFAULT '正常',
    "lastBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentPurchase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentConsume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remark" TEXT,
    "companyCode" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockRawMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPackaging" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "unit" TEXT NOT NULL DEFAULT '卷',
    "packagingType" TEXT NOT NULL DEFAULT '小容量',
    "status" TEXT NOT NULL DEFAULT '正常',
    "lastBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentInbound" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentOutbound" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "batchNo" TEXT,
    "expiryDate" TEXT,
    "remark" TEXT,
    "companyCode" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockFinishedGoods" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packagingSpec" TEXT,
    "unit" TEXT NOT NULL DEFAULT '件',
    "stockType" TEXT NOT NULL DEFAULT '正常库存',
    "lastBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentInbound" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentOutbound" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "availableStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remark" TEXT,
    "companyCode" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockFinishedGoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" SERIAL NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiryDate" TEXT,
    "status" TEXT NOT NULL DEFAULT '正常',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOperation" (
    "id" SERIAL NOT NULL,
    "opType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "docNo" TEXT,
    "reason" TEXT,
    "operatorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReturn" (
    "id" SERIAL NOT NULL,
    "finishedGoodsId" INTEGER NOT NULL,
    "returnDate" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesman" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryTagCandidate" (
    "id" SERIAL NOT NULL,
    "candidateUid" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "tagId" INTEGER,
    "dimension" TEXT NOT NULL,
    "proposedKey" TEXT NOT NULL,
    "proposedName" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryTagCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryEntityMention" (
    "id" SERIAL NOT NULL,
    "mentionUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "chunkId" INTEGER,
    "entityType" TEXT NOT NULL,
    "canonicalValue" TEXT NOT NULL,
    "observedText" TEXT NOT NULL,
    "locatorJson" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "providerKey" TEXT,
    "modelKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'extracted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEntityMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryMetadataCandidate" (
    "id" SERIAL NOT NULL,
    "candidateUid" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "keywordsJson" TEXT NOT NULL,
    "entitiesJson" TEXT NOT NULL,
    "keyPassagesJson" TEXT NOT NULL,
    "fileFactsJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryMetadataCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryEvaluationCase" (
    "id" SERIAL NOT NULL,
    "caseUid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "expectedAnswer" TEXT,
    "expectedBehavior" TEXT NOT NULL DEFAULT 'answer',
    "minConfidentiality" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" INTEGER NOT NULL,
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEvaluationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryEvaluationEvidence" (
    "id" SERIAL NOT NULL,
    "evidenceUid" TEXT NOT NULL,
    "caseId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "locatorJson" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEvaluationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryProcessingJob" (
    "id" SERIAL NOT NULL,
    "jobUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "idempotencyKey" TEXT NOT NULL,
    "inputChecksum" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "providerKey" TEXT,
    "modelKey" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metricsJson" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryArtifact" (
    "id" SERIAL NOT NULL,
    "artifactUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "jobId" INTEGER,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "pageCount" INTEGER,
    "locatorSchemaVersion" TEXT NOT NULL DEFAULT 'v1',
    "toolchainJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryContentChunk" (
    "id" SERIAL NOT NULL,
    "chunkUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "artifactId" INTEGER,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "locatorJson" TEXT NOT NULL,
    "headingPathJson" TEXT,
    "tokenCount" INTEGER,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryContentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibrarySearchIndex" (
    "id" SERIAL NOT NULL,
    "indexUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "artifactId" INTEGER,
    "kind" TEXT NOT NULL,
    "engineKey" TEXT NOT NULL,
    "modelKey" TEXT,
    "embeddingDimensions" INTEGER,
    "generation" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'building',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "indexChecksum" TEXT,
    "builtAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibrarySearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryExportJob" (
    "id" SERIAL NOT NULL,
    "exportUid" TEXT NOT NULL,
    "requestedBy" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "selectionJson" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "manifestSha256" TEXT,
    "storagePath" TEXT,
    "fileSizeBytes" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryDocument" (
    "id" SERIAL NOT NULL,
    "documentUid" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "rootKey" TEXT NOT NULL DEFAULT 'default',
    "relativePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "extension" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileMtime" TIMESTAMP(3),
    "checksumSha256" TEXT,
    "categoryCode" TEXT,
    "categoryName" TEXT,
    "subcategoryPath" TEXT,
    "directoryPath" TEXT,
    "title" TEXT,
    "summary" TEXT,
    "categoryId" INTEGER,
    "currentDirectoryId" INTEGER,
    "categorySource" TEXT NOT NULL DEFAULT 'folder',
    "currentVersionId" INTEGER,
    "confidentialityLevel" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'active',
    "origin" TEXT NOT NULL DEFAULT 'uploaded',
    "generatorKey" TEXT,
    "versionLabel" TEXT,
    "ownerUserId" INTEGER,
    "asOfDate" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" INTEGER,
    "gitRepo" TEXT,
    "gitCommit" TEXT,
    "gitPath" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryDocumentVersion" (
    "id" SERIAL NOT NULL,
    "versionUid" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "storageFileName" TEXT,
    "storageMimeType" TEXT,
    "storageFileSizeBytes" INTEGER,
    "storageChecksumSha256" TEXT,
    "relativePath" TEXT NOT NULL,
    "extension" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "sourceModifiedAt" TIMESTAMP(3),
    "checksumSha256" TEXT,
    "gitCommit" TEXT,
    "changeNote" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryCategory" (
    "id" SERIAL NOT NULL,
    "categoryUid" TEXT NOT NULL,
    "parentId" INTEGER,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "fullPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryDirectory" (
    "id" SERIAL NOT NULL,
    "directoryUid" TEXT NOT NULL,
    "rootKey" TEXT NOT NULL DEFAULT 'default',
    "relativePath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastScannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryDirectory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueDiligenceParty" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "type" TEXT,
    "ndaStatus" TEXT NOT NULL DEFAULT 'none',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DueDiligenceParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueDiligenceRequest" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "defaultConfidentialityLevel" INTEGER NOT NULL DEFAULT 2,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DueDiligenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueDiligenceQuestion" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "categoryHint" TEXT,
    "answerDraft" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DueDiligenceQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueDiligenceMaterialSelection" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "documentVersionId" INTEGER,
    "matchScore" DOUBLE PRECISION,
    "reason" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "selectedBy" INTEGER,
    "selectedAt" TIMESTAMP(3),

    CONSTRAINT "DueDiligenceMaterialSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryGeneratedSource" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outputCategory" TEXT,
    "defaultConfidentialityLevel" INTEGER NOT NULL DEFAULT 2,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryGeneratedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryTag" (
    "id" SERIAL NOT NULL,
    "tagUid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT 'theme',
    "taxonomyVersion" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryDocumentTag" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryDocumentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutationImpactBatch" (
    "id" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "actorLabel" TEXT,
    "scopeType" TEXT,
    "scopeId" TEXT,
    "requestId" TEXT,
    "rootEntityType" TEXT NOT NULL,
    "rootEntityId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "policyRevision" TEXT NOT NULL,
    "impactFingerprint" TEXT NOT NULL,
    "resolutionsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultCode" TEXT,
    "resultMessage" TEXT,
    "sourceBatchId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MutationImpactBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutationImpactEffect" (
    "id" SERIAL NOT NULL,
    "batchId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "relationKey" TEXT NOT NULL,
    "relationPathJson" TEXT NOT NULL DEFAULT '[]',
    "policyKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "beforeRevision" TEXT,
    "afterRevision" TEXT,
    "beforeSummaryJson" TEXT,
    "afterSummaryJson" TEXT,
    "changedInBatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutationImpactEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenApiClient" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ownerUserId" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenApiResource" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "registrationKey" TEXT NOT NULL,
    "runtimeParentResourceKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenApiResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenApiScope" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "registrationKey" TEXT NOT NULL,
    "runtimeParentResourceKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenApiScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenApiClientScopeGrant" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "scopeId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpenApiClientScopeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenApiAccessLog" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER,
    "clientName" TEXT,
    "endpointKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpenApiAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosageForm" TEXT,
    "strength" TEXT,
    "approvalNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "editedByUserId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSourceMapping" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "productSkuId" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceCode" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceSpecification" TEXT,
    "normalizedName" TEXT NOT NULL,
    "normalizedSpecification" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceData" JSONB,
    "reviewedByUserId" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSourceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionQcBatch" (
    "id" SERIAL NOT NULL,
    "recordUid" TEXT NOT NULL,
    "legacyFileId" INTEGER,
    "batchNumber" TEXT NOT NULL,
    "productId" INTEGER,
    "productKey" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "templateSnapshot" JSONB NOT NULL,
    "templateHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionQcBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionQcFieldValue" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" TEXT,
    "unit" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "lastRecordVersion" INTEGER NOT NULL,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionQcFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionQcSignature" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "testName" TEXT,
    "role" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "signerUserId" INTEGER,
    "signerEmployeeId" TEXT,
    "signerName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedRecordVersion" INTEGER NOT NULL,
    "signedPayloadHash" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,

    CONSTRAINT "ProductionQcSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionQcAuditEvent" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER,
    "batchRecordUid" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT,
    "fieldKey" TEXT,
    "stageKey" TEXT,
    "testName" TEXT,
    "role" TEXT,
    "actorUserId" INTEGER,
    "actorEmployeeId" TEXT,
    "actorName" TEXT,
    "signatureMeaning" TEXT,
    "signedPayloadHash" TEXT,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "recordVersion" INTEGER NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionQcAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentCollaboration" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "collaborationType" TEXT NOT NULL DEFAULT 'routine',
    "triggerRule" TEXT NOT NULL DEFAULT '',
    "scopeDescription" TEXT NOT NULL DEFAULT '',
    "inputRequirement" TEXT NOT NULL DEFAULT '',
    "deliverable" TEXT NOT NULL DEFAULT '',
    "acceptanceCriteria" TEXT NOT NULL DEFAULT '',
    "responseTargetHours" INTEGER,
    "deliveryTargetDays" INTEGER,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "escalationPolicy" TEXT NOT NULL DEFAULT '',
    "responsibleDepartmentId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentCollaboration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentCollaborationDepartment" (
    "id" SERIAL NOT NULL,
    "collaborationId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "responseStatus" TEXT NOT NULL DEFAULT 'pending',
    "responseNote" TEXT NOT NULL DEFAULT '',
    "respondedByUserId" INTEGER,
    "respondedAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentCollaborationDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentCollaborationPosition" (
    "id" SERIAL NOT NULL,
    "collaborationId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "positionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentCollaborationPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkKpiDefinition" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "valueType" TEXT NOT NULL DEFAULT 'number',
    "displayType" TEXT NOT NULL DEFAULT 'number',
    "unit" TEXT NOT NULL DEFAULT '',
    "direction" TEXT NOT NULL DEFAULT 'higher_is_better',
    "defaultScoringRuleJson" TEXT NOT NULL DEFAULT '{}',
    "measurementMode" TEXT NOT NULL DEFAULT 'manual',
    "ownerDepartmentId" INTEGER NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkKpiDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkKpiAssignment" (
    "id" SERIAL NOT NULL,
    "workPlanId" INTEGER NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "ownerEmployeeId" INTEGER NOT NULL,
    "sourceAssignmentId" INTEGER,
    "relationKind" TEXT NOT NULL DEFAULT 'direct',
    "weight" DECIMAL(20,6) NOT NULL,
    "baselineValue" DECIMAL(20,6),
    "targetValue" DECIMAL(20,6),
    "targetLowerBound" DECIMAL(20,6),
    "targetUpperBound" DECIMAL(20,6),
    "currentValue" DECIMAL(20,6),
    "definitionSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "scoringRuleSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkKpiAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkKpiResultSnapshot" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "workReportId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousSnapshotId" INTEGER,
    "actualValue" DECIMAL(20,6) NOT NULL,
    "scoreBeforeAdjustment" DECIMAL(20,6) NOT NULL,
    "confirmedScore" DECIMAL(20,6) NOT NULL,
    "adjustmentReason" TEXT NOT NULL DEFAULT '',
    "definitionSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "assignmentSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "scoringRuleSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "approvedByUserId" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkKpiResultSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingType" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "defaultVisibility" TEXT NOT NULL DEFAULT 'participants_only',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSeries" (
    "id" SERIAL NOT NULL,
    "typeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cadence" TEXT,
    "defaultVisibility" TEXT NOT NULL DEFAULT 'participants_only',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" SERIAL NOT NULL,
    "typeId" INTEGER NOT NULL,
    "seriesId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "location" TEXT NOT NULL DEFAULT '',
    "visibility" TEXT NOT NULL DEFAULT 'participants_only',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "ownerUserId" INTEGER,
    "secretaryUserId" INTEGER,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "canVote" BOOLEAN NOT NULL DEFAULT false,
    "attendanceStatus" TEXT NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgendaItem" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "presenterUserId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMinuteEntry" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "agendaItemId" INTEGER,
    "content" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMinuteEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingProposal" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "agendaItemId" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "voteVisibility" TEXT NOT NULL DEFAULT 'named',
    "minVotesRequired" INTEGER,
    "createdBy" INTEGER,
    "closedBy" INTEGER,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingVote" (
    "id" SERIAL NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "voterUserId" INTEGER NOT NULL,
    "choice" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingDecision" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "agendaItemId" INTEGER,
    "proposalId" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'decision',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "effectiveDate" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingActionCandidate" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "agendaItemId" INTEGER,
    "decisionId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "targetKind" TEXT NOT NULL DEFAULT 'work_item',
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "linkedWorkItemId" INTEGER,
    "linkedWorkPlanId" INTEGER,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingActionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPlanAlignment" (
    "id" SERIAL NOT NULL,
    "childPlanId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourcePlanId" INTEGER,
    "sourceWorkItemId" INTEGER,
    "relationKind" TEXT NOT NULL DEFAULT 'decompose',
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPlanAlignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOkrCycle" (
    "id" SERIAL NOT NULL,
    "periodType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "parentId" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOkrCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOkrControlPolicy" (
    "id" SERIAL NOT NULL,
    "cycleId" INTEGER NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'global',
    "scopeId" TEXT NOT NULL DEFAULT '',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "objectiveSubmitDeadline" TIMESTAMP(3),
    "krReviewOpensAt" TIMESTAMP(3),
    "krSubmitDeadline" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOkrControlPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOkrControlRevision" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "settingsJson" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOkrControlRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOkrControlPolicyRevision" (
    "id" SERIAL NOT NULL,
    "policyId" INTEGER,
    "cycleId" INTEGER NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL,
    "changeKind" TEXT NOT NULL DEFAULT 'upsert',
    "snapshotJson" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOkrControlPolicyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPlanGovernanceEvent" (
    "id" SERIAL NOT NULL,
    "workPlanId" INTEGER NOT NULL,
    "fromMode" TEXT NOT NULL,
    "toMode" TEXT NOT NULL,
    "fromSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "toSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPlanGovernanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectType" TEXT NOT NULL DEFAULT 'department',
    "projectLevel" TEXT NOT NULL DEFAULT '普通',
    "plan" TEXT,
    "goal" TEXT,
    "milestones" TEXT,
    "budgetAmount" DOUBLE PRECISION,
    "budgetNote" TEXT,
    "riskNote" TEXT,
    "remark" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "completionPercent" DOUBLE PRECISION,
    "closureType" TEXT,
    "leadingDepartmentId" INTEGER,
    "workspaceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEnablingDepartment" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEnablingDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProject" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "role" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPlanPhase" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "note" TEXT,
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPlanPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPlanDependency" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "predecessorKind" TEXT NOT NULL,
    "predecessorId" INTEGER NOT NULL,
    "successorKind" TEXT NOT NULL,
    "successorId" INTEGER NOT NULL,
    "dependencyType" TEXT NOT NULL DEFAULT 'finish_start',
    "lagDays" INTEGER NOT NULL DEFAULT 1,
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPlanDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPlanBaseline" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPlanBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPlanBaselineItem" (
    "id" SERIAL NOT NULL,
    "baselineId" INTEGER NOT NULL,
    "itemKind" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "parentKind" TEXT,
    "parentId" INTEGER,
    "phaseId" INTEGER,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),

    CONSTRAINT "ProjectPlanBaselineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkReport" (
    "id" SERIAL NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'weekly',
    "reportStage" TEXT NOT NULL DEFAULT 'final',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "submittedBy" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkReportItem" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "workPlanId" INTEGER,
    "workItemId" INTEGER,
    "title" TEXT NOT NULL,
    "workPlanTitleSnapshot" TEXT NOT NULL DEFAULT '',
    "workPlanKindSnapshot" TEXT NOT NULL DEFAULT '',
    "workItemTypeSnapshot" TEXT NOT NULL DEFAULT '',
    "parentWorkItemIdSnapshot" INTEGER,
    "parentTitleSnapshot" TEXT NOT NULL DEFAULT '',
    "objectiveTitleSnapshot" TEXT NOT NULL DEFAULT '',
    "keyResultTitleSnapshot" TEXT NOT NULL DEFAULT '',
    "reportItemKindSnapshot" TEXT NOT NULL DEFAULT '',
    "workItemStatusSnapshot" TEXT NOT NULL DEFAULT '',
    "snapshotPlannedStartDate" TIMESTAMP(3),
    "snapshotPlannedEndDate" TIMESTAMP(3),
    "snapshotActualEndDate" TIMESTAMP(3),
    "snapshotCompletedAt" TIMESTAMP(3),
    "previousPlanSnapshot" TEXT NOT NULL DEFAULT '',
    "doneThisWeek" TEXT NOT NULL DEFAULT '',
    "planNextWeek" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "selfScore" INTEGER,
    "performanceScore" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkReportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionResponsibilityNode" (
    "id" SERIAL NOT NULL,
    "positionDescriptionId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "nodeKey" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "pathLabel" TEXT NOT NULL DEFAULT '',
    "sourcePath" TEXT NOT NULL DEFAULT '',
    "sourceHash" TEXT NOT NULL,
    "descriptionVersion" TEXT,
    "descriptionUpdatedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionResponsibilityNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkResponsibilityReference" (
    "id" SERIAL NOT NULL,
    "targetKind" TEXT NOT NULL,
    "referenceRole" TEXT NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "responsibilityNodeId" INTEGER,
    "lockedEmployeeId" INTEGER NOT NULL,
    "lockedPositionId" INTEGER,
    "lockedEmployeePositionId" INTEGER,
    "positionDescriptionId" INTEGER NOT NULL,
    "positionDescriptionVersionSnapshot" TEXT,
    "positionDescriptionUpdatedAtSnapshot" TIMESTAMP(3),
    "nodeKeySnapshot" TEXT NOT NULL,
    "nodeTypeSnapshot" TEXT NOT NULL,
    "parentNodeKeySnapshot" TEXT,
    "pathLabelSnapshot" TEXT NOT NULL DEFAULT '',
    "titleSnapshot" TEXT NOT NULL,
    "contentSnapshot" TEXT NOT NULL DEFAULT '',
    "snapshotJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkResponsibilityReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPlan" (
    "id" SERIAL NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'personal',
    "targetId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'okr',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "okrStage" TEXT NOT NULL DEFAULT 'objective_draft',
    "objectiveSubmittedAt" TIMESTAMP(3),
    "objectiveApprovedAt" TIMESTAMP(3),
    "objectiveApprovedByUserId" INTEGER,
    "krReviewOpensAt" TIMESTAMP(3),
    "krSubmittedAt" TIMESTAMP(3),
    "krApprovedAt" TIMESTAMP(3),
    "krApprovedByUserId" INTEGER,
    "ownerEmployeeId" INTEGER,
    "collaborationId" INTEGER,
    "okrCycleId" INTEGER,
    "sourcePlanId" INTEGER,
    "parentPeriodPlanId" INTEGER,
    "previousPeriodPlanId" INTEGER,
    "okrControlScopeType" TEXT,
    "okrControlScopeId" TEXT,
    "governanceMode" TEXT NOT NULL DEFAULT 'legacy_inferred',
    "governanceRevision" INTEGER NOT NULL DEFAULT 1,
    "governanceActionKey" TEXT,
    "governanceWorkflowPolicyId" INTEGER,
    "governanceWorkflowVersion" INTEGER,
    "governanceActionContractVersion" INTEGER,
    "governanceOkrControlVersion" INTEGER,
    "governanceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "governanceBoundAt" TIMESTAMP(3),
    "governanceBoundByUserId" INTEGER,
    "governanceBindingSource" TEXT NOT NULL DEFAULT 'legacy_inferred',
    "objectiveApprovalSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "krApprovalSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "periodType" TEXT,
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "sourceType" TEXT NOT NULL DEFAULT 'other',
    "sourceKind" TEXT,
    "sourceMeetingId" INTEGER,
    "sourceMeetingDecisionId" INTEGER,
    "sourceMeetingActionCandidateId" INTEGER,
    "sourceDepartmentId" INTEGER,
    "linkedProjectId" INTEGER,
    "linkedProjectPhaseId" INTEGER,
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "milestoneDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER,
    "targetType" TEXT NOT NULL DEFAULT 'personal',
    "targetId" INTEGER,
    "category" TEXT NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'task',
    "content" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "importance" INTEGER NOT NULL DEFAULT 3,
    "urgency" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT,
    "completedAt" TIMESTAMP(3),
    "krStartValue" DOUBLE PRECISION,
    "krTargetValue" DOUBLE PRECISION,
    "krCurrentValue" DOUBLE PRECISION,
    "krUnit" TEXT,
    "routineTaskType" TEXT,
    "routineRecurrenceType" TEXT,
    "routineRecurrenceTime" TEXT,
    "routineRecurrenceWeekday" INTEGER,
    "routineRecurrenceMonthDay" INTEGER,
    "routineRecurrenceQuarterDay" INTEGER,
    "routineRecurrenceYearMonth" INTEGER,
    "routineRecurrenceYearDay" INTEGER,
    "ownerEmployeeId" INTEGER,
    "collaborationId" INTEGER,
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "milestoneDate" TIMESTAMP(3),
    "periodType" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "sourceType" TEXT NOT NULL DEFAULT 'other',
    "sourceKind" TEXT,
    "sourceMeetingId" INTEGER,
    "sourceMeetingDecisionId" INTEGER,
    "sourceMeetingActionCandidateId" INTEGER,
    "sourceDepartmentId" INTEGER,
    "linkedProjectId" INTEGER,
    "linkedProjectPhaseId" INTEGER,
    "parentWorkItemId" INTEGER,
    "parentPeriodWorkItemId" INTEGER,
    "previousPeriodWorkItemId" INTEGER,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkKrEvidence" (
    "id" SERIAL NOT NULL,
    "krWorkItemId" INTEGER NOT NULL,
    "taskWorkItemId" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkKrEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkParticipant" (
    "id" SERIAL NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "wxUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentWorkAssignee" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "DepartmentWorkAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectWorkAssignee" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "ProjectWorkAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceAnalysisTemplate" (
    "id" SERIAL NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "publishedBy" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "archivedBy" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdBy" INTEGER NOT NULL,
    "updatedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAnalysisTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceAnalysisTemplateRevision" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "changeKind" TEXT NOT NULL DEFAULT 'draft',
    "sourceRevision" INTEGER,
    "reason" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceAnalysisTemplateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErpDueDiligenceSubmission_campaignKey_status_updatedAt_idx" ON "ErpDueDiligenceSubmission"("campaignKey", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ErpDueDiligenceSubmission_positionAssignmentId_idx" ON "ErpDueDiligenceSubmission"("positionAssignmentId");

-- CreateIndex
CREATE INDEX "ErpDueDiligenceSubmission_departmentName_primaryArea_idx" ON "ErpDueDiligenceSubmission"("departmentName", "primaryArea");

-- CreateIndex
CREATE UNIQUE INDEX "ErpDueDiligenceSubmission_campaignKey_respondentUserId_key" ON "ErpDueDiligenceSubmission"("campaignKey", "respondentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ErpDueDiligenceEvidenceAttachment_attachmentUid_key" ON "ErpDueDiligenceEvidenceAttachment"("attachmentUid");

-- CreateIndex
CREATE INDEX "ErpDueDiligenceEvidenceAttachment_submissionId_evidenceKey__idx" ON "ErpDueDiligenceEvidenceAttachment"("submissionId", "evidenceKey", "uploadedAt");

-- CreateIndex
CREATE INDEX "ErpDueDiligenceEvidenceAttachment_checksumSha256_idx" ON "ErpDueDiligenceEvidenceAttachment"("checksumSha256");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_key_key" ON "AgentProfile"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_actorUserId_key" ON "AgentProfile"("actorUserId");

-- CreateIndex
CREATE INDEX "AgentProfile_status_displayName_idx" ON "AgentProfile"("status", "displayName");

-- CreateIndex
CREATE INDEX "AgentRuntimeBinding_runtimeKind_status_interactive_idx" ON "AgentRuntimeBinding"("runtimeKind", "status", "interactive");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRuntimeBinding_agentProfileId_runtimeKind_key" ON "AgentRuntimeBinding"("agentProfileId", "runtimeKind");

-- CreateIndex
CREATE INDEX "AgentSession_agentProfileId_updatedAt_idx" ON "AgentSession"("agentProfileId", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentProposal_agentProfileId_createdAt_idx" ON "AgentProposal"("agentProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentProposal_actorUserId_createdAt_idx" ON "AgentProposal"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentProposal_status_executionStartedAt_idx" ON "AgentProposal"("status", "executionStartedAt");

-- CreateIndex
CREATE INDEX "AgentRun_requesterUserId_startedAt_idx" ON "AgentRun"("requesterUserId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_actorUserId_startedAt_idx" ON "AgentRun"("actorUserId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_agentProfileId_startedAt_idx" ON "AgentRun"("agentProfileId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_runtimeBindingId_startedAt_idx" ON "AgentRun"("runtimeBindingId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_startedAt_idx" ON "AgentRun"("startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_sessionId_startedAt_idx" ON "AgentRun"("sessionId", "startedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_resourceKey_scopeId_status_updatedAt_idx" ON "ApprovalRequest"("resourceKey", "scopeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_businessActionKey_scopeId_status_updatedAt_idx" ON "ApprovalRequest"("businessActionKey", "scopeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_submitterUserId_status_updatedAt_idx" ON "ApprovalRequest"("submitterUserId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_subjectType_subjectId_idx" ON "ApprovalRequest"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ApprovalEvent_actorUserId_createdAt_idx" ON "ApprovalEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalEvent_requestId_createdAt_idx" ON "ApprovalEvent"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalEvent_requestId_sequence_key" ON "ApprovalEvent"("requestId", "sequence");

-- CreateIndex
CREATE INDEX "WorkflowPolicy_businessActionKey_scopeType_idx" ON "WorkflowPolicy"("businessActionKey", "scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowPolicy_businessActionKey_scopeType_scopeId_key" ON "WorkflowPolicy"("businessActionKey", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_wxUserId_key" ON "User"("wxUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_key_key" ON "Resource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserResourceActionGrant_userId_resourceId_actionKey_scopeId_key" ON "UserResourceActionGrant"("userId", "resourceId", "actionKey", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionResourceActionGrant_positionId_resourceId_actionKey_key" ON "PositionResourceActionGrant"("positionId", "resourceId", "actionKey", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentResourceActionGrant_departmentId_resourceId_actio_key" ON "DepartmentResourceActionGrant"("departmentId", "resourceId", "actionKey", "scopeId");

-- CreateIndex
CREATE INDEX "PermissionGrantLedgerEvent_createdAt_idx" ON "PermissionGrantLedgerEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PermissionGrantLedgerEvent_actorUserId_createdAt_idx" ON "PermissionGrantLedgerEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PermissionGrantLedgerEvent_subjectType_subjectId_createdAt_idx" ON "PermissionGrantLedgerEvent"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "PermissionGrantLedgerEvent_resourceKey_actionKey_createdAt_idx" ON "PermissionGrantLedgerEvent"("resourceKey", "actionKey", "createdAt");

-- CreateIndex
CREATE INDEX "PermissionGrantLedgerEvent_eventType_createdAt_idx" ON "PermissionGrantLedgerEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "PermissionGrantLedgerEvent_batchId_idx" ON "PermissionGrantLedgerEvent"("batchId");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_clearedAt_readAt_acknowledgedA_idx" ON "Notification"("recipientUserId", "clearedAt", "readAt", "acknowledgedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "OwnershipInterest_owner_issuer_period_idx" ON "OwnershipInterest"("ownerPartyId", "issuerCompanyId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "OwnershipInterest_issuer_consolidation_period_idx" ON "OwnershipInterest"("issuerCompanyId", "isConsolidated", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "OwnershipInterest_issuer_status_period_idx" ON "OwnershipInterest"("issuerCompanyId", "recordStatus", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRegistryChange_sourceKey_key" ON "CompanyRegistryChange"("sourceKey");

-- CreateIndex
CREATE INDEX "CompanyRegistryChange_company_date_idx" ON "CompanyRegistryChange"("companyId", "changeDate");

-- CreateIndex
CREATE INDEX "CompanyRegistryChange_company_category_date_idx" ON "CompanyRegistryChange"("companyId", "changeCategory", "changeDate");

-- CreateIndex
CREATE INDEX "CompanyRegistryOwnershipParticipant_change_side_idx" ON "CompanyRegistryOwnershipParticipant"("registryChangeId", "snapshotSide");

-- CreateIndex
CREATE INDEX "CompanyRegistryOwnershipParticipant_party_idx" ON "CompanyRegistryOwnershipParticipant"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRegistryOwnershipParticipant_change_side_sequence_key" ON "CompanyRegistryOwnershipParticipant"("registryChangeId", "snapshotSide", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ShareCapitalEvent_sourceKey_key" ON "ShareCapitalEvent"("sourceKey");

-- CreateIndex
CREATE INDEX "ShareCapitalEvent_issuer_date_status_idx" ON "ShareCapitalEvent"("issuerCompanyId", "effectiveDate", "recordStatus");

-- CreateIndex
CREATE INDEX "ShareCapitalEvent_supersedes_idx" ON "ShareCapitalEvent"("supersedesEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareCapitalEvent_issuerCompanyId_sequence_key" ON "ShareCapitalEvent"("issuerCompanyId", "sequence");

-- CreateIndex
CREATE INDEX "ShareCapitalTransaction_from_event_idx" ON "ShareCapitalTransaction"("fromPartyId", "eventId");

-- CreateIndex
CREATE INDEX "ShareCapitalTransaction_to_event_idx" ON "ShareCapitalTransaction"("toPartyId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareCapitalTransaction_eventId_sequence_key" ON "ShareCapitalTransaction"("eventId", "sequence");

-- CreateIndex
CREATE INDEX "ShareCapitalSnapshotPosition_party_event_idx" ON "ShareCapitalSnapshotPosition"("partyId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareCapitalSnapshotPosition_event_sequence_key" ON "ShareCapitalSnapshotPosition"("eventId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ShareCapitalSnapshotPosition_event_party_key" ON "ShareCapitalSnapshotPosition"("eventId", "partyId");

-- CreateIndex
CREATE INDEX "ShareholderGroup_issuer_sort_idx" ON "ShareholderGroup"("issuerCompanyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ShareholderGroup_issuerCompanyId_groupKey_key" ON "ShareholderGroup"("issuerCompanyId", "groupKey");

-- CreateIndex
CREATE INDEX "ShareholderGroupMembership_party_period_idx" ON "ShareholderGroupMembership"("partyId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "ShareholderGroupMembership_group_status_period_idx" ON "ShareholderGroupMembership"("shareholderGroupId", "recordStatus", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "ShareholderGroupMembership_group_party_from_key" ON "ShareholderGroupMembership"("shareholderGroupId", "partyId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Contract_endDate_idx" ON "Contract"("endDate");

-- CreateIndex
CREATE INDEX "Contract_handlerEmployeeId_idx" ON "Contract"("handlerEmployeeId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "DataQualityRun_startedAt_idx" ON "DataQualityRun"("startedAt");

-- CreateIndex
CREATE INDEX "DataQualityRun_status_startedAt_idx" ON "DataQualityRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "DataQualityRun_requestedByUserId_startedAt_idx" ON "DataQualityRun"("requestedByUserId", "startedAt");

-- CreateIndex
CREATE INDEX "DataQualityCheckState_domain_lastStatus_idx" ON "DataQualityCheckState"("domain", "lastStatus");

-- CreateIndex
CREATE INDEX "DataQualityCheckState_providerKey_lastStatus_idx" ON "DataQualityCheckState"("providerKey", "lastStatus");

-- CreateIndex
CREATE INDEX "DataQualityCheckState_lastRunId_idx" ON "DataQualityCheckState"("lastRunId");

-- CreateIndex
CREATE UNIQUE INDEX "DataQualityFinding_fingerprint_key" ON "DataQualityFinding"("fingerprint");

-- CreateIndex
CREATE INDEX "DataQualityFinding_status_severity_lastSeenAt_idx" ON "DataQualityFinding"("status", "severity", "lastSeenAt");

-- CreateIndex
CREATE INDEX "DataQualityFinding_checkKey_status_idx" ON "DataQualityFinding"("checkKey", "status");

-- CreateIndex
CREATE INDEX "DataQualityFinding_domain_status_idx" ON "DataQualityFinding"("domain", "status");

-- CreateIndex
CREATE INDEX "DataQualityFinding_lastRunId_idx" ON "DataQualityFinding"("lastRunId");

-- CreateIndex
CREATE INDEX "DataQualityNotificationDelivery_runId_channel_idx" ON "DataQualityNotificationDelivery"("runId", "channel");

-- CreateIndex
CREATE INDEX "DataQualityNotificationDelivery_status_createdAt_idx" ON "DataQualityNotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DataQualityEvaluationRequest_status_requestedAt_idx" ON "DataQualityEvaluationRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "DataQualityEvaluationRequest_domain_status_requestedAt_idx" ON "DataQualityEvaluationRequest"("domain", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "DataQualityEvaluationRequest_processedByRunId_idx" ON "DataQualityEvaluationRequest"("processedByRunId");

-- CreateIndex
CREATE INDEX "DocumentTemplateSpace_targetType_targetId_deletedAt_idx" ON "DocumentTemplateSpace"("targetType", "targetId", "deletedAt");

-- CreateIndex
CREATE INDEX "DocumentTemplateSpace_deletedAt_idx" ON "DocumentTemplateSpace"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateSpace_targetType_targetId_key" ON "DocumentTemplateSpace"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_spaceId_deletedAt_idx" ON "DocumentTemplate"("spaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "DocumentTemplate_ownerUserId_idx" ON "DocumentTemplate"("ownerUserId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_sourceKind_sourceProductKey_idx" ON "DocumentTemplate"("sourceKind", "sourceProductKey");

-- CreateIndex
CREATE INDEX "DocumentTemplate_documentContentRef_idx" ON "DocumentTemplate"("documentContentRef");

-- CreateIndex
CREATE INDEX "Party_name_idx" ON "Party"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Party_subjectType_identityNumber_key" ON "Party"("subjectType", "identityNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PartyNameHistory_sourceKey_key" ON "PartyNameHistory"("sourceKey");

-- CreateIndex
CREATE INDEX "PartyNameHistory_party_kind_period_idx" ON "PartyNameHistory"("partyId", "nameKind", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "PartyNameHistory_normalized_status_idx" ON "PartyNameHistory"("normalizedName", "recordStatus");

-- CreateIndex
CREATE INDEX "ExternalPartyProfile_relatedPartyType_idx" ON "ExternalPartyProfile"("relatedPartyType");

-- CreateIndex
CREATE INDEX "ExternalPartyRole_category_isActive_idx" ON "ExternalPartyRole"("category", "isActive");

-- CreateIndex
CREATE INDEX "ExternalPartyRole_category_classification_idx" ON "ExternalPartyRole"("category", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPartyRole_partyId_category_key" ON "ExternalPartyRole"("partyId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPartyRole_category_code_key" ON "ExternalPartyRole"("category", "code");

-- CreateIndex
CREATE INDEX "ExternalPartySourceMapping_roleId_idx" ON "ExternalPartySourceMapping"("roleId");

-- CreateIndex
CREATE INDEX "ExternalPartySourceMapping_companyId_sourceSystem_sourceNam_idx" ON "ExternalPartySourceMapping"("companyId", "sourceSystem", "sourceNameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPartySourceMapping_companyId_sourceSystem_sourceKey_key" ON "ExternalPartySourceMapping"("companyId", "sourceSystem", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceAssetCard_companyCode_status_assetKind_idx" ON "FinanceAssetCard"("companyCode", "status", "assetKind");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetCard_companyCode_assetCode_key" ON "FinanceAssetCard"("companyCode", "assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetCard_companyCode_sourceKey_key" ON "FinanceAssetCard"("companyCode", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceAssetCostLine_assetId_treatment_idx" ON "FinanceAssetCostLine"("assetId", "treatment");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetCostLine_assetId_sourceKey_key" ON "FinanceAssetCostLine"("assetId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetExpenseAllocation_assetId_expenseAccountCode_key" ON "FinanceAssetExpenseAllocation"("assetId", "expenseAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetImportBatch_companyCode_checksum_key" ON "FinanceAssetImportBatch"("companyCode", "checksum");

-- CreateIndex
CREATE INDEX "FinanceAssetPeriodEntry_periodId_status_idx" ON "FinanceAssetPeriodEntry"("periodId", "status");

-- CreateIndex
CREATE INDEX "FinanceAssetPeriodEntry_voucherId_idx" ON "FinanceAssetPeriodEntry"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetPeriodEntry_assetId_periodId_key" ON "FinanceAssetPeriodEntry"("assetId", "periodId");

-- CreateIndex
CREATE INDEX "FinanceAssetAdjustment_periodId_status_idx" ON "FinanceAssetAdjustment"("periodId", "status");

-- CreateIndex
CREATE INDEX "FinanceAssetAdjustment_assetId_idx" ON "FinanceAssetAdjustment"("assetId");

-- CreateIndex
CREATE INDEX "FinanceAssetAdjustment_voucherId_idx" ON "FinanceAssetAdjustment"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetAdjustment_companyCode_sourceKey_key" ON "FinanceAssetAdjustment"("companyCode", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceBudgetVersion_year_companyCode_idx" ON "FinanceBudgetVersion"("year", "companyCode");

-- CreateIndex
CREATE INDEX "FinanceBudgetVersion_status_idx" ON "FinanceBudgetVersion"("status");

-- CreateIndex
CREATE INDEX "FinanceBudgetDept_year_companyCode_idx" ON "FinanceBudgetDept"("year", "companyCode");

-- CreateIndex
CREATE INDEX "FinanceBudgetDept_accountId_idx" ON "FinanceBudgetDept"("accountId");

-- CreateIndex
CREATE INDEX "FinanceBudgetDept_versionId_idx" ON "FinanceBudgetDept"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudgetDept_versionId_dept_accountName_key" ON "FinanceBudgetDept"("versionId", "dept", "accountName");

-- CreateIndex
CREATE INDEX "FinanceBudgetRd_year_companyCode_idx" ON "FinanceBudgetRd"("year", "companyCode");

-- CreateIndex
CREATE INDEX "FinanceBudgetRd_accountId_idx" ON "FinanceBudgetRd"("accountId");

-- CreateIndex
CREATE INDEX "FinanceBudgetRd_versionId_idx" ON "FinanceBudgetRd"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudgetRd_versionId_project_category_key" ON "FinanceBudgetRd"("versionId", "project", "category");

-- CreateIndex
CREATE INDEX "FinanceCashFlowItem_parentId_idx" ON "FinanceCashFlowItem"("parentId");

-- CreateIndex
CREATE INDEX "FinanceCashFlowItem_latestImportId_idx" ON "FinanceCashFlowItem"("latestImportId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashFlowItem_companyCode_sourceSystem_sourceLedger_s_key" ON "FinanceCashFlowItem"("companyCode", "sourceSystem", "sourceLedger", "sourceCode");

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocation_importId_idx" ON "FinanceCashFlowAllocation"("importId");

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocation_companyCode_periodId_cashFlowItem_idx" ON "FinanceCashFlowAllocation"("companyCode", "periodId", "cashFlowItemId");

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocation_voucherId_idx" ON "FinanceCashFlowAllocation"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashFlowAllocation_sourceSystem_sourceDatabase_sourc_key" ON "FinanceCashFlowAllocation"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashFlowAllocationAdjustment_allocationId_key" ON "FinanceCashFlowAllocationAdjustment"("allocationId");

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocationAdjustment_companyCode_enabled_idx" ON "FinanceCashFlowAllocationAdjustment"("companyCode", "enabled");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_entitySnapshotId_statementTyp_idx" ON "FinanceConsolidationEntryLine"("entitySnapshotId", "statementType", "lineCode");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_counterpartyEntitySnapshotId_idx" ON "FinanceConsolidationEntryLine"("counterpartyEntitySnapshotId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_sourceSnapshotId_idx" ON "FinanceConsolidationEntryLine"("sourceSnapshotId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_sourceAuxiliaryBalanceId_idx" ON "FinanceConsolidationEntryLine"("sourceAuxiliaryBalanceId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_sourceOpenItemId_idx" ON "FinanceConsolidationEntryLine"("sourceOpenItemId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_sourceCashFlowAllocationId_idx" ON "FinanceConsolidationEntryLine"("sourceCashFlowAllocationId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_sourceVoucherItemId_idx" ON "FinanceConsolidationEntryLine"("sourceVoucherItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationEntryLine_entryId_lineNo_key" ON "FinanceConsolidationEntryLine"("entryId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationMatchGroup_entryId_key" ON "FinanceConsolidationMatchGroup"("entryId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationMatchGroup_batchId_category_status_idx" ON "FinanceConsolidationMatchGroup"("batchId", "category", "status");

-- CreateIndex
CREATE INDEX "FinanceConsolidationMatchGroup_leftEntitySnapshotId_rightEn_idx" ON "FinanceConsolidationMatchGroup"("leftEntitySnapshotId", "rightEntitySnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationMatchGroup_batchId_generationKey_key" ON "FinanceConsolidationMatchGroup"("batchId", "generationKey");

-- CreateIndex
CREATE INDEX "FinanceConsolidationMatchSource_voucherItemId_idx" ON "FinanceConsolidationMatchSource"("voucherItemId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationMatchSource_entitySnapshotId_counterpar_idx" ON "FinanceConsolidationMatchSource"("entitySnapshotId", "counterpartyEntitySnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationMatchSource_matchGroupId_voucherItemId_key" ON "FinanceConsolidationMatchSource"("matchGroupId", "voucherItemId");

-- CreateIndex
CREATE INDEX "FinanceVoucherCompanyMappingRule_purpose_sourceCompanyCode_isAc" ON "FinanceVoucherCompanyMappingRule"("purpose", "sourceCompanyCode", "isActive", "priority");

-- CreateIndex
CREATE INDEX "FinanceVoucherCompanyMappingRule_linkedCompanyId_idx" ON "FinanceVoucherCompanyMappingRule"("linkedCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationOutputSnapshot_batchId_key" ON "FinanceConsolidationOutputSnapshot"("batchId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationOutputSnapshot_outputFingerprint_idx" ON "FinanceConsolidationOutputSnapshot"("outputFingerprint");

-- CreateIndex
CREATE INDEX "FinanceConsolidationBatch_scope_status_idx" ON "FinanceConsolidationBatch"("parentCompanyId", "year", "month", "periodKind", "status");

-- CreateIndex
CREATE INDEX "FinanceConsolidationBatch_baseBatchId_idx" ON "FinanceConsolidationBatch"("baseBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationBatch_scope_version_key" ON "FinanceConsolidationBatch"("parentCompanyId", "year", "month", "periodKind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCompanyCurrencyPolicy_companyId_key" ON "FinanceCompanyCurrencyPolicy"("companyId");

-- CreateIndex
CREATE INDEX "FinanceCompanyCurrencyPolicy_functionalCurrency_idx" ON "FinanceCompanyCurrencyPolicy"("functionalCurrency");

-- CreateIndex
CREATE INDEX "FinanceConsolidationBatchEvent_batchId_createdAt_idx" ON "FinanceConsolidationBatchEvent"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceConsolidationBatchEvent_batchId_action_idx" ON "FinanceConsolidationBatchEvent"("batchId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationBatchEvent_batchId_batchRevision_key" ON "FinanceConsolidationBatchEvent"("batchId", "batchRevision");

-- CreateIndex
CREATE INDEX "FinanceConsolidationControlDecision_batchId_decision_idx" ON "FinanceConsolidationControlDecision"("batchId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationControlDecision_batchId_controlKey_key" ON "FinanceConsolidationControlDecision"("batchId", "controlKey");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntitySnapshot_batchId_role_idx" ON "FinanceConsolidationEntitySnapshot"("batchId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationEntitySnapshot_batchId_companyId_key" ON "FinanceConsolidationEntitySnapshot"("batchId", "companyId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationSourceSnapshot_workpaperId_workpaperVer_idx" ON "FinanceConsolidationSourceSnapshot"("workpaperId", "workpaperVersion");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationSourceSnapshot_batchId_entitySnapshotId_key" ON "FinanceConsolidationSourceSnapshot"("batchId", "entitySnapshotId", "reportType");

-- CreateIndex
CREATE INDEX "FinanceConsolidationRateSnapshot_batchId_rateKind_rateDate_idx" ON "FinanceConsolidationRateSnapshot"("batchId", "rateKind", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationRateSnapshot_batchId_exchangeRateId_key" ON "FinanceConsolidationRateSnapshot"("batchId", "exchangeRateId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationEntry_predecessorEntryId_key" ON "FinanceConsolidationEntry"("predecessorEntryId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntry_batchId_status_entryType_idx" ON "FinanceConsolidationEntry"("batchId", "status", "entryType");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntry_supersedesEntryId_idx" ON "FinanceConsolidationEntry"("supersedesEntryId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntry_reversalOfEntryId_idx" ON "FinanceConsolidationEntry"("reversalOfEntryId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntry_predecessorEntryId_idx" ON "FinanceConsolidationEntry"("predecessorEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationEntry_batchId_entryNo_key" ON "FinanceConsolidationEntry"("batchId", "entryNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationEntry_batchId_generationKey_key" ON "FinanceConsolidationEntry"("batchId", "generationKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationEntry_supersedesEntryId_key" ON "FinanceConsolidationEntry"("supersedesEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationEntry_reversalOfEntryId_key" ON "FinanceConsolidationEntry"("reversalOfEntryId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationTaxEffect_entryId_taxEffectType_idx" ON "FinanceConsolidationTaxEffect"("entryId", "taxEffectType");

-- CreateIndex
CREATE INDEX "FinanceConsolidationTaxEffect_entitySnapshotId_recognitionL_idx" ON "FinanceConsolidationTaxEffect"("entitySnapshotId", "recognitionLocation");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsolidationTaxEffect_entryId_effectKey_key" ON "FinanceConsolidationTaxEffect"("entryId", "effectKey");

-- CreateIndex
CREATE INDEX "FinanceDataImport_profile_year_idx" ON "FinanceDataImport"("profile", "year");

-- CreateIndex
CREATE INDEX "FinanceDataImport_sourceFile_idx" ON "FinanceDataImport"("sourceFile");

-- CreateIndex
CREATE INDEX "FinanceShipment_year_month_idx" ON "FinanceShipment"("year", "month");

-- CreateIndex
CREATE INDEX "FinanceShipment_customerId_idx" ON "FinanceShipment"("customerId");

-- CreateIndex
CREATE INDEX "FinanceShipment_productId_idx" ON "FinanceShipment"("productId");

-- CreateIndex
CREATE INDEX "FinanceShipment_customerName_idx" ON "FinanceShipment"("customerName");

-- CreateIndex
CREATE INDEX "FinanceShipment_productName_idx" ON "FinanceShipment"("productName");

-- CreateIndex
CREATE INDEX "FinanceShipment_salesChannel_employeeId_idx" ON "FinanceShipment"("salesChannel", "employeeId");

-- CreateIndex
CREATE INDEX "FinanceShipment_employeeId_idx" ON "FinanceShipment"("employeeId");

-- CreateIndex
CREATE INDEX "FinanceSalesSalary_year_month_idx" ON "FinanceSalesSalary"("year", "month");

-- CreateIndex
CREATE INDEX "FinanceSalesSalary_salesChannel_employeeId_idx" ON "FinanceSalesSalary"("salesChannel", "employeeId");

-- CreateIndex
CREATE INDEX "FinanceSalesSalary_employeeId_idx" ON "FinanceSalesSalary"("employeeId");

-- CreateIndex
CREATE INDEX "FinanceCostStructureRow_year_month_idx" ON "FinanceCostStructureRow"("year", "month");

-- CreateIndex
CREATE INDEX "FinanceCostStructureRow_productId_idx" ON "FinanceCostStructureRow"("productId");

-- CreateIndex
CREATE INDEX "FinanceCostStructureRow_receiptReportId_idx" ON "FinanceCostStructureRow"("receiptReportId");

-- CreateIndex
CREATE INDEX "FinanceCostStructureRow_productName_idx" ON "FinanceCostStructureRow"("productName");

-- CreateIndex
CREATE INDEX "FinanceCostAnalysisRow_year_month_idx" ON "FinanceCostAnalysisRow"("year", "month");

-- CreateIndex
CREATE INDEX "FinanceCostAnalysisRow_tableName_idx" ON "FinanceCostAnalysisRow"("tableName");

-- CreateIndex
CREATE INDEX "FinanceCostAnalysisRow_metricKey_idx" ON "FinanceCostAnalysisRow"("metricKey");

-- CreateIndex
CREATE INDEX "FinanceWorkshopReport_year_month_idx" ON "FinanceWorkshopReport"("year", "month");

-- CreateIndex
CREATE INDEX "FinanceWorkshopReport_productName_idx" ON "FinanceWorkshopReport"("productName");

-- CreateIndex
CREATE INDEX "FinanceWorkshopReport_batchNo_idx" ON "FinanceWorkshopReport"("batchNo");

-- CreateIndex
CREATE INDEX "FinanceWorkshopReport_employeeId_idx" ON "FinanceWorkshopReport"("employeeId");

-- CreateIndex
CREATE INDEX "FinanceWorkshopReport_positionId_idx" ON "FinanceWorkshopReport"("positionId");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryMember_companyCode_dimensionType_sourceName_idx" ON "FinanceAuxiliaryMember"("companyCode", "dimensionType", "sourceName");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryMember_linkedCompanyId_idx" ON "FinanceAuxiliaryMember"("linkedCompanyId");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryMember_latestImportId_idx" ON "FinanceAuxiliaryMember"("latestImportId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAuxiliaryMember_companyCode_sourceSystem_sourceLedge_key" ON "FinanceAuxiliaryMember"("companyCode", "sourceSystem", "sourceLedger", "dimensionType", "sourceCode");

-- CreateIndex
CREATE INDEX "FinanceCounterpartyClassification_counterpartyType_accountI_idx" ON "FinanceCounterpartyClassification"("counterpartyType", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCounterpartyClassification_memberId_accountId_key" ON "FinanceCounterpartyClassification"("memberId", "accountId");

-- CreateIndex
CREATE INDEX "FinanceVoucherItemAuxiliary_memberId_sourceRole_idx" ON "FinanceVoucherItemAuxiliary"("memberId", "sourceRole");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucherItemAuxiliary_itemId_memberId_sourceRole_key" ON "FinanceVoucherItemAuxiliary"("itemId", "memberId", "sourceRole");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryBalance_importId_idx" ON "FinanceAuxiliaryBalance"("importId");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryBalance_companyCode_periodId_accountId_idx" ON "FinanceAuxiliaryBalance"("companyCode", "periodId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAuxiliaryBalance_sourceSystem_sourceDatabase_sourceK_key" ON "FinanceAuxiliaryBalance"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryBalanceMember_memberId_sourceRole_idx" ON "FinanceAuxiliaryBalanceMember"("memberId", "sourceRole");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAuxiliaryBalanceMember_balanceId_memberId_sourceRole_key" ON "FinanceAuxiliaryBalanceMember"("balanceId", "memberId", "sourceRole");

-- CreateIndex
CREATE INDEX "FinanceOpenItem_importId_idx" ON "FinanceOpenItem"("importId");

-- CreateIndex
CREATE INDEX "FinanceOpenItem_companyCode_status_documentDate_idx" ON "FinanceOpenItem"("companyCode", "status", "documentDate");

-- CreateIndex
CREATE INDEX "FinanceOpenItem_accountId_status_idx" ON "FinanceOpenItem"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOpenItem_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceOpenItem"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceOpenItemSettlement_openItemId_settlementDate_idx" ON "FinanceOpenItemSettlement"("openItemId", "settlementDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOpenItemSettlement_sourceSystem_sourceDatabase_sourc_key" ON "FinanceOpenItemSettlement"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceOpenItemAuxiliary_memberId_sourceRole_idx" ON "FinanceOpenItemAuxiliary"("memberId", "sourceRole");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOpenItemAuxiliary_openItemId_memberId_sourceRole_key" ON "FinanceOpenItemAuxiliary"("openItemId", "memberId", "sourceRole");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceGroupAccount_code_key" ON "FinanceGroupAccount"("code");

-- CreateIndex
CREATE INDEX "FinanceGroupAccount_name_idx" ON "FinanceGroupAccount"("name");

-- CreateIndex
CREATE INDEX "FinanceGroupAccount_parentId_idx" ON "FinanceGroupAccount"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountingPolicyVersion_versionNo_key" ON "FinanceAccountingPolicyVersion"("versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountingPolicyVersion_code_key" ON "FinanceAccountingPolicyVersion"("code");

-- CreateIndex
CREATE INDEX "FinanceAccountingPolicyVersion_effective_range_idx" ON "FinanceAccountingPolicyVersion"("effectiveFrom", "effectiveTo", "status");

-- CreateIndex
CREATE INDEX "FinanceGroupAccountRevision_parent_idx" ON "FinanceGroupAccountRevision"("parentGroupAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceGroupAccountRevision_version_account_key" ON "FinanceGroupAccountRevision"("policyVersionId", "groupAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceGroupAccountRevision_version_code_key" ON "FinanceGroupAccountRevision"("policyVersionId", "code");

-- CreateIndex
CREATE INDEX "FinanceGroupAccountMapping_groupAccountId_idx" ON "FinanceGroupAccountMapping"("groupAccountId");

-- CreateIndex
CREATE INDEX "FinanceGroupAccountMapping_companyCode_localAccountName_idx" ON "FinanceGroupAccountMapping"("companyCode", "localAccountName");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceGroupAccountMapping_version_scope_local_key" ON "FinanceGroupAccountMapping"("policyVersionId", "companyCode", "sourceScopeKey", "localAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReadableSourcePackage_packageKey_key" ON "FinanceReadableSourcePackage"("packageKey");

-- CreateIndex
CREATE INDEX "FinanceReadableSourcePackage_sourceSystem_snapshotDate_idx" ON "FinanceReadableSourcePackage"("sourceSystem", "snapshotDate");

-- CreateIndex
CREATE INDEX "FinanceReadableSourcePackage_selectedDatabaseChecksum_idx" ON "FinanceReadableSourcePackage"("selectedDatabaseChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReadableImportRun_runKey_key" ON "FinanceReadableImportRun"("runKey");

-- CreateIndex
CREATE INDEX "FinanceReadableImportRun_ledgerImportId_startedAt_idx" ON "FinanceReadableImportRun"("ledgerImportId", "startedAt");

-- CreateIndex
CREATE INDEX "FinanceReadableImportRun_sourcePackageId_idx" ON "FinanceReadableImportRun"("sourcePackageId");

-- CreateIndex
CREATE INDEX "FinanceSourceLedgerMapping_companyCode_effectiveFromYear_ef_idx" ON "FinanceSourceLedgerMapping"("companyCode", "effectiveFromYear", "effectiveToYear");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSourceLedgerMapping_companyCode_sourceSystem_sourceL_key" ON "FinanceSourceLedgerMapping"("companyCode", "sourceSystem", "sourceLedger", "effectiveFromYear");

-- CreateIndex
CREATE INDEX "FinanceAccountAuxiliaryRequirement_importId_idx" ON "FinanceAccountAuxiliaryRequirement"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountAuxiliaryRequirement_accountId_dimensionType_key" ON "FinanceAccountAuxiliaryRequirement"("accountId", "dimensionType");

-- CreateIndex
CREATE INDEX "FinanceSourcePeriodStatus_periodId_glMonthEnd_idx" ON "FinanceSourcePeriodStatus"("periodId", "glMonthEnd");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSourcePeriodStatus_importId_periodId_key" ON "FinanceSourcePeriodStatus"("importId", "periodId");

-- CreateIndex
CREATE INDEX "FinanceSourceSubsystemStatus_subsystemCode_isYearClosed_idx" ON "FinanceSourceSubsystemStatus"("subsystemCode", "isYearClosed");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSourceSubsystemStatus_importId_subsystemCode_key" ON "FinanceSourceSubsystemStatus"("importId", "subsystemCode");

-- CreateIndex
CREATE INDEX "FinanceAccountLineage_importId_idx" ON "FinanceAccountLineage"("importId");

-- CreateIndex
CREATE INDEX "FinanceAccountLineage_previousAccountId_currentAccountId_idx" ON "FinanceAccountLineage"("previousAccountId", "currentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountLineage_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceAccountLineage"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLedgerImport_batchKey_key" ON "FinanceLedgerImport"("batchKey");

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_companyCode_year_type_idx" ON "FinanceLedgerImport"("companyCode", "year", "type");

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_sourceSystem_sourceLedger_year_idx" ON "FinanceLedgerImport"("sourceSystem", "sourceLedger", "year");

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_sourceFile_idx" ON "FinanceLedgerImport"("sourceFile");

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_sourcePackageId_idx" ON "FinanceLedgerImport"("sourcePackageId");

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_sourceLedgerMappingId_idx" ON "FinanceLedgerImport"("sourceLedgerMappingId");

-- CreateIndex
CREATE INDEX "FinanceSourceAccountBalance_importId_idx" ON "FinanceSourceAccountBalance"("importId");

-- CreateIndex
CREATE INDEX "FinanceSourceAccountBalance_companyCode_periodId_accountId_idx" ON "FinanceSourceAccountBalance"("companyCode", "periodId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSourceAccountBalance_sourceSystem_sourceDatabase_sou_key" ON "FinanceSourceAccountBalance"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_code_companyCode_year_key" ON "FinanceAccount"("code", "companyCode", "year");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceAccount"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriod_companyCode_year_month_key" ON "FinancePeriod"("companyCode", "year", "month");

-- CreateIndex
CREATE INDEX "FinanceStatementVoucherExclusion_companyCode_statementType__idx" ON "FinanceStatementVoucherExclusion"("companyCode", "statementType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementVoucherExclusion_voucherId_statementType_key" ON "FinanceStatementVoucherExclusion"("voucherId", "statementType");

-- CreateIndex
CREATE INDEX "FinanceVoucher_importId_idx" ON "FinanceVoucher"("importId");

-- CreateIndex
CREATE INDEX "FinanceVoucher_periodId_date_companyCode_idx" ON "FinanceVoucher"("periodId", "date", "companyCode");

-- CreateIndex
CREATE INDEX "FinanceVoucher_status_idx" ON "FinanceVoucher"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucher_voucherNo_companyCode_periodId_key" ON "FinanceVoucher"("voucherNo", "companyCode", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucher_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceVoucher"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceVoucherItem_importFingerprint_idx" ON "FinanceVoucherItem"("importFingerprint");

-- CreateIndex
CREATE INDEX "FinanceVoucherItem_importId_idx" ON "FinanceVoucherItem"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucherItem_voucherId_accountId_sortOrder_key" ON "FinanceVoucherItem"("voucherId", "accountId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucherItem_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceVoucherItem"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountBalance_accountId_periodId_key" ON "FinanceAccountBalance"("accountId", "periodId");

-- CreateIndex
CREATE INDEX "FinanceBalanceSnapshot_companyCode_year_isActive_idx" ON "FinanceBalanceSnapshot"("companyCode", "year", "isActive");

-- CreateIndex
CREATE INDEX "FinanceBalanceSnapshot_companyCode_year_snapshotType_idx" ON "FinanceBalanceSnapshot"("companyCode", "year", "snapshotType");

-- CreateIndex
CREATE INDEX "FinanceBalanceSnapshot_companyCode_year_sourceFile_idx" ON "FinanceBalanceSnapshot"("companyCode", "year", "sourceFile");

-- CreateIndex
CREATE INDEX "FinanceBalanceSnapshotRow_snapshotId_idx" ON "FinanceBalanceSnapshotRow"("snapshotId");

-- CreateIndex
CREATE INDEX "FinanceBalanceSnapshotRow_accountId_idx" ON "FinanceBalanceSnapshotRow"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBalanceSnapshotRow_snapshotId_accountId_key" ON "FinanceBalanceSnapshotRow"("snapshotId", "accountId");

-- CreateIndex
CREATE INDEX "FinanceReclassRule_sourceGroupAccountId_idx" ON "FinanceReclassRule"("sourceGroupAccountId");

-- CreateIndex
CREATE INDEX "FinanceReclassRule_targetGroupAccountId_idx" ON "FinanceReclassRule"("targetGroupAccountId");

-- CreateIndex
CREATE INDEX "FinanceReclassRule_sourceAccountCode_idx" ON "FinanceReclassRule"("sourceAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReclassRule_policyVersionId_sourceGroupAccountId_abn_key" ON "FinanceReclassRule"("policyVersionId", "sourceGroupAccountId", "abnormalSide");

-- CreateIndex
CREATE INDEX "FinanceReclassItemRule_companyCode_year_sourceAccountCode_idx" ON "FinanceReclassItemRule"("companyCode", "year", "sourceAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReclassItemRule_companyCode_year_sourceAccountCode_m_key" ON "FinanceReclassItemRule"("companyCode", "year", "sourceAccountCode", "matchType", "matchValue");

-- CreateIndex
CREATE INDEX "FinanceBalanceReclassAdjustment_policyVersionId_sourceGroup_idx" ON "FinanceBalanceReclassAdjustment"("policyVersionId", "sourceGroupAccountId");

-- CreateIndex
CREATE INDEX "FinanceBalanceReclassAdjustment_periodId_status_idx" ON "FinanceBalanceReclassAdjustment"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBalanceReclassAdjustment_periodId_sourceAccountCode_key" ON "FinanceBalanceReclassAdjustment"("periodId", "sourceAccountCode");

-- CreateIndex
CREATE INDEX "FinanceBalanceReclassAdjustmentHistory_periodId_archivedAt_idx" ON "FinanceBalanceReclassAdjustmentHistory"("periodId", "archivedAt");

-- CreateIndex
CREATE INDEX "FinanceBalanceReclassAdjustmentHistory_companyCode_year_sou_idx" ON "FinanceBalanceReclassAdjustmentHistory"("companyCode", "year", "sourceAccountCode");

-- CreateIndex
CREATE INDEX "FinanceBalanceReclassAdjustmentHistory_adjustmentIdSnapshot_idx" ON "FinanceBalanceReclassAdjustmentHistory"("adjustmentIdSnapshot");

-- CreateIndex
CREATE INDEX "ReclassResult_periodId_status_idx" ON "ReclassResult"("periodId", "status");

-- CreateIndex
CREATE INDEX "ReclassResult_ruleId_idx" ON "ReclassResult"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "ReclassResult_periodId_voucherItemId_key" ON "ReclassResult"("periodId", "voucherItemId");

-- CreateIndex
CREATE INDEX "FinanceStatementSourcePackage_companyId_year_month_status_idx" ON "FinanceStatementSourcePackage"("companyId", "year", "month", "status");

-- CreateIndex
CREATE INDEX "FinanceStatementSourcePackage_fileChecksum_idx" ON "FinanceStatementSourcePackage"("fileChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementSourcePackage_companyId_year_month_revision_key" ON "FinanceStatementSourcePackage"("companyId", "year", "month", "revision");

-- CreateIndex
CREATE INDEX "FinanceStatementSourceSheet_packageId_idx" ON "FinanceStatementSourceSheet"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementSourceSheet_packageId_reportType_key" ON "FinanceStatementSourceSheet"("packageId", "reportType");

-- CreateIndex
CREATE INDEX "FinanceStatementSourceLine_sheetId_sortOrder_idx" ON "FinanceStatementSourceLine"("sheetId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementSourceLine_sheetId_lineCode_key" ON "FinanceStatementSourceLine"("sheetId", "lineCode");

-- CreateIndex
CREATE INDEX "FinanceStatementWorkpaper_companyCode_year_reportType_idx" ON "FinanceStatementWorkpaper"("companyCode", "year", "reportType");

-- CreateIndex
CREATE INDEX "FinanceStatementWorkpaper_sourcePackageId_idx" ON "FinanceStatementWorkpaper"("sourcePackageId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementWorkpaper_companyCode_year_month_reportType_key" ON "FinanceStatementWorkpaper"("companyCode", "year", "month", "reportType");

-- CreateIndex
CREATE INDEX "FinanceStatementWorkpaperLine_workpaperId_idx" ON "FinanceStatementWorkpaperLine"("workpaperId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementWorkpaperLine_workpaperId_lineCode_key" ON "FinanceStatementWorkpaperLine"("workpaperId", "lineCode");

-- CreateIndex
CREATE INDEX "FinanceStatementExchangeRate_currency_date_idx" ON "FinanceStatementExchangeRate"("baseCurrency", "quoteCurrency", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementExchangeRate_currency_kind_date_version_key" ON "FinanceStatementExchangeRate"("baseCurrency", "quoteCurrency", "rateKind", "rateDate", "version");

-- CreateIndex
CREATE INDEX "FinanceCurrency_latestImportId_idx" ON "FinanceCurrency"("latestImportId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCurrency_companyCode_sourceSystem_sourceLedger_sourc_key" ON "FinanceCurrency"("companyCode", "sourceSystem", "sourceLedger", "sourceCode");

-- CreateIndex
CREATE INDEX "FinanceBankAccount_accountId_idx" ON "FinanceBankAccount"("accountId");

-- CreateIndex
CREATE INDEX "FinanceBankAccount_latestImportId_idx" ON "FinanceBankAccount"("latestImportId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankAccount_companyCode_sourceSystem_sourceLedger_so_key" ON "FinanceBankAccount"("companyCode", "sourceSystem", "sourceLedger", "sourceKey");

-- CreateIndex
CREATE INDEX "DepartmentDescription_departmentId_idx" ON "DepartmentDescription"("departmentId");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleEvent_employeeId_effectiveDate_idx" ON "EmployeeLifecycleEvent"("employeeId", "effectiveDate");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleEvent_eventType_effectiveDate_idx" ON "EmployeeLifecycleEvent"("eventType", "effectiveDate");

-- CreateIndex
CREATE INDEX "HrPerformanceReview_okrCycleId_idx" ON "HrPerformanceReview"("okrCycleId");

-- CreateIndex
CREATE INDEX "HrPerformanceReview_approvalRequestId_idx" ON "HrPerformanceReview"("approvalRequestId");

-- CreateIndex
CREATE INDEX "HrPerformanceReview_finalGrade_idx" ON "HrPerformanceReview"("finalGrade");

-- CreateIndex
CREATE INDEX "HrPerformanceReview_archivedAt_idx" ON "HrPerformanceReview"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HrPerformanceReview_employeeId_okrCycleId_key" ON "HrPerformanceReview"("employeeId", "okrCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeId_key" ON "Employee"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_idNumber_key" ON "Employee"("idNumber");

-- CreateIndex
CREATE INDEX "Employment_employeeId_idx" ON "Employment"("employeeId");

-- CreateIndex
CREATE INDEX "Employment_isActive_idx" ON "Employment"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Company_partyId_key" ON "Company"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE INDEX "Department_code_idx" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_name_idx" ON "Department"("name");

-- CreateIndex
CREATE INDEX "Department_hierarchyKind_level_idx" ON "Department"("hierarchyKind", "level");

-- CreateIndex
CREATE INDEX "Department_managerPositionId_idx" ON "Department"("managerPositionId");

-- CreateIndex
CREATE INDEX "DepartmentManagerEmployee_employeeId_idx" ON "DepartmentManagerEmployee"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentManagerEmployee_departmentId_employeeId_key" ON "DepartmentManagerEmployee"("departmentId", "employeeId");

-- CreateIndex
CREATE INDEX "Position_code_idx" ON "Position"("code");

-- CreateIndex
CREATE INDEX "Position_name_idx" ON "Position"("name");

-- CreateIndex
CREATE INDEX "Position_departmentId_idx" ON "Position"("departmentId");

-- CreateIndex
CREATE INDEX "Position_reportToPositionId_idx" ON "Position"("reportToPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_positionDescriptionId_key" ON "Position"("positionDescriptionId");

-- CreateIndex
CREATE INDEX "EmployeePosition_employeeId_idx" ON "EmployeePosition"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeePosition_reportingCompanyId_idx" ON "EmployeePosition"("reportingCompanyId");

-- CreateIndex
CREATE INDEX "EmployeePosition_departmentId_idx" ON "EmployeePosition"("departmentId");

-- CreateIndex
CREATE INDEX "EmployeePosition_positionId_idx" ON "EmployeePosition"("positionId");

-- CreateIndex
CREATE INDEX "EmployeePosition_positionReportOverrideId_idx" ON "EmployeePosition"("positionReportOverrideId");

-- CreateIndex
CREATE INDEX "EmployeePosition_reportToPositionId_idx" ON "EmployeePosition"("reportToPositionId");

-- CreateIndex
CREATE INDEX "PositionReportOverride_companyId_idx" ON "PositionReportOverride"("companyId");

-- CreateIndex
CREATE INDEX "PositionReportOverride_departmentId_idx" ON "PositionReportOverride"("departmentId");

-- CreateIndex
CREATE INDEX "PositionReportOverride_reportToPositionId_idx" ON "PositionReportOverride"("reportToPositionId");

-- CreateIndex
CREATE INDEX "PositionReportOverride_isActive_idx" ON "PositionReportOverride"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PositionReportOverride_positionId_companyId_departmentId_key" ON "PositionReportOverride"("positionId", "companyId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EditHistory_entityType_entityId_version_tag_key" ON "EditHistory"("entityType", "entityId", "version", "tag");

-- CreateIndex
CREATE INDEX "InventoryItem_productMasterId_status_idx" ON "InventoryItem"("productMasterId", "status");

-- CreateIndex
CREATE INDEX "InventoryItem_companyCode_status_itemType_idx" ON "InventoryItem"("companyCode", "status", "itemType");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_companyCode_code_key" ON "InventoryItem"("companyCode", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_companyCode_sourceKey_key" ON "InventoryItem"("companyCode", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUnitConversion_itemId_unit_key" ON "InventoryUnitConversion"("itemId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryWarehouse_companyCode_code_key" ON "InventoryWarehouse"("companyCode", "code");

-- CreateIndex
CREATE INDEX "InventoryBatch_expiryDate_status_idx" ON "InventoryBatch"("expiryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_itemId_warehouseId_batchNo_key" ON "InventoryBatch"("itemId", "warehouseId", "batchNo");

-- CreateIndex
CREATE INDEX "InventoryDocument_companyCode_documentDate_documentType_sta_idx" ON "InventoryDocument"("companyCode", "documentDate", "documentType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_companyCode_documentNo_key" ON "InventoryDocument"("companyCode", "documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_companyCode_sourceKey_key" ON "InventoryDocument"("companyCode", "sourceKey");

-- CreateIndex
CREATE INDEX "InventoryDocumentLine_itemId_warehouseId_batchId_idx" ON "InventoryDocumentLine"("itemId", "warehouseId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocumentLine_documentId_sourceKey_key" ON "InventoryDocumentLine"("documentId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLedgerEntry_documentLineId_key" ON "InventoryLedgerEntry"("documentLineId");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_companyCode_movementDate_idx" ON "InventoryLedgerEntry"("companyCode", "movementDate");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_itemId_warehouseId_batchId_idx" ON "InventoryLedgerEntry"("itemId", "warehouseId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStocktake_companyCode_stocktakeNo_key" ON "InventoryStocktake"("companyCode", "stocktakeNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStocktake_companyCode_sourceKey_key" ON "InventoryStocktake"("companyCode", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStocktakeLine_stocktakeId_itemId_warehouseId_batch_key" ON "InventoryStocktakeLine"("stocktakeId", "itemId", "warehouseId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPeriodClose_companyCode_year_month_key" ON "InventoryPeriodClose"("companyCode", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryImportBatch_companyCode_checksum_sourceSheet_key" ON "InventoryImportBatch"("companyCode", "checksum", "sourceSheet");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptReport_recordUid_key" ON "InventoryReceiptReport"("recordUid");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptReport_sourceKey_key" ON "InventoryReceiptReport"("sourceKey");

-- CreateIndex
CREATE INDEX "InventoryReceiptReport_year_month_idx" ON "InventoryReceiptReport"("year", "month");

-- CreateIndex
CREATE INDEX "InventoryReceiptReport_status_year_month_idx" ON "InventoryReceiptReport"("status", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptReport_year_month_workshopName_key" ON "InventoryReceiptReport"("year", "month", "workshopName");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptProductWorkPoint_sourceKey_key" ON "InventoryReceiptProductWorkPoint"("sourceKey");

-- CreateIndex
CREATE INDEX "InventoryReceiptProductWorkPoint_reportId_sortOrder_idx" ON "InventoryReceiptProductWorkPoint"("reportId", "sortOrder");

-- CreateIndex
CREATE INDEX "InventoryReceiptProductWorkPoint_productId_idx" ON "InventoryReceiptProductWorkPoint"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptProductWorkPoint_reportId_productName_key" ON "InventoryReceiptProductWorkPoint"("reportId", "productName");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptProductWorkPoint_reportId_productId_key" ON "InventoryReceiptProductWorkPoint"("reportId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptReportEvent_sourceKey_key" ON "InventoryReceiptReportEvent"("sourceKey");

-- CreateIndex
CREATE INDEX "InventoryReceiptReportEvent_reportId_createdAt_idx" ON "InventoryReceiptReportEvent"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryReceiptReportEvent_eventType_createdAt_idx" ON "InventoryReceiptReportEvent"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptBatch_sourceKey_key" ON "InventoryReceiptBatch"("sourceKey");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_reportId_sortOrder_idx" ON "InventoryReceiptBatch"("reportId", "sortOrder");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_productId_idx" ON "InventoryReceiptBatch"("productId");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_productName_idx" ON "InventoryReceiptBatch"("productName");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_batchNumber_idx" ON "InventoryReceiptBatch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceiptOutput_sourceKey_key" ON "InventoryReceiptOutput"("sourceKey");

-- CreateIndex
CREATE INDEX "InventoryReceiptOutput_batchId_sortOrder_idx" ON "InventoryReceiptOutput"("batchId", "sortOrder");

-- CreateIndex
CREATE INDEX "InventoryReceiptOutput_productSkuId_idx" ON "InventoryReceiptOutput"("productSkuId");

-- CreateIndex
CREATE INDEX "InventoryReceiptOutput_auditStatus_idx" ON "InventoryReceiptOutput"("auditStatus");

-- CreateIndex
CREATE INDEX "InventoryReceiptOutput_sourceFile_sourceSheet_sourceRow_idx" ON "InventoryReceiptOutput"("sourceFile", "sourceSheet", "sourceRow");

-- CreateIndex
CREATE UNIQUE INDEX "StockRawMaterial_code_key" ON "StockRawMaterial"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockPackaging_code_key" ON "StockPackaging"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockFinishedGoods_code_key" ON "StockFinishedGoods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryTagCandidate_candidateUid_key" ON "LibraryTagCandidate"("candidateUid");

-- CreateIndex
CREATE INDEX "LibraryTagCandidate_documentId_status_idx" ON "LibraryTagCandidate"("documentId", "status");

-- CreateIndex
CREATE INDEX "LibraryTagCandidate_versionId_status_idx" ON "LibraryTagCandidate"("versionId", "status");

-- CreateIndex
CREATE INDEX "LibraryTagCandidate_tagId_idx" ON "LibraryTagCandidate"("tagId");

-- CreateIndex
CREATE INDEX "LibraryTagCandidate_reviewedBy_idx" ON "LibraryTagCandidate"("reviewedBy");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryTagCandidate_versionId_proposedKey_promptVersion_key" ON "LibraryTagCandidate"("versionId", "proposedKey", "promptVersion");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEntityMention_mentionUid_key" ON "LibraryEntityMention"("mentionUid");

-- CreateIndex
CREATE INDEX "LibraryEntityMention_versionId_entityType_idx" ON "LibraryEntityMention"("versionId", "entityType");

-- CreateIndex
CREATE INDEX "LibraryEntityMention_chunkId_idx" ON "LibraryEntityMention"("chunkId");

-- CreateIndex
CREATE INDEX "LibraryEntityMention_entityType_canonicalValue_idx" ON "LibraryEntityMention"("entityType", "canonicalValue");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryMetadataCandidate_candidateUid_key" ON "LibraryMetadataCandidate"("candidateUid");

-- CreateIndex
CREATE INDEX "LibraryMetadataCandidate_documentId_status_idx" ON "LibraryMetadataCandidate"("documentId", "status");

-- CreateIndex
CREATE INDEX "LibraryMetadataCandidate_versionId_status_idx" ON "LibraryMetadataCandidate"("versionId", "status");

-- CreateIndex
CREATE INDEX "LibraryMetadataCandidate_reviewedBy_idx" ON "LibraryMetadataCandidate"("reviewedBy");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryMetadataCandidate_versionId_promptVersion_key" ON "LibraryMetadataCandidate"("versionId", "promptVersion");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEvaluationCase_caseUid_key" ON "LibraryEvaluationCase"("caseUid");

-- CreateIndex
CREATE INDEX "LibraryEvaluationCase_kind_status_idx" ON "LibraryEvaluationCase"("kind", "status");

-- CreateIndex
CREATE INDEX "LibraryEvaluationCase_createdBy_idx" ON "LibraryEvaluationCase"("createdBy");

-- CreateIndex
CREATE INDEX "LibraryEvaluationCase_reviewedBy_idx" ON "LibraryEvaluationCase"("reviewedBy");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEvaluationEvidence_evidenceUid_key" ON "LibraryEvaluationEvidence"("evidenceUid");

-- CreateIndex
CREATE INDEX "LibraryEvaluationEvidence_versionId_idx" ON "LibraryEvaluationEvidence"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEvaluationEvidence_caseId_versionId_evidenceUid_key" ON "LibraryEvaluationEvidence"("caseId", "versionId", "evidenceUid");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryProcessingJob_jobUid_key" ON "LibraryProcessingJob"("jobUid");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryProcessingJob_idempotencyKey_key" ON "LibraryProcessingJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LibraryProcessingJob_versionId_idx" ON "LibraryProcessingJob"("versionId");

-- CreateIndex
CREATE INDEX "LibraryProcessingJob_kind_status_idx" ON "LibraryProcessingJob"("kind", "status");

-- CreateIndex
CREATE INDEX "LibraryProcessingJob_status_priority_queuedAt_idx" ON "LibraryProcessingJob"("status", "priority", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryArtifact_artifactUid_key" ON "LibraryArtifact"("artifactUid");

-- CreateIndex
CREATE INDEX "LibraryArtifact_versionId_kind_status_idx" ON "LibraryArtifact"("versionId", "kind", "status");

-- CreateIndex
CREATE INDEX "LibraryArtifact_jobId_idx" ON "LibraryArtifact"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryArtifact_versionId_kind_checksumSha256_key" ON "LibraryArtifact"("versionId", "kind", "checksumSha256");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryContentChunk_chunkUid_key" ON "LibraryContentChunk"("chunkUid");

-- CreateIndex
CREATE INDEX "LibraryContentChunk_versionId_idx" ON "LibraryContentChunk"("versionId");

-- CreateIndex
CREATE INDEX "LibraryContentChunk_artifactId_idx" ON "LibraryContentChunk"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryContentChunk_versionId_ordinal_key" ON "LibraryContentChunk"("versionId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "LibrarySearchIndex_indexUid_key" ON "LibrarySearchIndex"("indexUid");

-- CreateIndex
CREATE INDEX "LibrarySearchIndex_kind_status_active_idx" ON "LibrarySearchIndex"("kind", "status", "active");

-- CreateIndex
CREATE INDEX "LibrarySearchIndex_artifactId_idx" ON "LibrarySearchIndex"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "LibrarySearchIndex_versionId_kind_generation_key" ON "LibrarySearchIndex"("versionId", "kind", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryExportJob_exportUid_key" ON "LibraryExportJob"("exportUid");

-- CreateIndex
CREATE INDEX "LibraryExportJob_requestedBy_createdAt_idx" ON "LibraryExportJob"("requestedBy", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryExportJob_status_createdAt_idx" ON "LibraryExportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryExportJob_expiresAt_idx" ON "LibraryExportJob"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocument_documentUid_key" ON "LibraryDocument"("documentUid");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocument_docId_key" ON "LibraryDocument"("docId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocument_stableKey_key" ON "LibraryDocument"("stableKey");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocument_currentVersionId_key" ON "LibraryDocument"("currentVersionId");

-- CreateIndex
CREATE INDEX "LibraryDocument_stableKey_idx" ON "LibraryDocument"("stableKey");

-- CreateIndex
CREATE INDEX "LibraryDocument_rootKey_idx" ON "LibraryDocument"("rootKey");

-- CreateIndex
CREATE INDEX "LibraryDocument_categoryCode_idx" ON "LibraryDocument"("categoryCode");

-- CreateIndex
CREATE INDEX "LibraryDocument_categoryId_idx" ON "LibraryDocument"("categoryId");

-- CreateIndex
CREATE INDEX "LibraryDocument_directoryPath_idx" ON "LibraryDocument"("directoryPath");

-- CreateIndex
CREATE INDEX "LibraryDocument_currentDirectoryId_idx" ON "LibraryDocument"("currentDirectoryId");

-- CreateIndex
CREATE INDEX "LibraryDocument_status_idx" ON "LibraryDocument"("status");

-- CreateIndex
CREATE INDEX "LibraryDocument_confidentialityLevel_idx" ON "LibraryDocument"("confidentialityLevel");

-- CreateIndex
CREATE INDEX "LibraryDocument_origin_idx" ON "LibraryDocument"("origin");

-- CreateIndex
CREATE INDEX "LibraryDocument_reviewStatus_idx" ON "LibraryDocument"("reviewStatus");

-- CreateIndex
CREATE INDEX "LibraryDocument_asOfDate_idx" ON "LibraryDocument"("asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocumentVersion_versionUid_key" ON "LibraryDocumentVersion"("versionUid");

-- CreateIndex
CREATE INDEX "LibraryDocumentVersion_documentId_idx" ON "LibraryDocumentVersion"("documentId");

-- CreateIndex
CREATE INDEX "LibraryDocumentVersion_versionNo_idx" ON "LibraryDocumentVersion"("versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocumentVersion_documentId_versionNo_key" ON "LibraryDocumentVersion"("documentId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCategory_categoryUid_key" ON "LibraryCategory"("categoryUid");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCategory_code_key" ON "LibraryCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCategory_fullPath_key" ON "LibraryCategory"("fullPath");

-- CreateIndex
CREATE INDEX "LibraryCategory_parentId_idx" ON "LibraryCategory"("parentId");

-- CreateIndex
CREATE INDEX "LibraryCategory_status_idx" ON "LibraryCategory"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDirectory_directoryUid_key" ON "LibraryDirectory"("directoryUid");

-- CreateIndex
CREATE INDEX "LibraryDirectory_status_idx" ON "LibraryDirectory"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDirectory_rootKey_relativePath_key" ON "LibraryDirectory"("rootKey", "relativePath");

-- CreateIndex
CREATE INDEX "DueDiligenceRequest_partyId_idx" ON "DueDiligenceRequest"("partyId");

-- CreateIndex
CREATE INDEX "DueDiligenceRequest_status_idx" ON "DueDiligenceRequest"("status");

-- CreateIndex
CREATE INDEX "DueDiligenceQuestion_requestId_idx" ON "DueDiligenceQuestion"("requestId");

-- CreateIndex
CREATE INDEX "DueDiligenceQuestion_status_idx" ON "DueDiligenceQuestion"("status");

-- CreateIndex
CREATE INDEX "DueDiligenceMaterialSelection_questionId_idx" ON "DueDiligenceMaterialSelection"("questionId");

-- CreateIndex
CREATE INDEX "DueDiligenceMaterialSelection_documentId_idx" ON "DueDiligenceMaterialSelection"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryGeneratedSource_key_key" ON "LibraryGeneratedSource"("key");

-- CreateIndex
CREATE INDEX "LibraryGeneratedSource_key_idx" ON "LibraryGeneratedSource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryTag_tagUid_key" ON "LibraryTag"("tagUid");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryTag_key_key" ON "LibraryTag"("key");

-- CreateIndex
CREATE INDEX "LibraryTag_status_idx" ON "LibraryTag"("status");

-- CreateIndex
CREATE INDEX "LibraryDocumentTag_tagId_idx" ON "LibraryDocumentTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocumentTag_documentId_tagId_key" ON "LibraryDocumentTag"("documentId", "tagId");

-- CreateIndex
CREATE INDEX "MutationImpactBatch_rootEntityType_rootEntityId_intent_stat_idx" ON "MutationImpactBatch"("rootEntityType", "rootEntityId", "intent", "status", "finishedAt");

-- CreateIndex
CREATE INDEX "MutationImpactBatch_actorUserId_startedAt_idx" ON "MutationImpactBatch"("actorUserId", "startedAt");

-- CreateIndex
CREATE INDEX "MutationImpactBatch_requestId_idx" ON "MutationImpactBatch"("requestId");

-- CreateIndex
CREATE INDEX "MutationImpactBatch_sourceBatchId_idx" ON "MutationImpactBatch"("sourceBatchId");

-- CreateIndex
CREATE INDEX "MutationImpactEffect_batchId_changedInBatch_sequence_idx" ON "MutationImpactEffect"("batchId", "changedInBatch", "sequence");

-- CreateIndex
CREATE INDEX "MutationImpactEffect_entityType_entityId_createdAt_idx" ON "MutationImpactEffect"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "MutationImpactEffect_relationKey_operation_createdAt_idx" ON "MutationImpactEffect"("relationKey", "operation", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MutationImpactEffect_batchId_sequence_key" ON "MutationImpactEffect"("batchId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "OpenApiClient_keyHash_key" ON "OpenApiClient"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "OpenApiResource_key_key" ON "OpenApiResource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "OpenApiScope_key_key" ON "OpenApiScope"("key");

-- CreateIndex
CREATE INDEX "OpenApiScope_resourceId_idx" ON "OpenApiScope"("resourceId");

-- CreateIndex
CREATE INDEX "OpenApiClientScopeGrant_scopeId_idx" ON "OpenApiClientScopeGrant"("scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenApiClientScopeGrant_clientId_scopeId_action_key" ON "OpenApiClientScopeGrant"("clientId", "scopeId", "action");

-- CreateIndex
CREATE INDEX "OpenApiAccessLog_clientId_idx" ON "OpenApiAccessLog"("clientId");

-- CreateIndex
CREATE INDEX "OpenApiAccessLog_scopeKey_idx" ON "OpenApiAccessLog"("scopeKey");

-- CreateIndex
CREATE INDEX "OpenApiAccessLog_createdAt_idx" ON "OpenApiAccessLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_identityKey_key" ON "Product"("identityKey");

-- CreateIndex
CREATE INDEX "Product_status_name_idx" ON "Product"("status", "name");

-- CreateIndex
CREATE INDEX "ProductSourceMapping_productId_status_idx" ON "ProductSourceMapping"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductSourceMapping_productSkuId_status_idx" ON "ProductSourceMapping"("productSkuId", "status");

-- CreateIndex
CREATE INDEX "ProductSourceMapping_sourceSystem_normalizedName_normalized_idx" ON "ProductSourceMapping"("sourceSystem", "normalizedName", "normalizedSpecification");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSourceMapping_sourceSystem_sourceKey_key" ON "ProductSourceMapping"("sourceSystem", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionQcBatch_recordUid_key" ON "ProductionQcBatch"("recordUid");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionQcBatch_legacyFileId_key" ON "ProductionQcBatch"("legacyFileId");

-- CreateIndex
CREATE INDEX "ProductionQcBatch_productId_batchNumber_idx" ON "ProductionQcBatch"("productId", "batchNumber");

-- CreateIndex
CREATE INDEX "ProductionQcBatch_productKey_batchNumber_idx" ON "ProductionQcBatch"("productKey", "batchNumber");

-- CreateIndex
CREATE INDEX "ProductionQcBatch_createdAt_idx" ON "ProductionQcBatch"("createdAt");

-- CreateIndex
CREATE INDEX "ProductionQcFieldValue_fieldKey_idx" ON "ProductionQcFieldValue"("fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionQcFieldValue_batchId_fieldKey_key" ON "ProductionQcFieldValue"("batchId", "fieldKey");

-- CreateIndex
CREATE INDEX "ProductionQcSignature_batchId_fieldKey_signedAt_idx" ON "ProductionQcSignature"("batchId", "fieldKey", "signedAt");

-- CreateIndex
CREATE INDEX "ProductionQcSignature_signerUserId_signedAt_idx" ON "ProductionQcSignature"("signerUserId", "signedAt");

-- CreateIndex
CREATE INDEX "ProductionQcAuditEvent_batchRecordUid_createdAt_idx" ON "ProductionQcAuditEvent"("batchRecordUid", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionQcAuditEvent_batchId_createdAt_idx" ON "ProductionQcAuditEvent"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionQcAuditEvent_actorUserId_createdAt_idx" ON "ProductionQcAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "DepartmentCollaboration_responsibleDepartmentId_status_isAr_idx" ON "DepartmentCollaboration"("responsibleDepartmentId", "status", "isArchived");

-- CreateIndex
CREATE INDEX "DepartmentCollaboration_createdByUserId_idx" ON "DepartmentCollaboration"("createdByUserId");

-- CreateIndex
CREATE INDEX "DepartmentCollaborationDepartment_departmentId_responseStat_idx" ON "DepartmentCollaborationDepartment"("departmentId", "responseStatus");

-- CreateIndex
CREATE INDEX "DepartmentCollaborationDepartment_respondedByUserId_idx" ON "DepartmentCollaborationDepartment"("respondedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentCollaborationDepartment_collaborationId_departmen_key" ON "DepartmentCollaborationDepartment"("collaborationId", "departmentId");

-- CreateIndex
CREATE INDEX "DepartmentCollaborationPosition_positionId_kind_idx" ON "DepartmentCollaborationPosition"("positionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentCollaborationPosition_collaborationId_kind_positi_key" ON "DepartmentCollaborationPosition"("collaborationId", "kind", "positionId");

-- CreateIndex
CREATE INDEX "WorkKpiDefinition_status_ownerDepartmentId_idx" ON "WorkKpiDefinition"("status", "ownerDepartmentId");

-- CreateIndex
CREATE INDEX "WorkKpiDefinition_ownerDepartmentId_name_idx" ON "WorkKpiDefinition"("ownerDepartmentId", "name");

-- CreateIndex
CREATE INDEX "WorkKpiDefinition_createdByUserId_idx" ON "WorkKpiDefinition"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkKpiDefinition_code_version_key" ON "WorkKpiDefinition"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkKpiAssignment_workItemId_key" ON "WorkKpiAssignment"("workItemId");

-- CreateIndex
CREATE INDEX "WorkKpiAssignment_workPlanId_ownerEmployeeId_idx" ON "WorkKpiAssignment"("workPlanId", "ownerEmployeeId");

-- CreateIndex
CREATE INDEX "WorkKpiAssignment_definitionId_idx" ON "WorkKpiAssignment"("definitionId");

-- CreateIndex
CREATE INDEX "WorkKpiAssignment_ownerEmployeeId_idx" ON "WorkKpiAssignment"("ownerEmployeeId");

-- CreateIndex
CREATE INDEX "WorkKpiAssignment_sourceAssignmentId_idx" ON "WorkKpiAssignment"("sourceAssignmentId");

-- CreateIndex
CREATE INDEX "WorkKpiAssignment_updatedByUserId_idx" ON "WorkKpiAssignment"("updatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkKpiAssignment_workPlanId_definitionId_key" ON "WorkKpiAssignment"("workPlanId", "definitionId");

-- CreateIndex
CREATE INDEX "WorkKpiResultSnapshot_workReportId_idx" ON "WorkKpiResultSnapshot"("workReportId");

-- CreateIndex
CREATE INDEX "WorkKpiResultSnapshot_previousSnapshotId_idx" ON "WorkKpiResultSnapshot"("previousSnapshotId");

-- CreateIndex
CREATE INDEX "WorkKpiResultSnapshot_approvedByUserId_approvedAt_idx" ON "WorkKpiResultSnapshot"("approvedByUserId", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkKpiResultSnapshot_assignmentId_version_key" ON "WorkKpiResultSnapshot"("assignmentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingType_key_key" ON "MeetingType"("key");

-- CreateIndex
CREATE INDEX "MeetingSeries_typeId_idx" ON "MeetingSeries"("typeId");

-- CreateIndex
CREATE INDEX "Meeting_typeId_startAt_idx" ON "Meeting"("typeId", "startAt");

-- CreateIndex
CREATE INDEX "Meeting_seriesId_startAt_idx" ON "Meeting"("seriesId", "startAt");

-- CreateIndex
CREATE INDEX "Meeting_ownerUserId_idx" ON "Meeting"("ownerUserId");

-- CreateIndex
CREATE INDEX "Meeting_secretaryUserId_idx" ON "Meeting"("secretaryUserId");

-- CreateIndex
CREATE INDEX "Meeting_status_idx" ON "Meeting"("status");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_role_idx" ON "MeetingParticipant"("meetingId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_meetingId_sortOrder_idx" ON "MeetingAgendaItem"("meetingId", "sortOrder");

-- CreateIndex
CREATE INDEX "MeetingMinuteEntry_meetingId_agendaItemId_idx" ON "MeetingMinuteEntry"("meetingId", "agendaItemId");

-- CreateIndex
CREATE INDEX "MeetingProposal_meetingId_status_idx" ON "MeetingProposal"("meetingId", "status");

-- CreateIndex
CREATE INDEX "MeetingProposal_agendaItemId_idx" ON "MeetingProposal"("agendaItemId");

-- CreateIndex
CREATE INDEX "MeetingVote_voterUserId_idx" ON "MeetingVote"("voterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingVote_proposalId_voterUserId_key" ON "MeetingVote"("proposalId", "voterUserId");

-- CreateIndex
CREATE INDEX "MeetingDecision_meetingId_kind_idx" ON "MeetingDecision"("meetingId", "kind");

-- CreateIndex
CREATE INDEX "MeetingDecision_proposalId_idx" ON "MeetingDecision"("proposalId");

-- CreateIndex
CREATE INDEX "MeetingActionCandidate_meetingId_status_idx" ON "MeetingActionCandidate"("meetingId", "status");

-- CreateIndex
CREATE INDEX "MeetingActionCandidate_decisionId_idx" ON "MeetingActionCandidate"("decisionId");

-- CreateIndex
CREATE INDEX "MeetingActionCandidate_linkedWorkItemId_idx" ON "MeetingActionCandidate"("linkedWorkItemId");

-- CreateIndex
CREATE INDEX "MeetingActionCandidate_linkedWorkPlanId_idx" ON "MeetingActionCandidate"("linkedWorkPlanId");

-- CreateIndex
CREATE INDEX "WorkPlanAlignment_childPlanId_relationKind_sortOrder_idx" ON "WorkPlanAlignment"("childPlanId", "relationKind", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkPlanAlignment_sourceType_sourcePlanId_idx" ON "WorkPlanAlignment"("sourceType", "sourcePlanId");

-- CreateIndex
CREATE INDEX "WorkPlanAlignment_sourceType_sourceWorkItemId_idx" ON "WorkPlanAlignment"("sourceType", "sourceWorkItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOkrCycle_code_key" ON "WorkOkrCycle"("code");

-- CreateIndex
CREATE INDEX "WorkOkrCycle_periodType_year_sequence_idx" ON "WorkOkrCycle"("periodType", "year", "sequence");

-- CreateIndex
CREATE INDEX "WorkOkrCycle_parentId_idx" ON "WorkOkrCycle"("parentId");

-- CreateIndex
CREATE INDEX "WorkOkrCycle_startDate_endDate_idx" ON "WorkOkrCycle"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "WorkOkrControlPolicy_scopeType_scopeId_idx" ON "WorkOkrControlPolicy"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "WorkOkrControlPolicy_krReviewOpensAt_idx" ON "WorkOkrControlPolicy"("krReviewOpensAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOkrControlPolicy_cycleId_scopeType_scopeId_key" ON "WorkOkrControlPolicy"("cycleId", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOkrControlRevision_version_key" ON "WorkOkrControlRevision"("version");

-- CreateIndex
CREATE INDEX "WorkOkrControlRevision_createdAt_idx" ON "WorkOkrControlRevision"("createdAt");

-- CreateIndex
CREATE INDEX "WorkOkrControlPolicyRevision_cycleId_scopeType_scopeId_vers_idx" ON "WorkOkrControlPolicyRevision"("cycleId", "scopeType", "scopeId", "version");

-- CreateIndex
CREATE INDEX "WorkOkrControlPolicyRevision_policyId_version_idx" ON "WorkOkrControlPolicyRevision"("policyId", "version");

-- CreateIndex
CREATE INDEX "WorkPlanGovernanceEvent_workPlanId_createdAt_idx" ON "WorkPlanGovernanceEvent"("workPlanId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkPlanGovernanceEvent_actorUserId_createdAt_idx" ON "WorkPlanGovernanceEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_leadingDepartmentId_idx" ON "Project"("leadingDepartmentId");

-- CreateIndex
CREATE INDEX "Project_workspaceEnabled_idx" ON "Project"("workspaceEnabled");

-- CreateIndex
CREATE INDEX "Project_projectType_idx" ON "Project"("projectType");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "ProjectEnablingDepartment_departmentId_idx" ON "ProjectEnablingDepartment"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEnablingDepartment_projectId_departmentId_key" ON "ProjectEnablingDepartment"("projectId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProject_employeeId_projectId_key" ON "EmployeeProject"("employeeId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectPlanPhase_projectId_sequenceNo_idx" ON "ProjectPlanPhase"("projectId", "sequenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPlanPhase_projectId_sequenceNo_key" ON "ProjectPlanPhase"("projectId", "sequenceNo");

-- CreateIndex
CREATE INDEX "ProjectPlanDependency_projectId_successorKind_successorId_idx" ON "ProjectPlanDependency"("projectId", "successorKind", "successorId");

-- CreateIndex
CREATE INDEX "ProjectPlanDependency_projectId_predecessorKind_predecessor_idx" ON "ProjectPlanDependency"("projectId", "predecessorKind", "predecessorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPlanDependency_projectId_predecessorKind_predecessor_key" ON "ProjectPlanDependency"("projectId", "predecessorKind", "predecessorId", "successorKind", "successorId");

-- CreateIndex
CREATE INDEX "ProjectPlanBaseline_projectId_isActive_idx" ON "ProjectPlanBaseline"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "ProjectPlanBaselineItem_baselineId_phaseId_idx" ON "ProjectPlanBaselineItem"("baselineId", "phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPlanBaselineItem_baselineId_itemKind_itemId_key" ON "ProjectPlanBaselineItem"("baselineId", "itemKind", "itemId");

-- CreateIndex
CREATE INDEX "WorkReport_submittedBy_idx" ON "WorkReport"("submittedBy");

-- CreateIndex
CREATE UNIQUE INDEX "WorkReport_targetType_targetId_periodType_periodStart_repor_key" ON "WorkReport"("targetType", "targetId", "periodType", "periodStart", "reportStage");

-- CreateIndex
CREATE INDEX "WorkReportItem_reportId_idx" ON "WorkReportItem"("reportId");

-- CreateIndex
CREATE INDEX "WorkReportItem_workPlanId_idx" ON "WorkReportItem"("workPlanId");

-- CreateIndex
CREATE INDEX "WorkReportItem_workItemId_idx" ON "WorkReportItem"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionResponsibilityNode_nodeKey_key" ON "PositionResponsibilityNode"("nodeKey");

-- CreateIndex
CREATE INDEX "PositionResponsibilityNode_positionDescriptionId_nodeType_i_idx" ON "PositionResponsibilityNode"("positionDescriptionId", "nodeType", "isActive");

-- CreateIndex
CREATE INDEX "PositionResponsibilityNode_positionDescriptionId_parentId_s_idx" ON "PositionResponsibilityNode"("positionDescriptionId", "parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "PositionResponsibilityNode_sourceHash_idx" ON "PositionResponsibilityNode"("sourceHash");

-- CreateIndex
CREATE INDEX "WorkResponsibilityReference_targetKind_referenceRole_idx" ON "WorkResponsibilityReference"("targetKind", "referenceRole");

-- CreateIndex
CREATE INDEX "WorkResponsibilityReference_workItemId_referenceRole_idx" ON "WorkResponsibilityReference"("workItemId", "referenceRole");

-- CreateIndex
CREATE INDEX "WorkResponsibilityReference_lockedEmployeeId_idx" ON "WorkResponsibilityReference"("lockedEmployeeId");

-- CreateIndex
CREATE INDEX "WorkResponsibilityReference_positionDescriptionId_idx" ON "WorkResponsibilityReference"("positionDescriptionId");

-- CreateIndex
CREATE INDEX "WorkResponsibilityReference_responsibilityNodeId_idx" ON "WorkResponsibilityReference"("responsibilityNodeId");

-- CreateIndex
CREATE INDEX "WorkPlan_targetType_targetId_kind_status_isArchived_idx" ON "WorkPlan"("targetType", "targetId", "kind", "status", "isArchived");

-- CreateIndex
CREATE INDEX "WorkPlan_targetType_targetId_okrStage_idx" ON "WorkPlan"("targetType", "targetId", "okrStage");

-- CreateIndex
CREATE INDEX "WorkPlan_krReviewOpensAt_okrStage_idx" ON "WorkPlan"("krReviewOpensAt", "okrStage");

-- CreateIndex
CREATE INDEX "WorkPlan_targetType_targetId_periodType_actualStartDate_idx" ON "WorkPlan"("targetType", "targetId", "periodType", "actualStartDate");

-- CreateIndex
CREATE INDEX "WorkPlan_targetType_targetId_plannedStartDate_plannedEndDat_idx" ON "WorkPlan"("targetType", "targetId", "plannedStartDate", "plannedEndDate");

-- CreateIndex
CREATE INDEX "WorkPlan_okrCycleId_idx" ON "WorkPlan"("okrCycleId");

-- CreateIndex
CREATE INDEX "WorkPlan_sourcePlanId_idx" ON "WorkPlan"("sourcePlanId");

-- CreateIndex
CREATE INDEX "WorkPlan_parentPeriodPlanId_idx" ON "WorkPlan"("parentPeriodPlanId");

-- CreateIndex
CREATE INDEX "WorkPlan_previousPeriodPlanId_idx" ON "WorkPlan"("previousPeriodPlanId");

-- CreateIndex
CREATE INDEX "WorkPlan_okrControlScopeType_okrControlScopeId_idx" ON "WorkPlan"("okrControlScopeType", "okrControlScopeId");

-- CreateIndex
CREATE INDEX "WorkPlan_governanceMode_governanceBindingSource_idx" ON "WorkPlan"("governanceMode", "governanceBindingSource");

-- CreateIndex
CREATE INDEX "WorkPlan_sourceType_linkedProjectId_linkedProjectPhaseId_idx" ON "WorkPlan"("sourceType", "linkedProjectId", "linkedProjectPhaseId");

-- CreateIndex
CREATE INDEX "WorkPlan_targetType_targetId_isMilestone_milestoneDate_idx" ON "WorkPlan"("targetType", "targetId", "isMilestone", "milestoneDate");

-- CreateIndex
CREATE INDEX "WorkPlan_ownerEmployeeId_idx" ON "WorkPlan"("ownerEmployeeId");

-- CreateIndex
CREATE INDEX "WorkPlan_collaborationId_idx" ON "WorkPlan"("collaborationId");

-- CreateIndex
CREATE INDEX "WorkPlan_linkedProjectId_idx" ON "WorkPlan"("linkedProjectId");

-- CreateIndex
CREATE INDEX "WorkPlan_linkedProjectPhaseId_idx" ON "WorkPlan"("linkedProjectPhaseId");

-- CreateIndex
CREATE INDEX "WorkPlan_sourceMeetingId_idx" ON "WorkPlan"("sourceMeetingId");

-- CreateIndex
CREATE INDEX "WorkPlan_sourceMeetingDecisionId_idx" ON "WorkPlan"("sourceMeetingDecisionId");

-- CreateIndex
CREATE INDEX "WorkPlan_sourceMeetingActionCandidateId_idx" ON "WorkPlan"("sourceMeetingActionCandidateId");

-- CreateIndex
CREATE INDEX "WorkPlan_sourceDepartmentId_idx" ON "WorkPlan"("sourceDepartmentId");

-- CreateIndex
CREATE INDEX "WorkItem_planId_parentWorkItemId_itemType_idx" ON "WorkItem"("planId", "parentWorkItemId", "itemType");

-- CreateIndex
CREATE INDEX "WorkItem_planId_itemType_isArchived_idx" ON "WorkItem"("planId", "itemType", "isArchived");

-- CreateIndex
CREATE INDEX "WorkItem_targetType_targetId_category_idx" ON "WorkItem"("targetType", "targetId", "category");

-- CreateIndex
CREATE INDEX "WorkItem_targetType_targetId_periodType_periodStart_idx" ON "WorkItem"("targetType", "targetId", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "WorkItem_targetType_targetId_plannedStartDate_plannedEndDat_idx" ON "WorkItem"("targetType", "targetId", "plannedStartDate", "plannedEndDate");

-- CreateIndex
CREATE INDEX "WorkItem_targetType_targetId_isMilestone_milestoneDate_idx" ON "WorkItem"("targetType", "targetId", "isMilestone", "milestoneDate");

-- CreateIndex
CREATE INDEX "WorkItem_targetType_targetId_parentWorkItemId_itemType_idx" ON "WorkItem"("targetType", "targetId", "parentWorkItemId", "itemType");

-- CreateIndex
CREATE INDEX "WorkItem_targetType_targetId_itemType_isArchived_idx" ON "WorkItem"("targetType", "targetId", "itemType", "isArchived");

-- CreateIndex
CREATE INDEX "WorkItem_sourceType_linkedProjectId_linkedProjectPhaseId_idx" ON "WorkItem"("sourceType", "linkedProjectId", "linkedProjectPhaseId");

-- CreateIndex
CREATE INDEX "WorkItem_ownerEmployeeId_idx" ON "WorkItem"("ownerEmployeeId");

-- CreateIndex
CREATE INDEX "WorkItem_collaborationId_idx" ON "WorkItem"("collaborationId");

-- CreateIndex
CREATE INDEX "WorkItem_status_idx" ON "WorkItem"("status");

-- CreateIndex
CREATE INDEX "WorkItem_linkedProjectId_idx" ON "WorkItem"("linkedProjectId");

-- CreateIndex
CREATE INDEX "WorkItem_linkedProjectPhaseId_idx" ON "WorkItem"("linkedProjectPhaseId");

-- CreateIndex
CREATE INDEX "WorkItem_sourceMeetingId_idx" ON "WorkItem"("sourceMeetingId");

-- CreateIndex
CREATE INDEX "WorkItem_sourceMeetingDecisionId_idx" ON "WorkItem"("sourceMeetingDecisionId");

-- CreateIndex
CREATE INDEX "WorkItem_sourceMeetingActionCandidateId_idx" ON "WorkItem"("sourceMeetingActionCandidateId");

-- CreateIndex
CREATE INDEX "WorkItem_sourceDepartmentId_idx" ON "WorkItem"("sourceDepartmentId");

-- CreateIndex
CREATE INDEX "WorkItem_parentWorkItemId_idx" ON "WorkItem"("parentWorkItemId");

-- CreateIndex
CREATE INDEX "WorkItem_parentPeriodWorkItemId_idx" ON "WorkItem"("parentPeriodWorkItemId");

-- CreateIndex
CREATE INDEX "WorkItem_previousPeriodWorkItemId_idx" ON "WorkItem"("previousPeriodWorkItemId");

-- CreateIndex
CREATE INDEX "WorkKrEvidence_krWorkItemId_sortOrder_idx" ON "WorkKrEvidence"("krWorkItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkKrEvidence_taskWorkItemId_idx" ON "WorkKrEvidence"("taskWorkItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkKrEvidence_krWorkItemId_taskWorkItemId_key" ON "WorkKrEvidence"("krWorkItemId", "taskWorkItemId");

-- CreateIndex
CREATE INDEX "WorkParticipant_workItemId_idx" ON "WorkParticipant"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentWorkAssignee_departmentId_userId_kind_key" ON "DepartmentWorkAssignee"("departmentId", "userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkAssignee_projectId_userId_kind_key" ON "ProjectWorkAssignee"("projectId", "userId", "kind");

-- CreateIndex
CREATE INDEX "WorkspaceAnalysisTemplate_scope_status_sort_idx" ON "WorkspaceAnalysisTemplate"("scopeType", "scopeId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceAnalysisTemplate_scopeType_scopeId_name_key" ON "WorkspaceAnalysisTemplate"("scopeType", "scopeId", "name");

-- CreateIndex
CREATE INDEX "WorkspaceAnalysisTemplateRevision_templateId_createdAt_idx" ON "WorkspaceAnalysisTemplateRevision"("templateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceAnalysisTemplateRevision_templateId_revision_key" ON "WorkspaceAnalysisTemplateRevision"("templateId", "revision");

-- AddForeignKey
ALTER TABLE "ErpDueDiligenceSubmission" ADD CONSTRAINT "ErpDueDiligenceSubmission_respondentUserId_fkey" FOREIGN KEY ("respondentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpDueDiligenceSubmission" ADD CONSTRAINT "ErpDueDiligenceSubmission_positionAssignmentId_fkey" FOREIGN KEY ("positionAssignmentId") REFERENCES "EmployeePosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpDueDiligenceEvidenceAttachment" ADD CONSTRAINT "ErpDueDiligenceEvidenceAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ErpDueDiligenceSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRuntimeBinding" ADD CONSTRAINT "AgentRuntimeBinding_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_runtimeBindingId_fkey" FOREIGN KEY ("runtimeBindingId") REFERENCES "AgentRuntimeBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_submitterUserId_fkey" FOREIGN KEY ("submitterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResourceActionGrant" ADD CONSTRAINT "UserResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResourceActionGrant" ADD CONSTRAINT "UserResourceActionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionResourceActionGrant" ADD CONSTRAINT "PositionResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionResourceActionGrant" ADD CONSTRAINT "PositionResourceActionGrant_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentResourceActionGrant" ADD CONSTRAINT "DepartmentResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentResourceActionGrant" ADD CONSTRAINT "DepartmentResourceActionGrant_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGrantLedgerEvent" ADD CONSTRAINT "PermissionGrantLedgerEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGrantLedgerEvent" ADD CONSTRAINT "PermissionGrantLedgerEvent_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipInterest" ADD CONSTRAINT "OwnershipInterest_ownerPartyId_fkey" FOREIGN KEY ("ownerPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipInterest" ADD CONSTRAINT "OwnershipInterest_issuerCompanyId_fkey" FOREIGN KEY ("issuerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRegistryChange" ADD CONSTRAINT "CompanyRegistryChange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRegistryOwnershipParticipant" ADD CONSTRAINT "CompanyRegistryOwnershipParticipant_registryChangeId_fkey" FOREIGN KEY ("registryChangeId") REFERENCES "CompanyRegistryChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRegistryOwnershipParticipant" ADD CONSTRAINT "CompanyRegistryOwnershipParticipant_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_issuerCompanyId_fkey" FOREIGN KEY ("issuerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_consolidatedByPartyIdAfter_fkey" FOREIGN KEY ("consolidatedByPartyIdAfter") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_supersedesEventId_fkey" FOREIGN KEY ("supersedesEventId") REFERENCES "ShareCapitalEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCapitalTransaction" ADD CONSTRAINT "ShareCapitalTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ShareCapitalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCapitalTransaction" ADD CONSTRAINT "ShareCapitalTransaction_fromPartyId_fkey" FOREIGN KEY ("fromPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCapitalTransaction" ADD CONSTRAINT "ShareCapitalTransaction_toPartyId_fkey" FOREIGN KEY ("toPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCapitalSnapshotPosition" ADD CONSTRAINT "ShareCapitalSnapshotPosition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ShareCapitalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCapitalSnapshotPosition" ADD CONSTRAINT "ShareCapitalSnapshotPosition_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderGroup" ADD CONSTRAINT "ShareholderGroup_issuerCompanyId_fkey" FOREIGN KEY ("issuerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderGroupMembership" ADD CONSTRAINT "ShareholderGroupMembership_shareholderGroupId_fkey" FOREIGN KEY ("shareholderGroupId") REFERENCES "ShareholderGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderGroupMembership" ADD CONSTRAINT "ShareholderGroupMembership_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_handlerEmployeeId_fkey" FOREIGN KEY ("handlerEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityRun" ADD CONSTRAINT "DataQualityRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityCheckState" ADD CONSTRAINT "DataQualityCheckState_lastRunId_fkey" FOREIGN KEY ("lastRunId") REFERENCES "DataQualityRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityFinding" ADD CONSTRAINT "DataQualityFinding_checkKey_fkey" FOREIGN KEY ("checkKey") REFERENCES "DataQualityCheckState"("checkKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityFinding" ADD CONSTRAINT "DataQualityFinding_lastRunId_fkey" FOREIGN KEY ("lastRunId") REFERENCES "DataQualityRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityNotificationDelivery" ADD CONSTRAINT "DataQualityNotificationDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DataQualityRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityEvaluationRequest" ADD CONSTRAINT "DataQualityEvaluationRequest_processedByRunId_fkey" FOREIGN KEY ("processedByRunId") REFERENCES "DataQualityRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DocumentTemplateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyNameHistory" ADD CONSTRAINT "PartyNameHistory_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPartyProfile" ADD CONSTRAINT "ExternalPartyProfile_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPartyRole" ADD CONSTRAINT "ExternalPartyRole_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPartySourceMapping" ADD CONSTRAINT "ExternalPartySourceMapping_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ExternalPartyRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPartySourceMapping" ADD CONSTRAINT "ExternalPartySourceMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetCostLine" ADD CONSTRAINT "FinanceAssetCostLine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetExpenseAllocation" ADD CONSTRAINT "FinanceAssetExpenseAllocation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetPeriodEntry" ADD CONSTRAINT "FinanceAssetPeriodEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetPeriodEntry" ADD CONSTRAINT "FinanceAssetPeriodEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetPeriodEntry" ADD CONSTRAINT "FinanceAssetPeriodEntry_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetAdjustment" ADD CONSTRAINT "FinanceAssetAdjustment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetAdjustment" ADD CONSTRAINT "FinanceAssetAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetAdjustment" ADD CONSTRAINT "FinanceAssetAdjustment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetDept" ADD CONSTRAINT "FinanceBudgetDept_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FinanceBudgetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetDept" ADD CONSTRAINT "FinanceBudgetDept_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetRd" ADD CONSTRAINT "FinanceBudgetRd_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FinanceBudgetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetRd" ADD CONSTRAINT "FinanceBudgetRd_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowItem" ADD CONSTRAINT "FinanceCashFlowItem_latestImportId_fkey" FOREIGN KEY ("latestImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowItem" ADD CONSTRAINT "FinanceCashFlowItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinanceCashFlowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_cashFlowItemId_fkey" FOREIGN KEY ("cashFlowItemId") REFERENCES "FinanceCashFlowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_ownerVoucherItemId_fkey" FOREIGN KEY ("ownerVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_counterpartItemId_fkey" FOREIGN KEY ("counterpartItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocationAdjustment" ADD CONSTRAINT "FinanceCashFlowAllocationAdjustment_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "FinanceCashFlowAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_entitySnapshotId_fkey" FOREIGN KEY ("entitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_counterpartyEntitySnapshotId_fkey" FOREIGN KEY ("counterpartyEntitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "FinanceConsolidationSourceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceAuxiliaryBalanceId_fkey" FOREIGN KEY ("sourceAuxiliaryBalanceId") REFERENCES "FinanceAuxiliaryBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceOpenItemId_fkey" FOREIGN KEY ("sourceOpenItemId") REFERENCES "FinanceOpenItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceCashFlowAllocationId_fkey" FOREIGN KEY ("sourceCashFlowAllocationId") REFERENCES "FinanceCashFlowAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceVoucherItemId_fkey" FOREIGN KEY ("sourceVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationMatchGroup" ADD CONSTRAINT "FinanceConsolidationMatchGroup_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationMatchGroup" ADD CONSTRAINT "FinanceConsolidationMatchGroup_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationMatchGroup" ADD CONSTRAINT "FinanceConsolidationMatchGroup_leftEntitySnapshotId_fkey" FOREIGN KEY ("leftEntitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationMatchGroup" ADD CONSTRAINT "FinanceConsolidationMatchGroup_rightEntitySnapshotId_fkey" FOREIGN KEY ("rightEntitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationMatchSource" ADD CONSTRAINT "FinanceConsolidationMatchSource_matchGroupId_fkey" FOREIGN KEY ("matchGroupId") REFERENCES "FinanceConsolidationMatchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationMatchSource" ADD CONSTRAINT "FinanceConsolidationMatchSource_entitySnapshotId_fkey" FOREIGN KEY ("entitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationMatchSource" ADD CONSTRAINT "FinanceConsolidationMatchSource_counterpartyEntitySnapshot_fkey" FOREIGN KEY ("counterpartyEntitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationMatchSource" ADD CONSTRAINT "FinanceConsolidationMatchSource_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherCompanyMappingRule" ADD CONSTRAINT "FinanceVoucherCompanyMappingRule_linkedCompanyId_fkey" FOREIGN KEY ("linkedCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationOutputSnapshot" ADD CONSTRAINT "FinanceConsolidationOutputSnapshot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationBatch" ADD CONSTRAINT "FinanceConsolidationBatch_baseBatchId_fkey" FOREIGN KEY ("baseBatchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCompanyCurrencyPolicy" ADD CONSTRAINT "FinanceCompanyCurrencyPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationBatchEvent" ADD CONSTRAINT "FinanceConsolidationBatchEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationControlDecision" ADD CONSTRAINT "FinanceConsolidationControlDecision_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntitySnapshot" ADD CONSTRAINT "FinanceConsolidationEntitySnapshot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationSourceSnapshot" ADD CONSTRAINT "FinanceConsolidationSourceSnapshot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationSourceSnapshot" ADD CONSTRAINT "FinanceConsolidationSourceSnapshot_entitySnapshotId_fkey" FOREIGN KEY ("entitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationRateSnapshot" ADD CONSTRAINT "FinanceConsolidationRateSnapshot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntry" ADD CONSTRAINT "FinanceConsolidationEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntry" ADD CONSTRAINT "FinanceConsolidationEntry_supersedesEntryId_fkey" FOREIGN KEY ("supersedesEntryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntry" ADD CONSTRAINT "FinanceConsolidationEntry_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntry" ADD CONSTRAINT "FinanceConsolidationEntry_predecessorEntryId_fkey" FOREIGN KEY ("predecessorEntryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationTaxEffect" ADD CONSTRAINT "FinanceConsolidationTaxEffect_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationTaxEffect" ADD CONSTRAINT "FinanceConsolidationTaxEffect_entitySnapshotId_fkey" FOREIGN KEY ("entitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ExternalPartyRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSalesSalary" ADD CONSTRAINT "FinanceSalesSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSalesSalary" ADD CONSTRAINT "FinanceSalesSalary_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostStructureRow" ADD CONSTRAINT "FinanceCostStructureRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostStructureRow" ADD CONSTRAINT "FinanceCostStructureRow_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostStructureRow" ADD CONSTRAINT "FinanceCostStructureRow_receiptReportId_fkey" FOREIGN KEY ("receiptReportId") REFERENCES "InventoryReceiptReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAnalysisRow" ADD CONSTRAINT "FinanceCostAnalysisRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceWorkshopReport" ADD CONSTRAINT "FinanceWorkshopReport_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceWorkshopReport" ADD CONSTRAINT "FinanceWorkshopReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceWorkshopReport" ADD CONSTRAINT "FinanceWorkshopReport_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryMember" ADD CONSTRAINT "FinanceAuxiliaryMember_latestImportId_fkey" FOREIGN KEY ("latestImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryMember" ADD CONSTRAINT "FinanceAuxiliaryMember_linkedCompanyId_fkey" FOREIGN KEY ("linkedCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCounterpartyClassification" ADD CONSTRAINT "FinanceCounterpartyClassification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FinanceAuxiliaryMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCounterpartyClassification" ADD CONSTRAINT "FinanceCounterpartyClassification_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItemAuxiliary" ADD CONSTRAINT "FinanceVoucherItemAuxiliary_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItemAuxiliary" ADD CONSTRAINT "FinanceVoucherItemAuxiliary_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FinanceAuxiliaryMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalance" ADD CONSTRAINT "FinanceAuxiliaryBalance_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalance" ADD CONSTRAINT "FinanceAuxiliaryBalance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalance" ADD CONSTRAINT "FinanceAuxiliaryBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalanceMember" ADD CONSTRAINT "FinanceAuxiliaryBalanceMember_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "FinanceAuxiliaryBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalanceMember" ADD CONSTRAINT "FinanceAuxiliaryBalanceMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FinanceAuxiliaryMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItemSettlement" ADD CONSTRAINT "FinanceOpenItemSettlement_openItemId_fkey" FOREIGN KEY ("openItemId") REFERENCES "FinanceOpenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItemAuxiliary" ADD CONSTRAINT "FinanceOpenItemAuxiliary_openItemId_fkey" FOREIGN KEY ("openItemId") REFERENCES "FinanceOpenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItemAuxiliary" ADD CONSTRAINT "FinanceOpenItemAuxiliary_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FinanceAuxiliaryMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceGroupAccount" ADD CONSTRAINT "FinanceGroupAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinanceGroupAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceGroupAccountRevision" ADD CONSTRAINT "FinanceGroupAccountRevision_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "FinanceAccountingPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceGroupAccountRevision" ADD CONSTRAINT "FinanceGroupAccountRevision_groupAccountId_fkey" FOREIGN KEY ("groupAccountId") REFERENCES "FinanceGroupAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceGroupAccountRevision" ADD CONSTRAINT "FinanceGroupAccountRevision_parentGroupAccountId_fkey" FOREIGN KEY ("parentGroupAccountId") REFERENCES "FinanceGroupAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceGroupAccountMapping" ADD CONSTRAINT "FinanceGroupAccountMapping_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "FinanceAccountingPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceGroupAccountMapping" ADD CONSTRAINT "FinanceGroupAccountMapping_groupAccountId_fkey" FOREIGN KEY ("groupAccountId") REFERENCES "FinanceGroupAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReadableImportRun" ADD CONSTRAINT "FinanceReadableImportRun_ledgerImportId_fkey" FOREIGN KEY ("ledgerImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReadableImportRun" ADD CONSTRAINT "FinanceReadableImportRun_sourcePackageId_fkey" FOREIGN KEY ("sourcePackageId") REFERENCES "FinanceReadableSourcePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountAuxiliaryRequirement" ADD CONSTRAINT "FinanceAccountAuxiliaryRequirement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountAuxiliaryRequirement" ADD CONSTRAINT "FinanceAccountAuxiliaryRequirement_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourcePeriodStatus" ADD CONSTRAINT "FinanceSourcePeriodStatus_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourcePeriodStatus" ADD CONSTRAINT "FinanceSourcePeriodStatus_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourceSubsystemStatus" ADD CONSTRAINT "FinanceSourceSubsystemStatus_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountLineage" ADD CONSTRAINT "FinanceAccountLineage_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountLineage" ADD CONSTRAINT "FinanceAccountLineage_currentAccountId_fkey" FOREIGN KEY ("currentAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountLineage" ADD CONSTRAINT "FinanceAccountLineage_previousAccountId_fkey" FOREIGN KEY ("previousAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLedgerImport" ADD CONSTRAINT "FinanceLedgerImport_importedBy_fkey" FOREIGN KEY ("importedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLedgerImport" ADD CONSTRAINT "FinanceLedgerImport_sourcePackageId_fkey" FOREIGN KEY ("sourcePackageId") REFERENCES "FinanceReadableSourcePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLedgerImport" ADD CONSTRAINT "FinanceLedgerImport_sourceLedgerMappingId_fkey" FOREIGN KEY ("sourceLedgerMappingId") REFERENCES "FinanceSourceLedgerMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourceAccountBalance" ADD CONSTRAINT "FinanceSourceAccountBalance_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourceAccountBalance" ADD CONSTRAINT "FinanceSourceAccountBalance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourceAccountBalance" ADD CONSTRAINT "FinanceSourceAccountBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementVoucherExclusion" ADD CONSTRAINT "FinanceStatementVoucherExclusion_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucher" ADD CONSTRAINT "FinanceVoucher_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucher" ADD CONSTRAINT "FinanceVoucher_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucher" ADD CONSTRAINT "FinanceVoucher_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItem" ADD CONSTRAINT "FinanceVoucherItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItem" ADD CONSTRAINT "FinanceVoucherItem_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItem" ADD CONSTRAINT "FinanceVoucherItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountBalance" ADD CONSTRAINT "FinanceAccountBalance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountBalance" ADD CONSTRAINT "FinanceAccountBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshot" ADD CONSTRAINT "FinanceBalanceSnapshot_importedBy_fkey" FOREIGN KEY ("importedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshot" ADD CONSTRAINT "FinanceBalanceSnapshot_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshotRow" ADD CONSTRAINT "FinanceBalanceSnapshotRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FinanceBalanceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshotRow" ADD CONSTRAINT "FinanceBalanceSnapshotRow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReclassRule" ADD CONSTRAINT "FinanceReclassRule_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "FinanceAccountingPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReclassRule" ADD CONSTRAINT "FinanceReclassRule_sourceGroupAccountId_fkey" FOREIGN KEY ("sourceGroupAccountId") REFERENCES "FinanceGroupAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReclassRule" ADD CONSTRAINT "FinanceReclassRule_targetGroupAccountId_fkey" FOREIGN KEY ("targetGroupAccountId") REFERENCES "FinanceGroupAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReclassRule" ADD CONSTRAINT "FinanceReclassRule_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBalanceReclassAdjustment" ADD CONSTRAINT "FinanceBalanceReclassAdjustment_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "FinanceAccountingPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBalanceReclassAdjustment" ADD CONSTRAINT "FinanceBalanceReclassAdjustment_sourceGroupAccountId_fkey" FOREIGN KEY ("sourceGroupAccountId") REFERENCES "FinanceGroupAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBalanceReclassAdjustment" ADD CONSTRAINT "FinanceBalanceReclassAdjustment_targetGroupAccountId_fkey" FOREIGN KEY ("targetGroupAccountId") REFERENCES "FinanceGroupAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReclassResult" ADD CONSTRAINT "ReclassResult_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReclassResult" ADD CONSTRAINT "ReclassResult_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReclassResult" ADD CONSTRAINT "ReclassResult_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "FinanceReclassRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReclassResult" ADD CONSTRAINT "ReclassResult_adjustedBy_fkey" FOREIGN KEY ("adjustedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementSourceSheet" ADD CONSTRAINT "FinanceStatementSourceSheet_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "FinanceStatementSourcePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementSourceLine" ADD CONSTRAINT "FinanceStatementSourceLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "FinanceStatementSourceSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementWorkpaper" ADD CONSTRAINT "FinanceStatementWorkpaper_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementWorkpaper" ADD CONSTRAINT "FinanceStatementWorkpaper_sourcePackageId_fkey" FOREIGN KEY ("sourcePackageId") REFERENCES "FinanceStatementSourcePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementWorkpaperLine" ADD CONSTRAINT "FinanceStatementWorkpaperLine_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "FinanceStatementWorkpaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCurrency" ADD CONSTRAINT "FinanceCurrency_latestImportId_fkey" FOREIGN KEY ("latestImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankAccount" ADD CONSTRAINT "FinanceBankAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankAccount" ADD CONSTRAINT "FinanceBankAccount_latestImportId_fkey" FOREIGN KEY ("latestImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentDescription" ADD CONSTRAINT "DepartmentDescription_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleEvent" ADD CONSTRAINT "EmployeeLifecycleEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleEvent" ADD CONSTRAINT "EmployeeLifecycleEvent_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPerformanceReview" ADD CONSTRAINT "HrPerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerPositionId_fkey" FOREIGN KEY ("managerPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentManagerEmployee" ADD CONSTRAINT "DepartmentManagerEmployee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentManagerEmployee" ADD CONSTRAINT "DepartmentManagerEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_positionDescriptionId_fkey" FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_reportingCompanyId_fkey" FOREIGN KEY ("reportingCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_positionReportOverrideId_fkey" FOREIGN KEY ("positionReportOverrideId") REFERENCES "PositionReportOverride"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionReportOverride" ADD CONSTRAINT "PositionReportOverride_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionReportOverride" ADD CONSTRAINT "PositionReportOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionReportOverride" ADD CONSTRAINT "PositionReportOverride_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionReportOverride" ADD CONSTRAINT "PositionReportOverride_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditHistory" ADD CONSTRAINT "EditHistory_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productMasterId_fkey" FOREIGN KEY ("productMasterId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnitConversion" ADD CONSTRAINT "InventoryUnitConversion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InventoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_documentLineId_fkey" FOREIGN KEY ("documentLineId") REFERENCES "InventoryDocumentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktake" ADD CONSTRAINT "InventoryStocktake_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktakeLine" ADD CONSTRAINT "InventoryStocktakeLine_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "InventoryStocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktakeLine" ADD CONSTRAINT "InventoryStocktakeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktakeLine" ADD CONSTRAINT "InventoryStocktakeLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktakeLine" ADD CONSTRAINT "InventoryStocktakeLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptProductWorkPoint" ADD CONSTRAINT "InventoryReceiptProductWorkPoint_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InventoryReceiptReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptProductWorkPoint" ADD CONSTRAINT "InventoryReceiptProductWorkPoint_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptReportEvent" ADD CONSTRAINT "InventoryReceiptReportEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InventoryReceiptReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptBatch" ADD CONSTRAINT "InventoryReceiptBatch_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InventoryReceiptReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptBatch" ADD CONSTRAINT "InventoryReceiptBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptOutput" ADD CONSTRAINT "InventoryReceiptOutput_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryReceiptBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptOutput" ADD CONSTRAINT "InventoryReceiptOutput_productSkuId_fkey" FOREIGN KEY ("productSkuId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRawMaterial" ADD CONSTRAINT "StockRawMaterial_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPackaging" ADD CONSTRAINT "StockPackaging_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockFinishedGoods" ADD CONSTRAINT "StockFinishedGoods_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryTagCandidate" ADD CONSTRAINT "LibraryTagCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryTagCandidate" ADD CONSTRAINT "LibraryTagCandidate_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryTagCandidate" ADD CONSTRAINT "LibraryTagCandidate_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "LibraryTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryTagCandidate" ADD CONSTRAINT "LibraryTagCandidate_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEntityMention" ADD CONSTRAINT "LibraryEntityMention_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEntityMention" ADD CONSTRAINT "LibraryEntityMention_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "LibraryContentChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMetadataCandidate" ADD CONSTRAINT "LibraryMetadataCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMetadataCandidate" ADD CONSTRAINT "LibraryMetadataCandidate_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMetadataCandidate" ADD CONSTRAINT "LibraryMetadataCandidate_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEvaluationCase" ADD CONSTRAINT "LibraryEvaluationCase_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEvaluationCase" ADD CONSTRAINT "LibraryEvaluationCase_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEvaluationEvidence" ADD CONSTRAINT "LibraryEvaluationEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LibraryEvaluationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEvaluationEvidence" ADD CONSTRAINT "LibraryEvaluationEvidence_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryProcessingJob" ADD CONSTRAINT "LibraryProcessingJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryArtifact" ADD CONSTRAINT "LibraryArtifact_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryArtifact" ADD CONSTRAINT "LibraryArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "LibraryProcessingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryContentChunk" ADD CONSTRAINT "LibraryContentChunk_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryContentChunk" ADD CONSTRAINT "LibraryContentChunk_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "LibraryArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibrarySearchIndex" ADD CONSTRAINT "LibrarySearchIndex_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibrarySearchIndex" ADD CONSTRAINT "LibrarySearchIndex_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "LibraryArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryExportJob" ADD CONSTRAINT "LibraryExportJob_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LibraryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_currentDirectoryId_fkey" FOREIGN KEY ("currentDirectoryId") REFERENCES "LibraryDirectory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocumentVersion" ADD CONSTRAINT "LibraryDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocumentVersion" ADD CONSTRAINT "LibraryDocumentVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCategory" ADD CONSTRAINT "LibraryCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LibraryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligenceRequest" ADD CONSTRAINT "DueDiligenceRequest_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "DueDiligenceParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligenceQuestion" ADD CONSTRAINT "DueDiligenceQuestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DueDiligenceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligenceMaterialSelection" ADD CONSTRAINT "DueDiligenceMaterialSelection_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DueDiligenceQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligenceMaterialSelection" ADD CONSTRAINT "DueDiligenceMaterialSelection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligenceMaterialSelection" ADD CONSTRAINT "DueDiligenceMaterialSelection_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocumentTag" ADD CONSTRAINT "LibraryDocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocumentTag" ADD CONSTRAINT "LibraryDocumentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "LibraryTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocumentTag" ADD CONSTRAINT "LibraryDocumentTag_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutationImpactBatch" ADD CONSTRAINT "MutationImpactBatch_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutationImpactBatch" ADD CONSTRAINT "MutationImpactBatch_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "MutationImpactBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutationImpactEffect" ADD CONSTRAINT "MutationImpactEffect_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MutationImpactBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenApiScope" ADD CONSTRAINT "OpenApiScope_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "OpenApiResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenApiClientScopeGrant" ADD CONSTRAINT "OpenApiClientScopeGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OpenApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenApiClientScopeGrant" ADD CONSTRAINT "OpenApiClientScopeGrant_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "OpenApiScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenApiAccessLog" ADD CONSTRAINT "OpenApiAccessLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OpenApiClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSourceMapping" ADD CONSTRAINT "ProductSourceMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSourceMapping" ADD CONSTRAINT "ProductSourceMapping_productSkuId_fkey" FOREIGN KEY ("productSkuId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionQcBatch" ADD CONSTRAINT "ProductionQcBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionQcBatch" ADD CONSTRAINT "ProductionQcBatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionQcFieldValue" ADD CONSTRAINT "ProductionQcFieldValue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionQcBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionQcSignature" ADD CONSTRAINT "ProductionQcSignature_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionQcBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCollaboration" ADD CONSTRAINT "DepartmentCollaboration_responsibleDepartmentId_fkey" FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCollaboration" ADD CONSTRAINT "DepartmentCollaboration_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationDepartment" ADD CONSTRAINT "DepartmentCollaborationDepartment_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationDepartment" ADD CONSTRAINT "DepartmentCollaborationDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationDepartment" ADD CONSTRAINT "DepartmentCollaborationDepartment_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationPosition" ADD CONSTRAINT "DepartmentCollaborationPosition_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationPosition" ADD CONSTRAINT "DepartmentCollaborationPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiDefinition" ADD CONSTRAINT "WorkKpiDefinition_ownerDepartmentId_fkey" FOREIGN KEY ("ownerDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiDefinition" ADD CONSTRAINT "WorkKpiDefinition_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiAssignment" ADD CONSTRAINT "WorkKpiAssignment_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiAssignment" ADD CONSTRAINT "WorkKpiAssignment_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkKpiDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiAssignment" ADD CONSTRAINT "WorkKpiAssignment_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiAssignment" ADD CONSTRAINT "WorkKpiAssignment_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiAssignment" ADD CONSTRAINT "WorkKpiAssignment_sourceAssignmentId_fkey" FOREIGN KEY ("sourceAssignmentId") REFERENCES "WorkKpiAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiAssignment" ADD CONSTRAINT "WorkKpiAssignment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiResultSnapshot" ADD CONSTRAINT "WorkKpiResultSnapshot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "WorkKpiAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiResultSnapshot" ADD CONSTRAINT "WorkKpiResultSnapshot_workReportId_fkey" FOREIGN KEY ("workReportId") REFERENCES "WorkReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiResultSnapshot" ADD CONSTRAINT "WorkKpiResultSnapshot_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "WorkKpiResultSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKpiResultSnapshot" ADD CONSTRAINT "WorkKpiResultSnapshot_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSeries" ADD CONSTRAINT "MeetingSeries_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MeetingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MeetingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MeetingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_secretaryUserId_fkey" FOREIGN KEY ("secretaryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMinuteEntry" ADD CONSTRAINT "MeetingMinuteEntry_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMinuteEntry" ADD CONSTRAINT "MeetingMinuteEntry_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingProposal" ADD CONSTRAINT "MeetingProposal_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingProposal" ADD CONSTRAINT "MeetingProposal_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingVote" ADD CONSTRAINT "MeetingVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MeetingProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingVote" ADD CONSTRAINT "MeetingVote_voterUserId_fkey" FOREIGN KEY ("voterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MeetingProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "MeetingDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_linkedWorkItemId_fkey" FOREIGN KEY ("linkedWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_linkedWorkPlanId_fkey" FOREIGN KEY ("linkedWorkPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlanAlignment" ADD CONSTRAINT "WorkPlanAlignment_childPlanId_fkey" FOREIGN KEY ("childPlanId") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlanAlignment" ADD CONSTRAINT "WorkPlanAlignment_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlanAlignment" ADD CONSTRAINT "WorkPlanAlignment_sourceWorkItemId_fkey" FOREIGN KEY ("sourceWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOkrCycle" ADD CONSTRAINT "WorkOkrCycle_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkOkrCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOkrControlPolicy" ADD CONSTRAINT "WorkOkrControlPolicy_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "WorkOkrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlanGovernanceEvent" ADD CONSTRAINT "WorkPlanGovernanceEvent_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadingDepartmentId_fkey" FOREIGN KEY ("leadingDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEnablingDepartment" ADD CONSTRAINT "ProjectEnablingDepartment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEnablingDepartment" ADD CONSTRAINT "ProjectEnablingDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProject" ADD CONSTRAINT "EmployeeProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProject" ADD CONSTRAINT "EmployeeProject_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPlanPhase" ADD CONSTRAINT "ProjectPlanPhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPlanDependency" ADD CONSTRAINT "ProjectPlanDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPlanBaseline" ADD CONSTRAINT "ProjectPlanBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPlanBaselineItem" ADD CONSTRAINT "ProjectPlanBaselineItem_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ProjectPlanBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReportItem" ADD CONSTRAINT "WorkReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WorkReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReportItem" ADD CONSTRAINT "WorkReportItem_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReportItem" ADD CONSTRAINT "WorkReportItem_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionResponsibilityNode" ADD CONSTRAINT "PositionResponsibilityNode_positionDescriptionId_fkey" FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionResponsibilityNode" ADD CONSTRAINT "PositionResponsibilityNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PositionResponsibilityNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkResponsibilityReference" ADD CONSTRAINT "WorkResponsibilityReference_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkResponsibilityReference" ADD CONSTRAINT "WorkResponsibilityReference_responsibilityNodeId_fkey" FOREIGN KEY ("responsibilityNodeId") REFERENCES "PositionResponsibilityNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_okrCycleId_fkey" FOREIGN KEY ("okrCycleId") REFERENCES "WorkOkrCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_parentPeriodPlanId_fkey" FOREIGN KEY ("parentPeriodPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_previousPeriodPlanId_fkey" FOREIGN KEY ("previousPeriodPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_linkedProjectPhaseId_fkey" FOREIGN KEY ("linkedProjectPhaseId") REFERENCES "ProjectPlanPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourceMeetingId_fkey" FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourceMeetingDecisionId_fkey" FOREIGN KEY ("sourceMeetingDecisionId") REFERENCES "MeetingDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourceMeetingActionCandidateId_fkey" FOREIGN KEY ("sourceMeetingActionCandidateId") REFERENCES "MeetingActionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourceDepartmentId_fkey" FOREIGN KEY ("sourceDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_linkedProjectPhaseId_fkey" FOREIGN KEY ("linkedProjectPhaseId") REFERENCES "ProjectPlanPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceMeetingId_fkey" FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceMeetingDecisionId_fkey" FOREIGN KEY ("sourceMeetingDecisionId") REFERENCES "MeetingDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceMeetingActionCandidateId_fkey" FOREIGN KEY ("sourceMeetingActionCandidateId") REFERENCES "MeetingActionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceDepartmentId_fkey" FOREIGN KEY ("sourceDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_parentWorkItemId_fkey" FOREIGN KEY ("parentWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_parentPeriodWorkItemId_fkey" FOREIGN KEY ("parentPeriodWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_previousPeriodWorkItemId_fkey" FOREIGN KEY ("previousPeriodWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKrEvidence" ADD CONSTRAINT "WorkKrEvidence_krWorkItemId_fkey" FOREIGN KEY ("krWorkItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKrEvidence" ADD CONSTRAINT "WorkKrEvidence_taskWorkItemId_fkey" FOREIGN KEY ("taskWorkItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkParticipant" ADD CONSTRAINT "WorkParticipant_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkAssignee" ADD CONSTRAINT "DepartmentWorkAssignee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentWorkAssignee" ADD CONSTRAINT "DepartmentWorkAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkAssignee" ADD CONSTRAINT "ProjectWorkAssignee_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkAssignee" ADD CONSTRAINT "ProjectWorkAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAnalysisTemplateRevision" ADD CONSTRAINT "WorkspaceAnalysisTemplateRevision_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkspaceAnalysisTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FinanceStatementExchangeRate_central_parity_currency_date_key"
  ON "FinanceStatementExchangeRate"("baseCurrency", "quoteCurrency", "rateDate")
  WHERE "rateKind" = 'centralParity';

CREATE UNIQUE INDEX "idx_active_budget_version"
  ON "FinanceBudgetVersion"("year", COALESCE("companyCode", ''))
  WHERE "status" = 'active';

ALTER TABLE "CompanyRegistryChange" ADD CONSTRAINT "CompanyRegistryChange_category_check" CHECK ("changeCategory" = ANY (ARRAY['company_name'::text, 'legal_representative'::text, 'officers'::text, 'ownership'::text]));
ALTER TABLE "CompanyRegistryOwnershipParticipant" ADD CONSTRAINT "CompanyRegistryOwnershipParticipant_resolutionStatus_check" CHECK ("resolutionStatus" = ANY (ARRAY['resolved'::text, 'unresolved'::text]));
ALTER TABLE "CompanyRegistryOwnershipParticipant" ADD CONSTRAINT "CompanyRegistryOwnershipParticipant_snapshotSide_check" CHECK ("snapshotSide" = ANY (ARRAY['before'::text, 'after'::text]));
ALTER TABLE "DepartmentCollaborationPosition" ADD CONSTRAINT "DepartmentCollaborationPosition_kind_check" CHECK (kind = ANY (ARRAY['responsible'::text, 'executor'::text]));
ALTER TABLE "EmployeeLifecycleEvent" ADD CONSTRAINT "EmployeeLifecycleEvent_effectiveDate_check" CHECK ("effectiveDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text);
ALTER TABLE "EmployeeLifecycleEvent" ADD CONSTRAINT "EmployeeLifecycleEvent_eventType_check" CHECK ("eventType" = ANY (ARRAY['onboard'::text, 'transfer'::text, 'concurrent_assignment'::text, 'reporting_change'::text, 'offboard'::text]));
ALTER TABLE "ExternalPartyProfile" ADD CONSTRAINT "ExternalPartyProfile_relatedPartyType_check" CHECK ("relatedPartyType" = ANY (ARRAY['unrelated'::text, 'group'::text, 'joint_venture_associate'::text, 'investor_influence'::text, 'key_management_related'::text, 'other_related'::text]));
ALTER TABLE "ExternalPartyRole" ADD CONSTRAINT "ExternalPartyRole_category_check" CHECK (category = ANY (ARRAY['customer'::text, 'supplier'::text]));
ALTER TABLE "ExternalPartyRole" ADD CONSTRAINT "ExternalPartyRole_creditDays_check" CHECK ("creditDays" IS NULL OR "creditDays" >= 0 AND "creditDays" <= 3650);
ALTER TABLE "ExternalPartyRole" ADD CONSTRAINT "ExternalPartyRole_creditLimit_check" CHECK ("creditLimit" IS NULL OR "creditLimit" >= 0::double precision);
ALTER TABLE "ExternalPartyRole" ADD CONSTRAINT "ExternalPartyRole_taxRate_check" CHECK ("taxRate" IS NULL OR "taxRate" >= 0::double precision AND "taxRate" <= 100::double precision);
ALTER TABLE "FinanceAccountingPolicyVersion" ADD CONSTRAINT "FinanceAccountingPolicyVersion_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" > "effectiveFrom");
ALTER TABLE "FinanceAccountingPolicyVersion" ADD CONSTRAINT "FinanceAccountingPolicyVersion_start_check" CHECK ("versionNo" = 1 AND "effectiveFrom" IS NULL OR "versionNo" > 1 AND "effectiveFrom" IS NOT NULL);
ALTER TABLE "FinanceConsolidationBatch" ADD CONSTRAINT "FinanceConsolidationBatch_periodKind_check" CHECK ("periodKind" = ANY (ARRAY['year'::text, 'quarter'::text, 'month'::text]));
ALTER TABLE "FinanceConsolidationEntry" ADD CONSTRAINT "FinanceConsolidationEntry_lineage_consistency_check" CHECK (NOT ("supersedesEntryId" IS NOT NULL AND "reversalOfEntryId" IS NOT NULL) AND NOT "predecessorEntryId" IS DISTINCT FROM COALESCE("supersedesEntryId", "reversalOfEntryId"));
ALTER TABLE "FinanceConsolidationEntry" ADD CONSTRAINT "FinanceConsolidationEntry_matchDifference_check" CHECK ("matchDifference" IS NULL OR "matchDifference" >= 0::numeric);
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_matchSide_check" CHECK ("matchSide" IS NULL OR ("matchSide" = ANY (ARRAY['left'::text, 'right'::text])));
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_periodBasis_check" CHECK ("periodBasis" = ANY (ARRAY['current'::text, 'comparative'::text]));
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceAmount_check" CHECK ("sourceAmount" IS NULL OR "sourceAmount" > 0::numeric);
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceKind_check" CHECK ("sourceKind" IS NULL OR ("sourceKind" = ANY (ARRAY['auxiliaryBalance'::text, 'openItem'::text, 'cashFlowAllocation'::text, 'workpaper'::text, 'voucher'::text, 'other'::text])));
ALTER TABLE "FinanceConsolidationTaxEffect" ADD CONSTRAINT "FinanceConsolidationTaxEffect_periodBasis_check" CHECK ("periodBasis" = ANY (ARRAY['current'::text, 'comparative'::text]));
ALTER TABLE "FinanceConsolidationTaxEffect" ADD CONSTRAINT "FinanceConsolidationTaxEffect_recognitionLocation_check" CHECK ("recognitionLocation" IS NULL OR ("recognitionLocation" = ANY (ARRAY['profitOrLoss'::text, 'otherComprehensiveIncome'::text, 'equity'::text])));
ALTER TABLE "FinanceGroupAccount" ADD CONSTRAINT "FinanceGroupAccount_chinese_code_prefix_check" CHECK (category = 'asset'::text AND code ~~ '1%'::text OR category = 'liability'::text AND code ~~ '2%'::text OR category = 'common'::text AND code ~~ '3%'::text OR category = 'equity'::text AND code ~~ '4%'::text OR category = 'cost'::text AND code ~~ '5%'::text OR (category = ANY (ARRAY['revenue'::text, 'expense'::text])) AND code ~~ '6%'::text);
ALTER TABLE "FinanceGroupAccountRevision" ADD CONSTRAINT "FinanceGroupAccountRevision_chinese_code_prefix_check" CHECK (category = 'asset'::text AND code ~~ '1%'::text OR category = 'liability'::text AND code ~~ '2%'::text OR category = 'common'::text AND code ~~ '3%'::text OR category = 'equity'::text AND code ~~ '4%'::text OR category = 'cost'::text AND code ~~ '5%'::text OR (category = ANY (ARRAY['revenue'::text, 'expense'::text])) AND code ~~ '6%'::text);
ALTER TABLE "FinanceOpenItemSettlement" ADD CONSTRAINT "FinanceOpenItemSettlement_nonnegative_check" CHECK ("settledDebit" >= 0::numeric AND "settledCredit" >= 0::numeric);
ALTER TABLE "FinanceOpenItemSettlement" ADD CONSTRAINT "FinanceOpenItemSettlement_one_side_check" CHECK (("settledDebit" = 0::numeric) <> ("settledCredit" = 0::numeric));
ALTER TABLE "FinanceReclassRule" ADD CONSTRAINT "FinanceReclassRule_decision_target_check" CHECK (decision = 'reclassify'::text AND "targetAccountCode" IS NOT NULL OR decision = 'no_reclass'::text AND "targetAccountCode" IS NULL);
ALTER TABLE "FinanceReclassRule" ADD CONSTRAINT "FinanceReclassRule_group_target_check" CHECK (decision = 'reclassify'::text AND "targetGroupAccountId" IS NOT NULL AND "targetGroupAccountId" <> "sourceGroupAccountId" OR decision = 'no_reclass'::text AND "targetGroupAccountId" IS NULL);
ALTER TABLE "FinanceSalesSalary" ADD CONSTRAINT "FinanceSalesSalary_nonEmployee_has_no_employee_check" CHECK ("salesChannel" = 'employee'::text OR "employeeId" IS NULL);
ALTER TABLE "FinanceSalesSalary" ADD CONSTRAINT "FinanceSalesSalary_salesChannel_check" CHECK ("salesChannel" = ANY (ARRAY['employee'::text, 'factory_direct'::text, 'unknown'::text]));
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_nonEmployee_has_no_employee_check" CHECK ("salesChannel" = 'employee'::text OR "employeeId" IS NULL);
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_salesChannel_check" CHECK ("salesChannel" = ANY (ARRAY['employee'::text, 'factory_direct'::text, 'unknown'::text]));
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_confidentialityLevel_check" CHECK ("confidentialityLevel" >= 0 AND "confidentialityLevel" <= 4);
ALTER TABLE "OwnershipInterest" ADD CONSTRAINT "OwnershipInterest_effective_period_check" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");
ALTER TABLE "OwnershipInterest" ADD CONSTRAINT "OwnershipInterest_recordStatus_check" CHECK ("recordStatus" = ANY (ARRAY['confirmed'::text, 'pending'::text]));
ALTER TABLE "OwnershipInterest" ADD CONSTRAINT "OwnershipInterest_shareRatio_check" CHECK ("shareRatio" IS NULL OR "shareRatio" >= 0::double precision AND "shareRatio" <= 1::double precision);
ALTER TABLE "Party" ADD CONSTRAINT "ExternalParty_subjectType_check" CHECK ("subjectType" = ANY (ARRAY['organization'::text, 'individual'::text]));
ALTER TABLE "PartyNameHistory" ADD CONSTRAINT "PartyNameHistory_kind_check" CHECK ("nameKind" = ANY (ARRAY['legal'::text, 'short'::text, 'trade'::text, 'source_alias'::text]));
ALTER TABLE "PartyNameHistory" ADD CONSTRAINT "PartyNameHistory_period_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveFrom" <= "effectiveTo");
ALTER TABLE "PartyNameHistory" ADD CONSTRAINT "PartyNameHistory_precision_check" CHECK ("datePrecision" = ANY (ARRAY['day'::text, 'month'::text, 'year'::text, 'unknown'::text]));
ALTER TABLE "PartyNameHistory" ADD CONSTRAINT "PartyNameHistory_status_check" CHECK ("recordStatus" = ANY (ARRAY['confirmed'::text, 'pending'::text, 'voided'::text]));
ALTER TABLE "ProductSourceMapping" ADD CONSTRAINT "ProductSourceMapping_exactly_one_target_check" CHECK (status = 'pending'::text AND num_nonnulls("productId", "productSkuId") <= 1 OR status <> 'pending'::text AND num_nonnulls("productId", "productSkuId") = 1);
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_checkpoint_positive_check" CHECK ("registeredCapitalCheckpointYuan" IS NULL OR "registeredCapitalCheckpointYuan" > 0::numeric);
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_completeness_check" CHECK ("dataCompleteness" = ANY (ARRAY['complete'::text, 'party_list_only'::text, 'known_interests_only'::text]));
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_date_precision_check" CHECK ("effectiveDatePrecision" = ANY (ARRAY['day'::text, 'month'::text, 'year'::text, 'unknown'::text]));
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_mode_check" CHECK ("ledgerMode" = 'confirmation_snapshot'::text AND "eventType" = 'confirmation_snapshot'::text OR "ledgerMode" = 'transactions'::text AND "eventType" <> 'confirmation_snapshot'::text);
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_status_check" CHECK ("recordStatus" = ANY (ARRAY['confirmed'::text, 'pending'::text]));
ALTER TABLE "ShareCapitalEvent" ADD CONSTRAINT "ShareCapitalEvent_type_check" CHECK ("eventType" = ANY (ARRAY['incorporation'::text, 'capital_increase'::text, 'capital_reduction'::text, 'transfer'::text, 'buyback'::text, 'adjustment'::text, 'confirmation_snapshot'::text]));
ALTER TABLE "ShareCapitalSnapshotPosition" ADD CONSTRAINT "ShareCapitalSnapshotPosition_capital_positive_check" CHECK ("registeredCapitalAmountYuan" IS NULL OR "registeredCapitalAmountYuan" > 0::numeric);
ALTER TABLE "ShareCapitalSnapshotPosition" ADD CONSTRAINT "ShareCapitalSnapshotPosition_ratio_check" CHECK ("assertedShareRatio" IS NULL OR "assertedShareRatio" > 0::double precision AND "assertedShareRatio" <= 1::double precision);
ALTER TABLE "ShareCapitalTransaction" ADD CONSTRAINT "ShareCapitalTransaction_distinct_parties_check" CHECK ("fromPartyId" IS NULL OR "toPartyId" IS NULL OR "fromPartyId" <> "toPartyId");
ALTER TABLE "ShareCapitalTransaction" ADD CONSTRAINT "ShareCapitalTransaction_has_party_check" CHECK ("fromPartyId" IS NOT NULL OR "toPartyId" IS NOT NULL);
ALTER TABLE "ShareCapitalTransaction" ADD CONSTRAINT "ShareCapitalTransaction_positive_capital_check" CHECK ("registeredCapitalAmountYuan" > 0::numeric);
ALTER TABLE "ShareholderGroupMembership" ADD CONSTRAINT "ShareholderGroupMembership_period_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "ShareholderGroupMembership" ADD CONSTRAINT "ShareholderGroupMembership_status_check" CHECK ("recordStatus" = ANY (ARRAY['confirmed'::text, 'pending'::text]));
ALTER TABLE "User" ADD CONSTRAINT "User_username_nonempty_check" CHECK (length(btrim(username)) > 0);
ALTER TABLE "WorkspaceAnalysisTemplate" ADD CONSTRAINT "WorkspaceAnalysisTemplate_archivedAudit_check" CHECK (status = 'archived'::text AND "archivedBy" IS NOT NULL AND "archivedAt" IS NOT NULL OR status = 'active'::text AND "archivedBy" IS NULL AND "archivedAt" IS NULL);
ALTER TABLE "WorkspaceAnalysisTemplate" ADD CONSTRAINT "WorkspaceAnalysisTemplate_publishedAudit_check" CHECK ("publishedRevision" IS NULL AND "publishedBy" IS NULL AND "publishedAt" IS NULL OR "publishedRevision" IS NOT NULL AND "publishedBy" IS NOT NULL AND "publishedAt" IS NOT NULL);
ALTER TABLE "WorkspaceAnalysisTemplate" ADD CONSTRAINT "WorkspaceAnalysisTemplate_publishedRevision_check" CHECK ("publishedRevision" IS NULL OR "publishedRevision" > 0 AND "publishedRevision" <= revision);
ALTER TABLE "WorkspaceAnalysisTemplate" ADD CONSTRAINT "WorkspaceAnalysisTemplate_revision_check" CHECK (revision > 0);
ALTER TABLE "WorkspaceAnalysisTemplate" ADD CONSTRAINT "WorkspaceAnalysisTemplate_scopeType_check" CHECK ("scopeType" = ANY (ARRAY['personal'::text, 'department'::text, 'project'::text]));
ALTER TABLE "WorkspaceAnalysisTemplate" ADD CONSTRAINT "WorkspaceAnalysisTemplate_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));
ALTER TABLE "WorkspaceAnalysisTemplateRevision" ADD CONSTRAINT "WorkspaceAnalysisTemplateRevision_changeKind_check" CHECK ("changeKind" = ANY (ARRAY['legacy'::text, 'draft'::text, 'publish'::text, 'rollback'::text, 'discard'::text, 'archive'::text, 'restore'::text]));
ALTER TABLE "WorkspaceAnalysisTemplateRevision" ADD CONSTRAINT "WorkspaceAnalysisTemplateRevision_revision_check" CHECK (revision > 0);
ALTER TABLE "WorkspaceAnalysisTemplateRevision" ADD CONSTRAINT "WorkspaceAnalysisTemplateRevision_sourceRevision_check" CHECK ("sourceRevision" IS NULL OR "sourceRevision" > 0);
ALTER TABLE "ApprovalEvent" ALTER CONSTRAINT "ApprovalEvent_actorUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ApprovalEvent" ALTER CONSTRAINT "ApprovalEvent_requestId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ApprovalRequest" ALTER CONSTRAINT "ApprovalRequest_resolvedByUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ApprovalRequest" ALTER CONSTRAINT "ApprovalRequest_submitterUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Company" ALTER CONSTRAINT "Company_partyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Contract" ALTER CONSTRAINT "Contract_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Department" ALTER CONSTRAINT "Department_managerPositionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Department" ALTER CONSTRAINT "Department_parentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentCollaboration" ALTER CONSTRAINT "DepartmentCollaboration_createdByUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentCollaboration" ALTER CONSTRAINT "DepartmentCollaboration_responsibleDepartmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentCollaborationDepartment" ALTER CONSTRAINT "DepartmentCollaborationDepartment_collaborationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentCollaborationDepartment" ALTER CONSTRAINT "DepartmentCollaborationDepartment_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentCollaborationDepartment" ALTER CONSTRAINT "DepartmentCollaborationDepartment_respondedByUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentCollaborationPosition" ALTER CONSTRAINT "DepartmentCollaborationPosition_collaborationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentCollaborationPosition" ALTER CONSTRAINT "DepartmentCollaborationPosition_positionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentDescription" ALTER CONSTRAINT "DepartmentDescription_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentManagerEmployee" ALTER CONSTRAINT "DepartmentManagerEmployee_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentManagerEmployee" ALTER CONSTRAINT "DepartmentManagerEmployee_employeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentResourceActionGrant" ALTER CONSTRAINT "DepartmentResourceActionGrant_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentResourceActionGrant" ALTER CONSTRAINT "DepartmentResourceActionGrant_resourceId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentWorkAssignee" ALTER CONSTRAINT "DepartmentWorkAssignee_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DepartmentWorkAssignee" ALTER CONSTRAINT "DepartmentWorkAssignee_userId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DocumentTemplate" ALTER CONSTRAINT "DocumentTemplate_spaceId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DueDiligenceMaterialSelection" ALTER CONSTRAINT "DueDiligenceMaterialSelection_documentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DueDiligenceMaterialSelection" ALTER CONSTRAINT "DueDiligenceMaterialSelection_documentVersionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DueDiligenceMaterialSelection" ALTER CONSTRAINT "DueDiligenceMaterialSelection_questionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DueDiligenceQuestion" ALTER CONSTRAINT "DueDiligenceQuestion_requestId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DueDiligenceRequest" ALTER CONSTRAINT "DueDiligenceRequest_partyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EditHistory" ALTER CONSTRAINT "EditHistory_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Employee" ALTER CONSTRAINT "Employee_userId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EmployeePosition" ALTER CONSTRAINT "EmployeePosition_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EmployeePosition" ALTER CONSTRAINT "EmployeePosition_employeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EmployeePosition" ALTER CONSTRAINT "EmployeePosition_positionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EmployeePosition" ALTER CONSTRAINT "EmployeePosition_positionReportOverrideId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EmployeePosition" ALTER CONSTRAINT "EmployeePosition_reportingCompanyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EmployeeProject" ALTER CONSTRAINT "EmployeeProject_employeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EmployeeProject" ALTER CONSTRAINT "EmployeeProject_projectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Employment" ALTER CONSTRAINT "Employment_employeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ExternalPartyProfile" ALTER CONSTRAINT "ExternalPartyProfile_partyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ExternalPartyRole" ALTER CONSTRAINT "ExternalPartyRole_partyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceAccount" ALTER CONSTRAINT "FinanceAccount_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceAccount" ALTER CONSTRAINT "FinanceAccount_parentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceAccountBalance" ALTER CONSTRAINT "FinanceAccountBalance_accountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceAccountBalance" ALTER CONSTRAINT "FinanceAccountBalance_periodId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBalanceSnapshot" ALTER CONSTRAINT "FinanceBalanceSnapshot_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBalanceSnapshot" ALTER CONSTRAINT "FinanceBalanceSnapshot_importedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBalanceSnapshotRow" ALTER CONSTRAINT "FinanceBalanceSnapshotRow_accountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBalanceSnapshotRow" ALTER CONSTRAINT "FinanceBalanceSnapshotRow_snapshotId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBudgetDept" ALTER CONSTRAINT "FinanceBudgetDept_accountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBudgetDept" ALTER CONSTRAINT "FinanceBudgetDept_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBudgetRd" ALTER CONSTRAINT "FinanceBudgetRd_accountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBudgetRd" ALTER CONSTRAINT "FinanceBudgetRd_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationBatch" ALTER CONSTRAINT "FinanceConsolidationBatch_baseBatchId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationBatchEvent" ALTER CONSTRAINT "FinanceConsolidationBatchEvent_batchId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationControlDecision" ALTER CONSTRAINT "FinanceConsolidationControlDecision_batchId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntitySnapshot" ALTER CONSTRAINT "FinanceConsolidationEntitySnapshot_batchId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntry" ALTER CONSTRAINT "FinanceConsolidationEntry_batchId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntry" ALTER CONSTRAINT "FinanceConsolidationEntry_predecessorEntryId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntry" ALTER CONSTRAINT "FinanceConsolidationEntry_reversalOfEntryId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntry" ALTER CONSTRAINT "FinanceConsolidationEntry_supersedesEntryId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntryLine" ALTER CONSTRAINT "FinanceConsolidationEntryLine_entryId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationOutputSnapshot" ALTER CONSTRAINT "FinanceConsolidationOutputSnapshot_batchId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationRateSnapshot" ALTER CONSTRAINT "FinanceConsolidationRateSnapshot_batchId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationSourceSnapshot" ALTER CONSTRAINT "FinanceConsolidationSourceSnapshot_batchId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationSourceSnapshot" ALTER CONSTRAINT "FinanceConsolidationSourceSnapshot_entitySnapshotId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationTaxEffect" ALTER CONSTRAINT "FinanceConsolidationTaxEffect_entryId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceCostAnalysisRow" ALTER CONSTRAINT "FinanceCostAnalysisRow_importId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceCostStructureRow" ALTER CONSTRAINT "FinanceCostStructureRow_importId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceLedgerImport" ALTER CONSTRAINT "FinanceLedgerImport_importedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceReclassRule" ALTER CONSTRAINT "FinanceReclassRule_confirmedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceSalesSalary" ALTER CONSTRAINT "FinanceSalesSalary_importId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceShipment" ALTER CONSTRAINT "FinanceShipment_importId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceStatementWorkpaper" ALTER CONSTRAINT "FinanceStatementWorkpaper_updatedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceStatementWorkpaperLine" ALTER CONSTRAINT "FinanceStatementWorkpaperLine_workpaperId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceVoucher" ALTER CONSTRAINT "FinanceVoucher_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceVoucher" ALTER CONSTRAINT "FinanceVoucher_periodId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceVoucherItem" ALTER CONSTRAINT "FinanceVoucherItem_accountId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceVoucherItem" ALTER CONSTRAINT "FinanceVoucherItem_importId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceVoucherItem" ALTER CONSTRAINT "FinanceVoucherItem_voucherId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceWorkshopReport" ALTER CONSTRAINT "FinanceWorkshopReport_employeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceWorkshopReport" ALTER CONSTRAINT "FinanceWorkshopReport_importId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceWorkshopReport" ALTER CONSTRAINT "FinanceWorkshopReport_positionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "HrPerformanceReview" ALTER CONSTRAINT "HrPerformanceReview_employeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryArtifact" ALTER CONSTRAINT "LibraryArtifact_jobId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryArtifact" ALTER CONSTRAINT "LibraryArtifact_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryCategory" ALTER CONSTRAINT "LibraryCategory_parentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryContentChunk" ALTER CONSTRAINT "LibraryContentChunk_artifactId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryContentChunk" ALTER CONSTRAINT "LibraryContentChunk_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocument" ALTER CONSTRAINT "LibraryDocument_categoryId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocument" ALTER CONSTRAINT "LibraryDocument_currentDirectoryId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocument" ALTER CONSTRAINT "LibraryDocument_currentVersionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocument" ALTER CONSTRAINT "LibraryDocument_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocument" ALTER CONSTRAINT "LibraryDocument_ownerUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocument" ALTER CONSTRAINT "LibraryDocument_reviewedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocumentTag" ALTER CONSTRAINT "LibraryDocumentTag_createdBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocumentTag" ALTER CONSTRAINT "LibraryDocumentTag_documentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocumentTag" ALTER CONSTRAINT "LibraryDocumentTag_tagId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocumentVersion" ALTER CONSTRAINT "LibraryDocumentVersion_createdBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryDocumentVersion" ALTER CONSTRAINT "LibraryDocumentVersion_documentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryEntityMention" ALTER CONSTRAINT "LibraryEntityMention_chunkId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryEntityMention" ALTER CONSTRAINT "LibraryEntityMention_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryEvaluationCase" ALTER CONSTRAINT "LibraryEvaluationCase_createdBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryEvaluationCase" ALTER CONSTRAINT "LibraryEvaluationCase_reviewedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryEvaluationEvidence" ALTER CONSTRAINT "LibraryEvaluationEvidence_caseId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryEvaluationEvidence" ALTER CONSTRAINT "LibraryEvaluationEvidence_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryExportJob" ALTER CONSTRAINT "LibraryExportJob_requestedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryMetadataCandidate" ALTER CONSTRAINT "LibraryMetadataCandidate_documentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryMetadataCandidate" ALTER CONSTRAINT "LibraryMetadataCandidate_reviewedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryMetadataCandidate" ALTER CONSTRAINT "LibraryMetadataCandidate_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryProcessingJob" ALTER CONSTRAINT "LibraryProcessingJob_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibrarySearchIndex" ALTER CONSTRAINT "LibrarySearchIndex_artifactId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibrarySearchIndex" ALTER CONSTRAINT "LibrarySearchIndex_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryTagCandidate" ALTER CONSTRAINT "LibraryTagCandidate_documentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryTagCandidate" ALTER CONSTRAINT "LibraryTagCandidate_reviewedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryTagCandidate" ALTER CONSTRAINT "LibraryTagCandidate_tagId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LibraryTagCandidate" ALTER CONSTRAINT "LibraryTagCandidate_versionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Meeting" ALTER CONSTRAINT "Meeting_ownerUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Meeting" ALTER CONSTRAINT "Meeting_secretaryUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Meeting" ALTER CONSTRAINT "Meeting_seriesId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Meeting" ALTER CONSTRAINT "Meeting_typeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingActionCandidate" ALTER CONSTRAINT "MeetingActionCandidate_agendaItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingActionCandidate" ALTER CONSTRAINT "MeetingActionCandidate_decisionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingActionCandidate" ALTER CONSTRAINT "MeetingActionCandidate_linkedWorkItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingActionCandidate" ALTER CONSTRAINT "MeetingActionCandidate_linkedWorkPlanId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingActionCandidate" ALTER CONSTRAINT "MeetingActionCandidate_meetingId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingAgendaItem" ALTER CONSTRAINT "MeetingAgendaItem_meetingId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingDecision" ALTER CONSTRAINT "MeetingDecision_agendaItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingDecision" ALTER CONSTRAINT "MeetingDecision_meetingId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingDecision" ALTER CONSTRAINT "MeetingDecision_proposalId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingMinuteEntry" ALTER CONSTRAINT "MeetingMinuteEntry_agendaItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingMinuteEntry" ALTER CONSTRAINT "MeetingMinuteEntry_meetingId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingParticipant" ALTER CONSTRAINT "MeetingParticipant_meetingId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingParticipant" ALTER CONSTRAINT "MeetingParticipant_userId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingProposal" ALTER CONSTRAINT "MeetingProposal_agendaItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingProposal" ALTER CONSTRAINT "MeetingProposal_meetingId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingSeries" ALTER CONSTRAINT "MeetingSeries_typeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingVote" ALTER CONSTRAINT "MeetingVote_proposalId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MeetingVote" ALTER CONSTRAINT "MeetingVote_voterUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Notification" ALTER CONSTRAINT "Notification_actorUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Notification" ALTER CONSTRAINT "Notification_recipientUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OpenApiAccessLog" ALTER CONSTRAINT "OpenApiAccessLog_clientId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OpenApiClientScopeGrant" ALTER CONSTRAINT "OpenApiClientScopeGrant_clientId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OpenApiClientScopeGrant" ALTER CONSTRAINT "OpenApiClientScopeGrant_scopeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OpenApiScope" ALTER CONSTRAINT "OpenApiScope_resourceId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OwnershipInterest" ALTER CONSTRAINT "OwnershipInterest_issuerCompanyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OwnershipInterest" ALTER CONSTRAINT "OwnershipInterest_ownerPartyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PermissionGrantLedgerEvent" ALTER CONSTRAINT "PermissionGrantLedgerEvent_actorUserId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PermissionGrantLedgerEvent" ALTER CONSTRAINT "PermissionGrantLedgerEvent_resourceId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Position" ALTER CONSTRAINT "Position_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Position" ALTER CONSTRAINT "Position_positionDescriptionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Position" ALTER CONSTRAINT "Position_reportToPositionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PositionReportOverride" ALTER CONSTRAINT "PositionReportOverride_companyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PositionReportOverride" ALTER CONSTRAINT "PositionReportOverride_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PositionReportOverride" ALTER CONSTRAINT "PositionReportOverride_positionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PositionReportOverride" ALTER CONSTRAINT "PositionReportOverride_reportToPositionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PositionResourceActionGrant" ALTER CONSTRAINT "PositionResourceActionGrant_positionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PositionResourceActionGrant" ALTER CONSTRAINT "PositionResourceActionGrant_resourceId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PositionResponsibilityNode" ALTER CONSTRAINT "PositionResponsibilityNode_parentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PositionResponsibilityNode" ALTER CONSTRAINT "PositionResponsibilityNode_positionDescriptionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Project" ALTER CONSTRAINT "Project_leadingDepartmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProjectEnablingDepartment" ALTER CONSTRAINT "ProjectEnablingDepartment_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProjectEnablingDepartment" ALTER CONSTRAINT "ProjectEnablingDepartment_projectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProjectPlanBaseline" ALTER CONSTRAINT "ProjectPlanBaseline_projectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProjectPlanBaselineItem" ALTER CONSTRAINT "ProjectPlanBaselineItem_baselineId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProjectPlanDependency" ALTER CONSTRAINT "ProjectPlanDependency_projectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProjectPlanPhase" ALTER CONSTRAINT "ProjectPlanPhase_projectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProjectWorkAssignee" ALTER CONSTRAINT "ProjectWorkAssignee_projectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProjectWorkAssignee" ALTER CONSTRAINT "ProjectWorkAssignee_userId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ReclassResult" ALTER CONSTRAINT "ReclassResult_adjustedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ReclassResult" ALTER CONSTRAINT "ReclassResult_periodId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ReclassResult" ALTER CONSTRAINT "ReclassResult_ruleId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ReclassResult" ALTER CONSTRAINT "ReclassResult_voucherItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Resource" ALTER CONSTRAINT "Resource_parentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "StockFinishedGoods" ALTER CONSTRAINT "StockFinishedGoods_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "StockOperation" ALTER CONSTRAINT "StockOperation_operatorId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "StockPackaging" ALTER CONSTRAINT "StockPackaging_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "StockRawMaterial" ALTER CONSTRAINT "StockRawMaterial_editedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "UserResourceActionGrant" ALTER CONSTRAINT "UserResourceActionGrant_resourceId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "UserResourceActionGrant" ALTER CONSTRAINT "UserResourceActionGrant_userId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_collaborationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_linkedProjectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_linkedProjectPhaseId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_ownerEmployeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_parentPeriodWorkItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_parentWorkItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_planId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_previousPeriodWorkItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_sourceDepartmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_sourceMeetingActionCandidateId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_sourceMeetingDecisionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkItem" ALTER CONSTRAINT "WorkItem_sourceMeetingId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkKrEvidence" ALTER CONSTRAINT "WorkKrEvidence_krWorkItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkKrEvidence" ALTER CONSTRAINT "WorkKrEvidence_taskWorkItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkOkrControlPolicy" ALTER CONSTRAINT "WorkOkrControlPolicy_cycleId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkOkrCycle" ALTER CONSTRAINT "WorkOkrCycle_parentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkParticipant" ALTER CONSTRAINT "WorkParticipant_workItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_collaborationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_linkedProjectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_linkedProjectPhaseId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_okrCycleId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_ownerEmployeeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_parentPeriodPlanId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_previousPeriodPlanId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_sourceDepartmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_sourceMeetingActionCandidateId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_sourceMeetingDecisionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_sourceMeetingId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlan" ALTER CONSTRAINT "WorkPlan_sourcePlanId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlanAlignment" ALTER CONSTRAINT "WorkPlanAlignment_childPlanId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlanAlignment" ALTER CONSTRAINT "WorkPlanAlignment_sourcePlanId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlanAlignment" ALTER CONSTRAINT "WorkPlanAlignment_sourceWorkItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkPlanGovernanceEvent" ALTER CONSTRAINT "WorkPlanGovernanceEvent_workPlanId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkReport" ALTER CONSTRAINT "WorkReport_submittedBy_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkReportItem" ALTER CONSTRAINT "WorkReportItem_reportId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkReportItem" ALTER CONSTRAINT "WorkReportItem_workItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkReportItem" ALTER CONSTRAINT "WorkReportItem_workPlanId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkResponsibilityReference" ALTER CONSTRAINT "WorkResponsibilityReference_responsibilityNodeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkResponsibilityReference" ALTER CONSTRAINT "WorkResponsibilityReference_workItemId_fkey" DEFERRABLE INITIALLY DEFERRED;
CREATE OR REPLACE FUNCTION public."FinanceAccountingPolicyVersion_contiguous_check"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  previous_version RECORD;
  current_version RECORD;
  open_ended_count INTEGER;
BEGIN
  previous_version := NULL;
  FOR current_version IN
    SELECT "versionNo", "effectiveFrom", "effectiveTo"
    FROM "FinanceAccountingPolicyVersion"
    WHERE "status" = 'published'
    ORDER BY "versionNo"
  LOOP
    IF previous_version IS NULL THEN
      IF current_version."versionNo" <> 1 OR current_version."effectiveFrom" IS NOT NULL THEN
        RAISE EXCEPTION 'published accounting policy versions must start with open-begin V1';
      END IF;
    ELSE
      IF current_version."versionNo" <> previous_version."versionNo" + 1 THEN
        RAISE EXCEPTION 'published accounting policy version numbers must be continuous';
      END IF;
      IF previous_version."effectiveTo" IS DISTINCT FROM current_version."effectiveFrom" THEN
        RAISE EXCEPTION 'published accounting policy effective ranges must be continuous and non-overlapping';
      END IF;
    END IF;
    previous_version := current_version;
  END LOOP;

  SELECT COUNT(*) INTO open_ended_count
  FROM "FinanceAccountingPolicyVersion"
  WHERE "status" = 'published' AND "effectiveTo" IS NULL;
  IF open_ended_count <> 1 THEN
    RAISE EXCEPTION 'exactly one published accounting policy version must be open-ended';
  END IF;
  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public._workspace_prevent_finance_consolidation_output_snapshot_mutati()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'FinanceConsolidationOutputSnapshot is immutable';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_inventory_receipt_report_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'InventoryReceiptReportEvent is append-only';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_production_qc_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ProductionQcAuditEvent is append-only';
END;
$function$
;
CREATE CONSTRAINT TRIGGER "FinanceAccountingPolicyVersion_contiguous_trigger" AFTER INSERT OR DELETE OR UPDATE ON "FinanceAccountingPolicyVersion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "FinanceAccountingPolicyVersion_contiguous_check"();
CREATE TRIGGER "FinanceConsolidationOutputSnapshot_immutable" BEFORE DELETE OR UPDATE ON "FinanceConsolidationOutputSnapshot" FOR EACH ROW EXECUTE FUNCTION _workspace_prevent_finance_consolidation_output_snapshot_mutati();
CREATE TRIGGER "InventoryReceiptReportEvent_append_only" BEFORE DELETE OR UPDATE ON "InventoryReceiptReportEvent" FOR EACH ROW EXECUTE FUNCTION prevent_inventory_receipt_report_event_mutation();
CREATE TRIGGER "ProductionQcAuditEvent_append_only" BEFORE DELETE OR UPDATE ON "ProductionQcAuditEvent" FOR EACH ROW EXECUTE FUNCTION prevent_production_qc_audit_mutation();
