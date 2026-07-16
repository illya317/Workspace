-- workspace:migration-mode=maintenance
BEGIN;

ALTER TABLE "FinanceConsolidationEntry"
ADD COLUMN "matchDifference" DECIMAL(20,2),
ADD COLUMN "differenceResolution" TEXT;

ALTER TABLE "FinanceConsolidationEntryLine"
ADD COLUMN "matchSide" TEXT,
ADD COLUMN "sourceKind" TEXT,
ADD COLUMN "sourceId" TEXT,
ADD COLUMN "sourceFingerprint" TEXT,
ADD COLUMN "sourceAmount" DECIMAL(20,2),
ADD COLUMN "sourceCurrency" TEXT,
ADD COLUMN "counterpartyCompanyId" INTEGER,
ADD COLUMN "periodBasis" TEXT NOT NULL DEFAULT 'current';

ALTER TABLE "FinanceConsolidationTaxEffect"
ADD COLUMN "entitySnapshotId" INTEGER,
ADD COLUMN "jurisdiction" TEXT,
ADD COLUMN "recognitionLocation" TEXT,
ADD COLUMN "balanceSheetLineCode" TEXT,
ADD COLUMN "counterpartLineCode" TEXT,
ADD COLUMN "periodBasis" TEXT NOT NULL DEFAULT 'current';

ALTER TABLE "FinanceConsolidationEntry"
ADD CONSTRAINT "FinanceConsolidationEntry_matchDifference_check"
CHECK ("matchDifference" IS NULL OR "matchDifference" >= 0);

ALTER TABLE "FinanceConsolidationEntryLine"
ADD CONSTRAINT "FinanceConsolidationEntryLine_matchSide_check"
CHECK ("matchSide" IS NULL OR "matchSide" IN ('left', 'right')),
ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceKind_check"
CHECK ("sourceKind" IS NULL OR "sourceKind" IN ('auxiliaryBalance', 'openItem', 'cashFlowAllocation', 'workpaper', 'voucher', 'other')),
ADD CONSTRAINT "FinanceConsolidationEntryLine_sourceAmount_check"
CHECK ("sourceAmount" IS NULL OR "sourceAmount" > 0),
ADD CONSTRAINT "FinanceConsolidationEntryLine_periodBasis_check"
CHECK ("periodBasis" IN ('current', 'comparative'));

ALTER TABLE "FinanceConsolidationTaxEffect"
ADD CONSTRAINT "FinanceConsolidationTaxEffect_recognitionLocation_check"
CHECK ("recognitionLocation" IS NULL OR "recognitionLocation" IN ('profitOrLoss', 'otherComprehensiveIncome', 'equity')),
ADD CONSTRAINT "FinanceConsolidationTaxEffect_periodBasis_check"
CHECK ("periodBasis" IN ('current', 'comparative')),
ADD CONSTRAINT "FinanceConsolidationTaxEffect_entitySnapshotId_fkey"
FOREIGN KEY ("entitySnapshotId") REFERENCES "FinanceConsolidationEntitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FinanceConsolidationTaxEffect_entitySnapshotId_recognitionL_idx"
ON "FinanceConsolidationTaxEffect"("entitySnapshotId", "recognitionLocation");

COMMIT;
