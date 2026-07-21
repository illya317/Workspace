-- workspace:migration-mode=maintenance

ALTER TABLE "FinanceConsolidationEntryLine"
  ADD COLUMN "entitySnapshotId" INTEGER,
  ADD COLUMN "counterpartyEntitySnapshotId" INTEGER,
  ADD COLUMN "sourceSnapshotId" INTEGER,
  ADD COLUMN "sourceAuxiliaryBalanceId" INTEGER,
  ADD COLUMN "sourceOpenItemId" INTEGER,
  ADD COLUMN "sourceCashFlowAllocationId" INTEGER,
  ADD COLUMN "sourceVoucherItemId" INTEGER;

UPDATE "FinanceConsolidationEntryLine" AS line
SET "entitySnapshotId" = entity.id
FROM "FinanceConsolidationEntry" AS entry,
     "FinanceConsolidationEntitySnapshot" AS entity
WHERE entry.id = line."entryId"
  AND entity."batchId" = entry."batchId"
  AND entity."companyId" = line."companyId";

UPDATE "FinanceConsolidationEntryLine" AS line
SET "counterpartyEntitySnapshotId" = entity.id
FROM "FinanceConsolidationEntry" AS entry,
     "FinanceConsolidationEntitySnapshot" AS entity
WHERE entry.id = line."entryId"
  AND entity."batchId" = entry."batchId"
  AND entity."companyId" = line."counterpartyCompanyId";

ALTER TABLE "FinanceConsolidationEntryLine"
  ALTER COLUMN "entitySnapshotId" SET NOT NULL;

DROP INDEX IF EXISTS "FinanceConsolidationEntryLine_companyId_statementType_lineCode_idx";

CREATE INDEX "FinanceConsolidationEntryLine_entitySnapshotId_statementType_lineCode_idx"
  ON "FinanceConsolidationEntryLine"("entitySnapshotId", "statementType", "lineCode");
CREATE INDEX "FinanceConsolidationEntryLine_counterpartyEntitySnapshotId_idx"
  ON "FinanceConsolidationEntryLine"("counterpartyEntitySnapshotId");
CREATE INDEX "FinanceConsolidationEntryLine_sourceSnapshotId_idx"
  ON "FinanceConsolidationEntryLine"("sourceSnapshotId");
CREATE INDEX "FinanceConsolidationEntryLine_sourceAuxiliaryBalanceId_idx"
  ON "FinanceConsolidationEntryLine"("sourceAuxiliaryBalanceId");
CREATE INDEX "FinanceConsolidationEntryLine_sourceOpenItemId_idx"
  ON "FinanceConsolidationEntryLine"("sourceOpenItemId");
CREATE INDEX "FinanceConsolidationEntryLine_sourceCashFlowAllocationId_idx"
  ON "FinanceConsolidationEntryLine"("sourceCashFlowAllocationId");
CREATE INDEX "FinanceConsolidationEntryLine_sourceVoucherItemId_idx"
  ON "FinanceConsolidationEntryLine"("sourceVoucherItemId");

ALTER TABLE "FinanceConsolidationEntryLine"
  ADD CONSTRAINT "FinanceConsolidationEntryLine_entitySnapshotId_fkey"
    FOREIGN KEY ("entitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceConsolidationEntryLine_counterpartyEntitySnapshotId_fkey"
    FOREIGN KEY ("counterpartyEntitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceSnapshotId_fkey"
    FOREIGN KEY ("sourceSnapshotId") REFERENCES "FinanceConsolidationSourceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceAuxiliaryBalanceId_fkey"
    FOREIGN KEY ("sourceAuxiliaryBalanceId") REFERENCES "FinanceAuxiliaryBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceOpenItemId_fkey"
    FOREIGN KEY ("sourceOpenItemId") REFERENCES "FinanceOpenItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceCashFlowAllocationId_fkey"
    FOREIGN KEY ("sourceCashFlowAllocationId") REFERENCES "FinanceCashFlowAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceVoucherItemId_fkey"
    FOREIGN KEY ("sourceVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
