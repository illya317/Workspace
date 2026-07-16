-- workspace:migration-mode=expand
BEGIN;

CREATE TABLE "FinanceConsolidationBatch" (
  "id" SERIAL NOT NULL,
  "parentCompanyId" INTEGER NOT NULL,
  "parentCompanyCode" TEXT NOT NULL,
  "parentCompanyName" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
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
  "verifiedBy" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "applications" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceConsolidationRateSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceConsolidationEntry" (
  "id" SERIAL NOT NULL,
  "batchId" INTEGER NOT NULL,
  "entryNo" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "evidence" TEXT NOT NULL,
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

CREATE TABLE "FinanceConsolidationEntryLine" (
  "id" SERIAL NOT NULL,
  "entryId" INTEGER NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "companyCode" TEXT NOT NULL,
  "statementType" TEXT NOT NULL,
  "lineCode" TEXT NOT NULL,
  "accountCode" TEXT,
  "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceConsolidationEntryLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceConsolidationTaxEffect" (
  "id" SERIAL NOT NULL,
  "entryId" INTEGER NOT NULL,
  "effectKey" TEXT NOT NULL,
  "taxEffectType" TEXT NOT NULL,
  "differenceAmount" DECIMAL(20,2) NOT NULL,
  "taxRate" DECIMAL(12,8) NOT NULL,
  "recognition" TEXT NOT NULL,
  "reversalPeriod" TEXT,
  "recoverabilityConclusion" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "preparedBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceConsolidationTaxEffect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceConsolidationBatch_parentCompanyId_year_month_versio_key"
ON "FinanceConsolidationBatch"("parentCompanyId", "year", "month", "version");
CREATE INDEX "FinanceConsolidationBatch_parentCompanyId_year_month_status_idx"
ON "FinanceConsolidationBatch"("parentCompanyId", "year", "month", "status");
CREATE INDEX "FinanceConsolidationBatch_baseBatchId_idx"
ON "FinanceConsolidationBatch"("baseBatchId");

CREATE INDEX "FinanceConsolidationBatchEvent_batchId_createdAt_idx"
ON "FinanceConsolidationBatchEvent"("batchId", "createdAt");
CREATE UNIQUE INDEX "FinanceConsolidationBatchEvent_batchId_batchRevision_key"
ON "FinanceConsolidationBatchEvent"("batchId", "batchRevision");
CREATE INDEX "FinanceConsolidationBatchEvent_batchId_action_idx"
ON "FinanceConsolidationBatchEvent"("batchId", "action");

CREATE UNIQUE INDEX "FinanceConsolidationEntitySnapshot_batchId_companyId_key"
ON "FinanceConsolidationEntitySnapshot"("batchId", "companyId");
CREATE INDEX "FinanceConsolidationEntitySnapshot_batchId_role_idx"
ON "FinanceConsolidationEntitySnapshot"("batchId", "role");

CREATE UNIQUE INDEX "FinanceConsolidationControlDecision_batchId_controlKey_key"
ON "FinanceConsolidationControlDecision"("batchId", "controlKey");
CREATE INDEX "FinanceConsolidationControlDecision_batchId_decision_idx"
ON "FinanceConsolidationControlDecision"("batchId", "decision");

CREATE UNIQUE INDEX "FinanceConsolidationSourceSnapshot_batchId_entitySnapshotId_key"
ON "FinanceConsolidationSourceSnapshot"("batchId", "entitySnapshotId", "reportType");
CREATE INDEX "FinanceConsolidationSourceSnapshot_workpaperId_workpaperVer_idx"
ON "FinanceConsolidationSourceSnapshot"("workpaperId", "workpaperVersion");

CREATE UNIQUE INDEX "FinanceConsolidationRateSnapshot_batchId_exchangeRateId_key"
ON "FinanceConsolidationRateSnapshot"("batchId", "exchangeRateId");
CREATE INDEX "FinanceConsolidationRateSnapshot_batchId_rateKind_rateDate_idx"
ON "FinanceConsolidationRateSnapshot"("batchId", "rateKind", "rateDate");

CREATE UNIQUE INDEX "FinanceConsolidationEntry_batchId_entryNo_key"
ON "FinanceConsolidationEntry"("batchId", "entryNo");
CREATE UNIQUE INDEX "FinanceConsolidationEntry_supersedesEntryId_key"
ON "FinanceConsolidationEntry"("supersedesEntryId");
CREATE UNIQUE INDEX "FinanceConsolidationEntry_reversalOfEntryId_key"
ON "FinanceConsolidationEntry"("reversalOfEntryId");
CREATE UNIQUE INDEX "FinanceConsolidationEntry_predecessorEntryId_key"
ON "FinanceConsolidationEntry"("predecessorEntryId");
CREATE INDEX "FinanceConsolidationEntry_batchId_status_entryType_idx"
ON "FinanceConsolidationEntry"("batchId", "status", "entryType");
CREATE INDEX "FinanceConsolidationEntry_supersedesEntryId_idx"
ON "FinanceConsolidationEntry"("supersedesEntryId");
CREATE INDEX "FinanceConsolidationEntry_reversalOfEntryId_idx"
ON "FinanceConsolidationEntry"("reversalOfEntryId");
CREATE INDEX "FinanceConsolidationEntry_predecessorEntryId_idx"
ON "FinanceConsolidationEntry"("predecessorEntryId");

CREATE UNIQUE INDEX "FinanceConsolidationEntryLine_entryId_lineNo_key"
ON "FinanceConsolidationEntryLine"("entryId", "lineNo");
CREATE INDEX "FinanceConsolidationEntryLine_companyId_statementType_lineC_idx"
ON "FinanceConsolidationEntryLine"("companyId", "statementType", "lineCode");

CREATE UNIQUE INDEX "FinanceConsolidationTaxEffect_entryId_effectKey_key"
ON "FinanceConsolidationTaxEffect"("entryId", "effectKey");
CREATE INDEX "FinanceConsolidationTaxEffect_entryId_taxEffectType_idx"
ON "FinanceConsolidationTaxEffect"("entryId", "taxEffectType");

ALTER TABLE "FinanceConsolidationBatch"
ADD CONSTRAINT "FinanceConsolidationBatch_baseBatchId_fkey"
FOREIGN KEY ("baseBatchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FinanceConsolidationBatchEvent"
ADD CONSTRAINT "FinanceConsolidationBatchEvent_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FinanceConsolidationEntitySnapshot"
ADD CONSTRAINT "FinanceConsolidationEntitySnapshot_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FinanceConsolidationControlDecision"
ADD CONSTRAINT "FinanceConsolidationControlDecision_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FinanceConsolidationSourceSnapshot"
ADD CONSTRAINT "FinanceConsolidationSourceSnapshot_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationSourceSnapshot"
ADD CONSTRAINT "FinanceConsolidationSourceSnapshot_entitySnapshotId_fkey"
FOREIGN KEY ("entitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FinanceConsolidationRateSnapshot"
ADD CONSTRAINT "FinanceConsolidationRateSnapshot_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FinanceConsolidationEntry"
ADD CONSTRAINT "FinanceConsolidationEntry_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntry"
ADD CONSTRAINT "FinanceConsolidationEntry_supersedesEntryId_fkey"
FOREIGN KEY ("supersedesEntryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntry"
ADD CONSTRAINT "FinanceConsolidationEntry_reversalOfEntryId_fkey"
FOREIGN KEY ("reversalOfEntryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntry"
ADD CONSTRAINT "FinanceConsolidationEntry_predecessorEntryId_fkey"
FOREIGN KEY ("predecessorEntryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceConsolidationEntry"
ADD CONSTRAINT "FinanceConsolidationEntry_lineage_consistency_check"
CHECK (
  NOT ("supersedesEntryId" IS NOT NULL AND "reversalOfEntryId" IS NOT NULL)
  AND "predecessorEntryId" IS NOT DISTINCT FROM COALESCE("supersedesEntryId", "reversalOfEntryId")
);

ALTER TABLE "FinanceConsolidationEntryLine"
ADD CONSTRAINT "FinanceConsolidationEntryLine_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FinanceConsolidationTaxEffect"
ADD CONSTRAINT "FinanceConsolidationTaxEffect_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

COMMIT;
