-- workspace:migration-mode=maintenance

ALTER TABLE "FinanceLedgerImport"
  ADD COLUMN "sourcePackageId" INTEGER,
  ADD COLUMN "sourceLedgerMappingId" INTEGER;

ALTER TABLE "FinanceVoucher"
  ADD COLUMN "voucherTypeCode" TEXT,
  ADD COLUMN "voucherTypeName" TEXT,
  ADD COLUMN "isAdjustment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "preparerName" TEXT,
  ADD COLUMN "reviewerName" TEXT,
  ADD COLUMN "posterName" TEXT,
  ADD COLUMN "cashierName" TEXT,
  ADD COLUMN "attachmentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sourcePosted" BOOLEAN,
  ADD COLUMN "sourceAudited" BOOLEAN,
  ADD COLUMN "sourceInvalid" BOOLEAN,
  ADD COLUMN "externalSourceSystem" TEXT,
  ADD COLUMN "externalSourceDocumentNo" TEXT,
  ADD COLUMN "externalSourceDocumentId" TEXT,
  ADD COLUMN "externalSourceAccountSet" TEXT,
  ADD COLUMN "externalSourceDate" TEXT,
  ADD COLUMN "sourceMetadata" JSONB;

ALTER TABLE "FinanceVoucherItem"
  ADD COLUMN "settlementStyle" TEXT,
  ADD COLUMN "settlementNo" TEXT,
  ADD COLUMN "settlementDate" TEXT,
  ADD COLUMN "sourceMetadata" JSONB;

ALTER TABLE "FinanceOpenItem"
  ADD COLUMN "originType" TEXT,
  ADD COLUMN "sourcePeriodBeginDetailId" TEXT;

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

