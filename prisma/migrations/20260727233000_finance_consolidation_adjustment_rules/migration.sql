CREATE TABLE "FinanceConsolidationAdjustmentRule" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "calculationBasis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "evidence" TEXT NOT NULL,
    "sourceDocument" TEXT,
    "createdBy" INTEGER NOT NULL,
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationAdjustmentRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceConsolidationAdjustmentRuleLine" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "statementType" TEXT NOT NULL,
    "lineCode" TEXT NOT NULL,
    "periodBasis" TEXT NOT NULL DEFAULT 'current',
    "applicationMode" TEXT NOT NULL DEFAULT 'calculation',
    "amount" DECIMAL(20,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationAdjustmentRuleLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceConsolidationAdjustmentRule_batchId_ruleCode_key"
ON "FinanceConsolidationAdjustmentRule"("batchId", "ruleCode");

CREATE INDEX "FinanceConsolidationAdjustmentRule_batchId_status_category_idx"
ON "FinanceConsolidationAdjustmentRule"("batchId", "status", "category");

CREATE UNIQUE INDEX "FinanceConsolidationAdjustmentRuleLine_ruleId_lineNo_key"
ON "FinanceConsolidationAdjustmentRuleLine"("ruleId", "lineNo");

CREATE INDEX "FinanceConsolidationAdjustmentRuleLine_ruleId_statementType_periodBasis_idx"
ON "FinanceConsolidationAdjustmentRuleLine"("ruleId", "statementType", "periodBasis");

ALTER TABLE "FinanceConsolidationAdjustmentRule"
ADD CONSTRAINT "FinanceConsolidationAdjustmentRule_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinanceConsolidationAdjustmentRuleLine"
ADD CONSTRAINT "FinanceConsolidationAdjustmentRuleLine_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "FinanceConsolidationAdjustmentRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
