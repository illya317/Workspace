-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
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
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actionKey" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "diffJson" TEXT,
    "resultJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,
    "contractNo" TEXT,
    "name" TEXT NOT NULL,
    "partyA" TEXT,
    "partyB" TEXT,
    "shareholder" TEXT,
    "category" TEXT,
    "content" TEXT,
    "handler" TEXT,
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
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "productName" TEXT,
    "category" TEXT,
    "itemName" TEXT,
    "amount" DOUBLE PRECISION,
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
    "companyCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePeriod_pkey" PRIMARY KEY ("id")
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
    "importId" INTEGER,

    CONSTRAINT "FinanceVoucherItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLedgerImport" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceFile" TEXT,
    "sourcePath" TEXT,
    "checksum" TEXT,
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
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceAccountCode" TEXT NOT NULL,
    "abnormalSide" TEXT NOT NULL,
    "targetAccountCode" TEXT NOT NULL,
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
    "periodId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceAccountCode" TEXT NOT NULL,
    "targetAccountCode" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'balance_residual',
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
CREATE TABLE "FinanceStatementAccountMapping" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "statementType" TEXT NOT NULL DEFAULT 'balance',
    "lineCode" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "includeChildren" BOOLEAN NOT NULL DEFAULT true,
    "operator" TEXT NOT NULL DEFAULT 'add',
    "source" TEXT NOT NULL DEFAULT 'default',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementLineConfig" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL DEFAULT 'balanceSheet',
    "lineCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayCode" TEXT NOT NULL DEFAULT '',
    "section" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'debit',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "prefixesJson" TEXT NOT NULL DEFAULT '[]',
    "subtractPrefixesJson" TEXT NOT NULL DEFAULT '[]',
    "formulaJson" TEXT NOT NULL DEFAULT '{}',
    "reclassSource" BOOLEAN NOT NULL DEFAULT false,
    "reclassTarget" BOOLEAN NOT NULL DEFAULT false,
    "isHeader" BOOLEAN NOT NULL DEFAULT false,
    "isTotal" BOOLEAN NOT NULL DEFAULT false,
    "isGrandTotal" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementLineConfig_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "FinanceStatementReview" (
    "id" SERIAL NOT NULL,
    "workpaperId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generatedFromVersion" INTEGER NOT NULL,
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceStatementReviewLine" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "lineCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "systemAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workpaperAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustedAmount" DOUBLE PRECISION,
    "finalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementReviewLine_pkey" PRIMARY KEY ("id")
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
    "okrSnapshotJson" TEXT NOT NULL DEFAULT '{}',
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
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "registeredCapital" TEXT,
    "unifiedCode" TEXT,
    "bankName" TEXT,
    "registeredAddress" TEXT,
    "registeredDate" TEXT,
    "legalPerson" TEXT,
    "managementGroup" TEXT NOT NULL DEFAULT '常规体系',
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
CREATE TABLE "CompanyRelation" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER NOT NULL,
    "childId" INTEGER NOT NULL,
    "shareRatio" DOUBLE PRECISION,
    "isConsolidated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyRelation_pkey" PRIMARY KEY ("id")
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
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOkrControlPolicy_pkey" PRIMARY KEY ("id")
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
    "owningDepartmentId" INTEGER,
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
CREATE INDEX "Contract_endDate_idx" ON "Contract"("endDate");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

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
CREATE INDEX "FinanceDataImport_profile_year_idx" ON "FinanceDataImport"("profile", "year");

-- CreateIndex
CREATE INDEX "FinanceDataImport_sourceFile_idx" ON "FinanceDataImport"("sourceFile");

-- CreateIndex
CREATE INDEX "FinanceShipment_year_month_idx" ON "FinanceShipment"("year", "month");

-- CreateIndex
CREATE INDEX "FinanceShipment_customerName_idx" ON "FinanceShipment"("customerName");

-- CreateIndex
CREATE INDEX "FinanceShipment_productName_idx" ON "FinanceShipment"("productName");

-- CreateIndex
CREATE INDEX "FinanceShipment_employeeId_idx" ON "FinanceShipment"("employeeId");

-- CreateIndex
CREATE INDEX "FinanceSalesSalary_year_month_idx" ON "FinanceSalesSalary"("year", "month");

-- CreateIndex
CREATE INDEX "FinanceSalesSalary_employeeId_idx" ON "FinanceSalesSalary"("employeeId");

-- CreateIndex
CREATE INDEX "FinanceCostStructureRow_year_month_idx" ON "FinanceCostStructureRow"("year", "month");

-- CreateIndex
CREATE INDEX "FinanceCostStructureRow_productName_idx" ON "FinanceCostStructureRow"("productName");

-- CreateIndex
CREATE INDEX "FinanceCostStructureRow_category_idx" ON "FinanceCostStructureRow"("category");

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
CREATE UNIQUE INDEX "FinanceAccount_code_companyCode_year_key" ON "FinanceAccount"("code", "companyCode", "year");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriod_companyCode_year_month_key" ON "FinancePeriod"("companyCode", "year", "month");

-- CreateIndex
CREATE INDEX "FinanceVoucher_periodId_date_companyCode_idx" ON "FinanceVoucher"("periodId", "date", "companyCode");

-- CreateIndex
CREATE INDEX "FinanceVoucher_status_idx" ON "FinanceVoucher"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucher_voucherNo_companyCode_periodId_key" ON "FinanceVoucher"("voucherNo", "companyCode", "periodId");

-- CreateIndex
CREATE INDEX "FinanceVoucherItem_importFingerprint_idx" ON "FinanceVoucherItem"("importFingerprint");

-- CreateIndex
CREATE INDEX "FinanceVoucherItem_importId_idx" ON "FinanceVoucherItem"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucherItem_voucherId_accountId_sortOrder_key" ON "FinanceVoucherItem"("voucherId", "accountId", "sortOrder");

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_companyCode_year_type_idx" ON "FinanceLedgerImport"("companyCode", "year", "type");

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_sourceFile_idx" ON "FinanceLedgerImport"("sourceFile");

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
CREATE INDEX "FinanceReclassRule_companyCode_year_idx" ON "FinanceReclassRule"("companyCode", "year");

-- CreateIndex
CREATE INDEX "FinanceReclassRule_sourceAccountCode_idx" ON "FinanceReclassRule"("sourceAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReclassRule_companyCode_year_sourceAccountCode_abnor_key" ON "FinanceReclassRule"("companyCode", "year", "sourceAccountCode", "abnormalSide");

-- CreateIndex
CREATE INDEX "FinanceReclassItemRule_companyCode_year_sourceAccountCode_idx" ON "FinanceReclassItemRule"("companyCode", "year", "sourceAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReclassItemRule_companyCode_year_sourceAccountCode_m_key" ON "FinanceReclassItemRule"("companyCode", "year", "sourceAccountCode", "matchType", "matchValue");

-- CreateIndex
CREATE INDEX "FinanceBalanceReclassAdjustment_periodId_status_idx" ON "FinanceBalanceReclassAdjustment"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBalanceReclassAdjustment_periodId_sourceAccountCode_key" ON "FinanceBalanceReclassAdjustment"("periodId", "sourceAccountCode");

-- CreateIndex
CREATE INDEX "ReclassResult_periodId_status_idx" ON "ReclassResult"("periodId", "status");

-- CreateIndex
CREATE INDEX "ReclassResult_ruleId_idx" ON "ReclassResult"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "ReclassResult_periodId_voucherItemId_key" ON "ReclassResult"("periodId", "voucherItemId");

-- CreateIndex
CREATE INDEX "FinanceStatementAccountMapping_companyCode_year_statementTy_idx" ON "FinanceStatementAccountMapping"("companyCode", "year", "statementType", "lineCode");

-- CreateIndex
CREATE INDEX "FinanceStatementAccountMapping_companyCode_year_accountCode_idx" ON "FinanceStatementAccountMapping"("companyCode", "year", "accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementAccountMapping_companyCode_year_statementTy_key" ON "FinanceStatementAccountMapping"("companyCode", "year", "statementType", "accountCode");

-- CreateIndex
CREATE INDEX "FinanceStatementLineConfig_companyCode_year_reportType_idx" ON "FinanceStatementLineConfig"("companyCode", "year", "reportType");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementLineConfig_companyCode_year_reportType_line_key" ON "FinanceStatementLineConfig"("companyCode", "year", "reportType", "lineCode");

-- CreateIndex
CREATE INDEX "FinanceStatementWorkpaper_companyCode_year_reportType_idx" ON "FinanceStatementWorkpaper"("companyCode", "year", "reportType");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementWorkpaper_companyCode_year_month_reportType_key" ON "FinanceStatementWorkpaper"("companyCode", "year", "month", "reportType");

-- CreateIndex
CREATE INDEX "FinanceStatementWorkpaperLine_workpaperId_idx" ON "FinanceStatementWorkpaperLine"("workpaperId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementWorkpaperLine_workpaperId_lineCode_key" ON "FinanceStatementWorkpaperLine"("workpaperId", "lineCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementReview_workpaperId_key" ON "FinanceStatementReview"("workpaperId");

-- CreateIndex
CREATE INDEX "FinanceStatementReview_companyCode_year_month_reportType_idx" ON "FinanceStatementReview"("companyCode", "year", "month", "reportType");

-- CreateIndex
CREATE INDEX "FinanceStatementReview_status_idx" ON "FinanceStatementReview"("status");

-- CreateIndex
CREATE INDEX "FinanceStatementReviewLine_reviewId_status_idx" ON "FinanceStatementReviewLine"("reviewId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementReviewLine_reviewId_lineCode_key" ON "FinanceStatementReviewLine"("reviewId", "lineCode");

-- CreateIndex
CREATE INDEX "DepartmentDescription_departmentId_idx" ON "DepartmentDescription"("departmentId");

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
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRelation_parentId_childId_key" ON "CompanyRelation"("parentId", "childId");

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
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_leadingDepartmentId_idx" ON "Project"("leadingDepartmentId");

-- CreateIndex
CREATE INDEX "Project_owningDepartmentId_idx" ON "Project"("owningDepartmentId");

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

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_submitterUserId_fkey" FOREIGN KEY ("submitterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "UserResourceActionGrant" ADD CONSTRAINT "UserResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "UserResourceActionGrant" ADD CONSTRAINT "UserResourceActionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PositionResourceActionGrant" ADD CONSTRAINT "PositionResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PositionResourceActionGrant" ADD CONSTRAINT "PositionResourceActionGrant_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentResourceActionGrant" ADD CONSTRAINT "DepartmentResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentResourceActionGrant" ADD CONSTRAINT "DepartmentResourceActionGrant_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PermissionGrantLedgerEvent" ADD CONSTRAINT "PermissionGrantLedgerEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PermissionGrantLedgerEvent" ADD CONSTRAINT "PermissionGrantLedgerEvent_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DocumentTemplateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceBudgetDept" ADD CONSTRAINT "FinanceBudgetDept_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FinanceBudgetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceBudgetDept" ADD CONSTRAINT "FinanceBudgetDept_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceBudgetRd" ADD CONSTRAINT "FinanceBudgetRd_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FinanceBudgetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceBudgetRd" ADD CONSTRAINT "FinanceBudgetRd_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceShipment" ADD CONSTRAINT "FinanceShipment_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceSalesSalary" ADD CONSTRAINT "FinanceSalesSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceSalesSalary" ADD CONSTRAINT "FinanceSalesSalary_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceCostStructureRow" ADD CONSTRAINT "FinanceCostStructureRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceCostAnalysisRow" ADD CONSTRAINT "FinanceCostAnalysisRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceWorkshopReport" ADD CONSTRAINT "FinanceWorkshopReport_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceWorkshopReport" ADD CONSTRAINT "FinanceWorkshopReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceWorkshopReport" ADD CONSTRAINT "FinanceWorkshopReport_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceVoucher" ADD CONSTRAINT "FinanceVoucher_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceVoucher" ADD CONSTRAINT "FinanceVoucher_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItem" ADD CONSTRAINT "FinanceVoucherItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItem" ADD CONSTRAINT "FinanceVoucherItem_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItem" ADD CONSTRAINT "FinanceVoucherItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceLedgerImport" ADD CONSTRAINT "FinanceLedgerImport_importedBy_fkey" FOREIGN KEY ("importedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceAccountBalance" ADD CONSTRAINT "FinanceAccountBalance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceAccountBalance" ADD CONSTRAINT "FinanceAccountBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshot" ADD CONSTRAINT "FinanceBalanceSnapshot_importedBy_fkey" FOREIGN KEY ("importedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshot" ADD CONSTRAINT "FinanceBalanceSnapshot_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshotRow" ADD CONSTRAINT "FinanceBalanceSnapshotRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FinanceBalanceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshotRow" ADD CONSTRAINT "FinanceBalanceSnapshotRow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceReclassRule" ADD CONSTRAINT "FinanceReclassRule_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ReclassResult" ADD CONSTRAINT "ReclassResult_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ReclassResult" ADD CONSTRAINT "ReclassResult_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ReclassResult" ADD CONSTRAINT "ReclassResult_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "FinanceReclassRule"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ReclassResult" ADD CONSTRAINT "ReclassResult_adjustedBy_fkey" FOREIGN KEY ("adjustedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceStatementWorkpaper" ADD CONSTRAINT "FinanceStatementWorkpaper_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceStatementWorkpaperLine" ADD CONSTRAINT "FinanceStatementWorkpaperLine_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "FinanceStatementWorkpaper"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceStatementReview" ADD CONSTRAINT "FinanceStatementReview_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "FinanceStatementWorkpaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceStatementReview" ADD CONSTRAINT "FinanceStatementReview_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceStatementReview" ADD CONSTRAINT "FinanceStatementReview_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FinanceStatementReviewLine" ADD CONSTRAINT "FinanceStatementReviewLine_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "FinanceStatementReview"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentDescription" ADD CONSTRAINT "DepartmentDescription_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "HrPerformanceReview" ADD CONSTRAINT "HrPerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "CompanyRelation" ADD CONSTRAINT "CompanyRelation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "CompanyRelation" ADD CONSTRAINT "CompanyRelation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerPositionId_fkey" FOREIGN KEY ("managerPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentManagerEmployee" ADD CONSTRAINT "DepartmentManagerEmployee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentManagerEmployee" ADD CONSTRAINT "DepartmentManagerEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_positionDescriptionId_fkey" FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_reportingCompanyId_fkey" FOREIGN KEY ("reportingCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_positionReportOverrideId_fkey" FOREIGN KEY ("positionReportOverrideId") REFERENCES "PositionReportOverride"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PositionReportOverride" ADD CONSTRAINT "PositionReportOverride_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PositionReportOverride" ADD CONSTRAINT "PositionReportOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PositionReportOverride" ADD CONSTRAINT "PositionReportOverride_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PositionReportOverride" ADD CONSTRAINT "PositionReportOverride_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "EditHistory" ADD CONSTRAINT "EditHistory_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "StockRawMaterial" ADD CONSTRAINT "StockRawMaterial_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "StockPackaging" ADD CONSTRAINT "StockPackaging_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "StockFinishedGoods" ADD CONSTRAINT "StockFinishedGoods_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryTagCandidate" ADD CONSTRAINT "LibraryTagCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryTagCandidate" ADD CONSTRAINT "LibraryTagCandidate_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryTagCandidate" ADD CONSTRAINT "LibraryTagCandidate_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "LibraryTag"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryTagCandidate" ADD CONSTRAINT "LibraryTagCandidate_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryEntityMention" ADD CONSTRAINT "LibraryEntityMention_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryEntityMention" ADD CONSTRAINT "LibraryEntityMention_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "LibraryContentChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryMetadataCandidate" ADD CONSTRAINT "LibraryMetadataCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryMetadataCandidate" ADD CONSTRAINT "LibraryMetadataCandidate_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryMetadataCandidate" ADD CONSTRAINT "LibraryMetadataCandidate_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryEvaluationCase" ADD CONSTRAINT "LibraryEvaluationCase_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryEvaluationCase" ADD CONSTRAINT "LibraryEvaluationCase_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryEvaluationEvidence" ADD CONSTRAINT "LibraryEvaluationEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LibraryEvaluationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryEvaluationEvidence" ADD CONSTRAINT "LibraryEvaluationEvidence_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryProcessingJob" ADD CONSTRAINT "LibraryProcessingJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryArtifact" ADD CONSTRAINT "LibraryArtifact_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryArtifact" ADD CONSTRAINT "LibraryArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "LibraryProcessingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryContentChunk" ADD CONSTRAINT "LibraryContentChunk_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryContentChunk" ADD CONSTRAINT "LibraryContentChunk_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "LibraryArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibrarySearchIndex" ADD CONSTRAINT "LibrarySearchIndex_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibrarySearchIndex" ADD CONSTRAINT "LibrarySearchIndex_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "LibraryArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryExportJob" ADD CONSTRAINT "LibraryExportJob_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LibraryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_currentDirectoryId_fkey" FOREIGN KEY ("currentDirectoryId") REFERENCES "LibraryDirectory"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocumentVersion" ADD CONSTRAINT "LibraryDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocumentVersion" ADD CONSTRAINT "LibraryDocumentVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryCategory" ADD CONSTRAINT "LibraryCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LibraryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DueDiligenceRequest" ADD CONSTRAINT "DueDiligenceRequest_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "DueDiligenceParty"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DueDiligenceQuestion" ADD CONSTRAINT "DueDiligenceQuestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DueDiligenceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DueDiligenceMaterialSelection" ADD CONSTRAINT "DueDiligenceMaterialSelection_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DueDiligenceQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DueDiligenceMaterialSelection" ADD CONSTRAINT "DueDiligenceMaterialSelection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DueDiligenceMaterialSelection" ADD CONSTRAINT "DueDiligenceMaterialSelection_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "LibraryDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocumentTag" ADD CONSTRAINT "LibraryDocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocumentTag" ADD CONSTRAINT "LibraryDocumentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "LibraryTag"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LibraryDocumentTag" ADD CONSTRAINT "LibraryDocumentTag_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "OpenApiScope" ADD CONSTRAINT "OpenApiScope_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "OpenApiResource"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "OpenApiClientScopeGrant" ADD CONSTRAINT "OpenApiClientScopeGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OpenApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "OpenApiClientScopeGrant" ADD CONSTRAINT "OpenApiClientScopeGrant_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "OpenApiScope"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "OpenApiAccessLog" ADD CONSTRAINT "OpenApiAccessLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OpenApiClient"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentCollaboration" ADD CONSTRAINT "DepartmentCollaboration_responsibleDepartmentId_fkey" FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentCollaboration" ADD CONSTRAINT "DepartmentCollaboration_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationDepartment" ADD CONSTRAINT "DepartmentCollaborationDepartment_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationDepartment" ADD CONSTRAINT "DepartmentCollaborationDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationDepartment" ADD CONSTRAINT "DepartmentCollaborationDepartment_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationPosition" ADD CONSTRAINT "DepartmentCollaborationPosition_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentCollaborationPosition" ADD CONSTRAINT "DepartmentCollaborationPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingSeries" ADD CONSTRAINT "MeetingSeries_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MeetingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MeetingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MeetingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_secretaryUserId_fkey" FOREIGN KEY ("secretaryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingMinuteEntry" ADD CONSTRAINT "MeetingMinuteEntry_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingMinuteEntry" ADD CONSTRAINT "MeetingMinuteEntry_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingProposal" ADD CONSTRAINT "MeetingProposal_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingProposal" ADD CONSTRAINT "MeetingProposal_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingVote" ADD CONSTRAINT "MeetingVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MeetingProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingVote" ADD CONSTRAINT "MeetingVote_voterUserId_fkey" FOREIGN KEY ("voterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MeetingProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "MeetingDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_linkedWorkItemId_fkey" FOREIGN KEY ("linkedWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "MeetingActionCandidate" ADD CONSTRAINT "MeetingActionCandidate_linkedWorkPlanId_fkey" FOREIGN KEY ("linkedWorkPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlanAlignment" ADD CONSTRAINT "WorkPlanAlignment_childPlanId_fkey" FOREIGN KEY ("childPlanId") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlanAlignment" ADD CONSTRAINT "WorkPlanAlignment_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlanAlignment" ADD CONSTRAINT "WorkPlanAlignment_sourceWorkItemId_fkey" FOREIGN KEY ("sourceWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkOkrCycle" ADD CONSTRAINT "WorkOkrCycle_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkOkrCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkOkrControlPolicy" ADD CONSTRAINT "WorkOkrControlPolicy_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "WorkOkrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadingDepartmentId_fkey" FOREIGN KEY ("leadingDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_owningDepartmentId_fkey" FOREIGN KEY ("owningDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ProjectEnablingDepartment" ADD CONSTRAINT "ProjectEnablingDepartment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ProjectEnablingDepartment" ADD CONSTRAINT "ProjectEnablingDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "EmployeeProject" ADD CONSTRAINT "EmployeeProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "EmployeeProject" ADD CONSTRAINT "EmployeeProject_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ProjectPlanPhase" ADD CONSTRAINT "ProjectPlanPhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ProjectPlanDependency" ADD CONSTRAINT "ProjectPlanDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ProjectPlanBaseline" ADD CONSTRAINT "ProjectPlanBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ProjectPlanBaselineItem" ADD CONSTRAINT "ProjectPlanBaselineItem_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ProjectPlanBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkReportItem" ADD CONSTRAINT "WorkReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WorkReport"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkReportItem" ADD CONSTRAINT "WorkReportItem_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkReportItem" ADD CONSTRAINT "WorkReportItem_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PositionResponsibilityNode" ADD CONSTRAINT "PositionResponsibilityNode_positionDescriptionId_fkey" FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "PositionResponsibilityNode" ADD CONSTRAINT "PositionResponsibilityNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PositionResponsibilityNode"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkResponsibilityReference" ADD CONSTRAINT "WorkResponsibilityReference_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkResponsibilityReference" ADD CONSTRAINT "WorkResponsibilityReference_responsibilityNodeId_fkey" FOREIGN KEY ("responsibilityNodeId") REFERENCES "PositionResponsibilityNode"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_okrCycleId_fkey" FOREIGN KEY ("okrCycleId") REFERENCES "WorkOkrCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_parentPeriodPlanId_fkey" FOREIGN KEY ("parentPeriodPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_previousPeriodPlanId_fkey" FOREIGN KEY ("previousPeriodPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_linkedProjectPhaseId_fkey" FOREIGN KEY ("linkedProjectPhaseId") REFERENCES "ProjectPlanPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourceMeetingId_fkey" FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourceMeetingDecisionId_fkey" FOREIGN KEY ("sourceMeetingDecisionId") REFERENCES "MeetingDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourceMeetingActionCandidateId_fkey" FOREIGN KEY ("sourceMeetingActionCandidateId") REFERENCES "MeetingActionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_sourceDepartmentId_fkey" FOREIGN KEY ("sourceDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_linkedProjectPhaseId_fkey" FOREIGN KEY ("linkedProjectPhaseId") REFERENCES "ProjectPlanPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceMeetingId_fkey" FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceMeetingDecisionId_fkey" FOREIGN KEY ("sourceMeetingDecisionId") REFERENCES "MeetingDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceMeetingActionCandidateId_fkey" FOREIGN KEY ("sourceMeetingActionCandidateId") REFERENCES "MeetingActionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceDepartmentId_fkey" FOREIGN KEY ("sourceDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_parentWorkItemId_fkey" FOREIGN KEY ("parentWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_parentPeriodWorkItemId_fkey" FOREIGN KEY ("parentPeriodWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_previousPeriodWorkItemId_fkey" FOREIGN KEY ("previousPeriodWorkItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkKrEvidence" ADD CONSTRAINT "WorkKrEvidence_krWorkItemId_fkey" FOREIGN KEY ("krWorkItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkKrEvidence" ADD CONSTRAINT "WorkKrEvidence_taskWorkItemId_fkey" FOREIGN KEY ("taskWorkItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "WorkParticipant" ADD CONSTRAINT "WorkParticipant_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentWorkAssignee" ADD CONSTRAINT "DepartmentWorkAssignee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "DepartmentWorkAssignee" ADD CONSTRAINT "DepartmentWorkAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ProjectWorkAssignee" ADD CONSTRAINT "ProjectWorkAssignee_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "ProjectWorkAssignee" ADD CONSTRAINT "ProjectWorkAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- Preserve provider-independent data invariants from the final SQLite schema.
CREATE UNIQUE INDEX "idx_active_budget_version"
ON "FinanceBudgetVersion" ("year", COALESCE("companyCode", ''))
WHERE "status" = 'active';

ALTER TABLE "User"
ADD CONSTRAINT "User_username_nonempty_check"
CHECK (length(btrim("username")) > 0);

ALTER TABLE "LibraryDocument"
ADD CONSTRAINT "LibraryDocument_confidentialityLevel_check"
CHECK ("confidentialityLevel" BETWEEN 0 AND 4);

ALTER TABLE "DepartmentCollaborationPosition"
ADD CONSTRAINT "DepartmentCollaborationPosition_kind_check"
CHECK ("kind" IN ('responsible', 'executor'));