CREATE TABLE "FinanceSourcePeriodStatus" (
  "id" SERIAL NOT NULL,
  "importId" INTEGER NOT NULL,
  "periodId" INTEGER NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "glMonthEnd" BOOLEAN,
  "accountingClosed" BOOLEAN,
  "moduleStatuses" JSONB NOT NULL,
  "derivationVersion" TEXT NOT NULL DEFAULT 't6-bAccClosed-v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceSourcePeriodStatus_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX "FinanceReadableSourcePackage_packageKey_key" ON "FinanceReadableSourcePackage"("packageKey");
CREATE INDEX "FinanceReadableSourcePackage_sourceSystem_snapshotDate_idx" ON "FinanceReadableSourcePackage"("sourceSystem", "snapshotDate");
CREATE INDEX "FinanceReadableSourcePackage_selectedDatabaseChecksum_idx" ON "FinanceReadableSourcePackage"("selectedDatabaseChecksum");
CREATE UNIQUE INDEX "FinanceSourceLedgerMapping_companyCode_sourceSystem_sourceL_key" ON "FinanceSourceLedgerMapping"("companyCode", "sourceSystem", "sourceLedger", "effectiveFromYear");
CREATE INDEX "FinanceSourceLedgerMapping_companyCode_effectiveFromYear_ef_idx" ON "FinanceSourceLedgerMapping"("companyCode", "effectiveFromYear", "effectiveToYear");
CREATE UNIQUE INDEX "FinanceReadableImportRun_runKey_key" ON "FinanceReadableImportRun"("runKey");
CREATE INDEX "FinanceReadableImportRun_ledgerImportId_startedAt_idx" ON "FinanceReadableImportRun"("ledgerImportId", "startedAt");
CREATE INDEX "FinanceReadableImportRun_sourcePackageId_idx" ON "FinanceReadableImportRun"("sourcePackageId");
CREATE UNIQUE INDEX "FinanceAccountAuxiliaryRequirement_accountId_dimensionType_key" ON "FinanceAccountAuxiliaryRequirement"("accountId", "dimensionType");
CREATE INDEX "FinanceAccountAuxiliaryRequirement_importId_idx" ON "FinanceAccountAuxiliaryRequirement"("importId");
CREATE UNIQUE INDEX "FinanceSourcePeriodStatus_importId_periodId_key" ON "FinanceSourcePeriodStatus"("importId", "periodId");
CREATE INDEX "FinanceSourcePeriodStatus_periodId_accountingClosed_idx" ON "FinanceSourcePeriodStatus"("periodId", "accountingClosed");
CREATE UNIQUE INDEX "FinanceSourceSubsystemStatus_importId_subsystemCode_key" ON "FinanceSourceSubsystemStatus"("importId", "subsystemCode");
CREATE INDEX "FinanceSourceSubsystemStatus_subsystemCode_isYearClosed_idx" ON "FinanceSourceSubsystemStatus"("subsystemCode", "isYearClosed");
CREATE UNIQUE INDEX "FinanceAccountLineage_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceAccountLineage"("sourceSystem", "sourceDatabase", "sourceKey");
CREATE INDEX "FinanceAccountLineage_importId_idx" ON "FinanceAccountLineage"("importId");
CREATE INDEX "FinanceAccountLineage_previousAccountId_currentAccountId_idx" ON "FinanceAccountLineage"("previousAccountId", "currentAccountId");
CREATE UNIQUE INDEX "FinanceConsolidationMatchGroup_entryId_key" ON "FinanceConsolidationMatchGroup"("entryId");
CREATE UNIQUE INDEX "FinanceConsolidationMatchGroup_batchId_generationKey_key" ON "FinanceConsolidationMatchGroup"("batchId", "generationKey");
CREATE INDEX "FinanceConsolidationMatchGroup_batchId_category_status_idx" ON "FinanceConsolidationMatchGroup"("batchId", "category", "status");
CREATE INDEX "FinanceConsolidationMatchGroup_leftEntitySnapshotId_rightEn_idx" ON "FinanceConsolidationMatchGroup"("leftEntitySnapshotId", "rightEntitySnapshotId");
CREATE UNIQUE INDEX "FinanceConsolidationMatchSource_matchGroupId_voucherItemId_key" ON "FinanceConsolidationMatchSource"("matchGroupId", "voucherItemId");
CREATE INDEX "FinanceConsolidationMatchSource_voucherItemId_idx" ON "FinanceConsolidationMatchSource"("voucherItemId");
CREATE INDEX "FinanceConsolidationMatchSource_entitySnapshotId_counterpar_idx" ON "FinanceConsolidationMatchSource"("entitySnapshotId", "counterpartyEntitySnapshotId");
CREATE INDEX "FinanceLedgerImport_sourcePackageId_idx" ON "FinanceLedgerImport"("sourcePackageId");
CREATE INDEX "FinanceLedgerImport_sourceLedgerMappingId_idx" ON "FinanceLedgerImport"("sourceLedgerMappingId");

ALTER TABLE "FinanceLedgerImport" ADD CONSTRAINT "FinanceLedgerImport_sourcePackageId_fkey" FOREIGN KEY ("sourcePackageId") REFERENCES "FinanceReadableSourcePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerImport" ADD CONSTRAINT "FinanceLedgerImport_sourceLedgerMappingId_fkey" FOREIGN KEY ("sourceLedgerMappingId") REFERENCES "FinanceSourceLedgerMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReadableImportRun" ADD CONSTRAINT "FinanceReadableImportRun_ledgerImportId_fkey" FOREIGN KEY ("ledgerImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceReadableImportRun" ADD CONSTRAINT "FinanceReadableImportRun_sourcePackageId_fkey" FOREIGN KEY ("sourcePackageId") REFERENCES "FinanceReadableSourcePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAccountAuxiliaryRequirement" ADD CONSTRAINT "FinanceAccountAuxiliaryRequirement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceAccountAuxiliaryRequirement" ADD CONSTRAINT "FinanceAccountAuxiliaryRequirement_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceSourcePeriodStatus" ADD CONSTRAINT "FinanceSourcePeriodStatus_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceSourcePeriodStatus" ADD CONSTRAINT "FinanceSourcePeriodStatus_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceSourceSubsystemStatus" ADD CONSTRAINT "FinanceSourceSubsystemStatus_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceAccountLineage" ADD CONSTRAINT "FinanceAccountLineage_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceAccountLineage" ADD CONSTRAINT "FinanceAccountLineage_currentAccountId_fkey" FOREIGN KEY ("currentAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAccountLineage" ADD CONSTRAINT "FinanceAccountLineage_previousAccountId_fkey" FOREIGN KEY ("previousAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceConsolidationMatchGroup" ADD CONSTRAINT "FinanceConsolidationMatchGroup_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceConsolidationMatchGroup" ADD CONSTRAINT "FinanceConsolidationMatchGroup_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FinanceConsolidationEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceConsolidationMatchGroup" ADD CONSTRAINT "FinanceConsolidationMatchGroup_leftEntitySnapshotId_fkey" FOREIGN KEY ("leftEntitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceConsolidationMatchGroup" ADD CONSTRAINT "FinanceConsolidationMatchGroup_rightEntitySnapshotId_fkey" FOREIGN KEY ("rightEntitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceConsolidationMatchSource" ADD CONSTRAINT "FinanceConsolidationMatchSource_matchGroupId_fkey" FOREIGN KEY ("matchGroupId") REFERENCES "FinanceConsolidationMatchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceConsolidationMatchSource" ADD CONSTRAINT "FinanceConsolidationMatchSource_entitySnapshotId_fkey" FOREIGN KEY ("entitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceConsolidationMatchSource" ADD CONSTRAINT "FinanceConsolidationMatchSource_counterpartyEntitySnapshot_fkey" FOREIGN KEY ("counterpartyEntitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceConsolidationMatchSource" ADD CONSTRAINT "FinanceConsolidationMatchSource_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
