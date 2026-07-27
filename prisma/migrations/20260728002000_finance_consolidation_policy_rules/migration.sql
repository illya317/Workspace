ALTER TABLE "FinanceGroupAccountRevision"
ADD COLUMN "consolidationRole" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "counterpartyRequirement" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "movementType" TEXT NOT NULL DEFAULT 'closingBalance',
ADD COLUMN "translationRateType" TEXT NOT NULL DEFAULT 'closing';

UPDATE "FinanceGroupAccountRevision"
SET
  "movementType" = CASE
    WHEN "category" IN ('revenue', 'expense', 'cost') THEN 'periodMovement'
    ELSE 'closingBalance'
  END,
  "translationRateType" = CASE
    WHEN "category" IN ('revenue', 'expense', 'cost') THEN 'average'
    ELSE 'closing'
  END;

UPDATE "FinanceGroupAccountRevision"
SET "consolidationRole" = 'intercompanyReceivable', "counterpartyRequirement" = 'required'
WHERE "code" LIKE '1122%' OR "code" LIKE '1221%';

UPDATE "FinanceGroupAccountRevision"
SET "consolidationRole" = 'intercompanyPayable', "counterpartyRequirement" = 'required'
WHERE "code" LIKE '2202%' OR "code" LIKE '2241%';

UPDATE "FinanceGroupAccountRevision"
SET "consolidationRole" = 'investmentInSubsidiary', "counterpartyRequirement" = 'required', "translationRateType" = 'historical'
WHERE "code" LIKE '1511%' OR "code" LIKE '1512%';

UPDATE "FinanceGroupAccountRevision"
SET "consolidationRole" = 'shareCapital', "translationRateType" = 'historical'
WHERE "code" LIKE '4001%' OR "code" LIKE '3001%';

UPDATE "FinanceGroupAccountRevision"
SET "consolidationRole" = 'capitalReserve', "translationRateType" = 'historical'
WHERE "code" LIKE '4002%' OR "code" LIKE '3002%';

UPDATE "FinanceGroupAccountRevision"
SET "reviewStatus" = 'pending_review', "reviewedBy" = NULL, "reviewedAt" = NULL
WHERE "consolidationRole" <> 'none';

UPDATE "FinanceGroupAccount"
SET "reviewStatus" = 'pending_review', "reviewedBy" = NULL, "reviewedAt" = NULL
WHERE "id" IN (
  SELECT DISTINCT "groupAccountId"
  FROM "FinanceGroupAccountRevision"
  WHERE "consolidationRole" <> 'none'
);

CREATE TABLE "FinanceConsolidationRule" (
  "id" SERIAL NOT NULL,
  "policyVersionId" INTEGER NOT NULL,
  "ruleCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ruleType" TEXT NOT NULL,
  "dataBasis" TEXT NOT NULL,
  "matchMode" TEXT NOT NULL,
  "amountMode" TEXT NOT NULL,
  "postingSide" TEXT NOT NULL DEFAULT 'both',
  "differenceHandling" TEXT NOT NULL DEFAULT 'exception',
  "toleranceAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "currencyRateType" TEXT NOT NULL DEFAULT 'source',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "sourceKind" TEXT NOT NULL DEFAULT 'manual',
  "note" TEXT,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceConsolidationRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceConsolidationRule_version_code_key"
ON "FinanceConsolidationRule"("policyVersionId", "ruleCode");

CREATE INDEX "FinanceConsolidationRule_version_enabled_priority_idx"
ON "FinanceConsolidationRule"("policyVersionId", "enabled", "priority");

ALTER TABLE "FinanceConsolidationRule"
ADD CONSTRAINT "FinanceConsolidationRule_policyVersionId_fkey"
FOREIGN KEY ("policyVersionId") REFERENCES "FinanceAccountingPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinanceConsolidationRuleSelector" (
  "id" SERIAL NOT NULL,
  "ruleId" INTEGER NOT NULL,
  "side" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "selectorType" TEXT NOT NULL,
  "consolidationRole" TEXT,
  "groupAccountId" INTEGER,
  "includeChildren" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceConsolidationRuleSelector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceConsolidationRuleSelector_rule_side_sequence_key"
ON "FinanceConsolidationRuleSelector"("ruleId", "side", "sequence");

CREATE INDEX "FinanceConsolidationRuleSelector_group_account_idx"
ON "FinanceConsolidationRuleSelector"("groupAccountId");

ALTER TABLE "FinanceConsolidationRuleSelector"
ADD CONSTRAINT "FinanceConsolidationRuleSelector_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "FinanceConsolidationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinanceConsolidationRuleSelector"
ADD CONSTRAINT "FinanceConsolidationRuleSelector_groupAccountId_fkey"
FOREIGN KEY ("groupAccountId") REFERENCES "FinanceGroupAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "FinanceConsolidationRule" (
  "policyVersionId", "ruleCode", "name", "ruleType", "dataBasis", "matchMode", "amountMode",
  "postingSide", "differenceHandling", "toleranceAmount", "currencyRateType", "enabled", "priority", "sourceKind", "note"
)
SELECT
  version."id", 'IC-BALANCE', '集团往来余额抵销', 'intercompanyBalance', 'closingBalance',
  'partnerAggregate', 'lowerOfTwoSides', 'both', 'exception', 0.01, 'source', TRUE, 10, 'systemDefault',
  '按交易对手维度汇总集团内应收与应付；双方一致才生成抵销分录，差额保留为本期例外。'
FROM "FinanceAccountingPolicyVersion" AS version;

INSERT INTO "FinanceConsolidationRule" (
  "policyVersionId", "ruleCode", "name", "ruleType", "dataBasis", "matchMode", "amountMode",
  "postingSide", "differenceHandling", "toleranceAmount", "currencyRateType", "enabled", "priority", "sourceKind", "note"
)
SELECT
  version."id", 'INVESTMENT-EQUITY', '长期股权投资与权益抵销', 'investmentEquity', 'voucher',
  'ownershipChain', 'lowerOfTwoSides', 'both', 'exception', 0.01, 'historical', TRUE, 20, 'systemDefault',
  '按冻结持股链匹配投资方长期股权投资与被投资方实收资本、资本公积；缺少历史成本或持股证据时保留例外。'
FROM "FinanceAccountingPolicyVersion" AS version;

INSERT INTO "FinanceConsolidationRuleSelector" (
  "ruleId", "side", "sequence", "selectorType", "consolidationRole", "includeChildren"
)
SELECT rule."id", selector."side", selector."sequence", 'role', selector."role", TRUE
FROM "FinanceConsolidationRule" AS rule
CROSS JOIN (VALUES
  ('left', 1, 'intercompanyReceivable'),
  ('right', 1, 'intercompanyPayable')
) AS selector("side", "sequence", "role")
WHERE rule."ruleCode" = 'IC-BALANCE';

INSERT INTO "FinanceConsolidationRuleSelector" (
  "ruleId", "side", "sequence", "selectorType", "consolidationRole", "includeChildren"
)
SELECT rule."id", selector."side", selector."sequence", 'role', selector."role", TRUE
FROM "FinanceConsolidationRule" AS rule
CROSS JOIN (VALUES
  ('left', 1, 'investmentInSubsidiary'),
  ('right', 1, 'shareCapital'),
  ('right', 2, 'capitalReserve')
) AS selector("side", "sequence", "role")
WHERE rule."ruleCode" = 'INVESTMENT-EQUITY';

ALTER TABLE "FinanceConsolidationAdjustmentRule" RENAME TO "FinanceConsolidationAdjustmentResult";
ALTER TABLE "FinanceConsolidationAdjustmentResult" RENAME COLUMN "ruleCode" TO "resultCode";
ALTER TABLE "FinanceConsolidationAdjustmentResult" ADD COLUMN "sourceRuleId" INTEGER;

ALTER INDEX "FinanceConsolidationAdjustmentRule_batchId_ruleCode_key"
RENAME TO "FinanceConsolidationAdjustmentResult_batchId_resultCode_key";
ALTER INDEX "FinanceConsolidationAdjustmentRule_batchId_status_category_idx"
RENAME TO "FinanceConsolidationAdjustmentResult_batchId_status_category_idx";
ALTER TABLE "FinanceConsolidationAdjustmentResult"
RENAME CONSTRAINT "FinanceConsolidationAdjustmentRule_pkey" TO "FinanceConsolidationAdjustmentResult_pkey";
ALTER TABLE "FinanceConsolidationAdjustmentResult"
RENAME CONSTRAINT "FinanceConsolidationAdjustmentRule_batchId_fkey" TO "FinanceConsolidationAdjustmentResult_batchId_fkey";

CREATE INDEX "FinanceConsolidationAdjustmentResult_sourceRuleId_idx"
ON "FinanceConsolidationAdjustmentResult"("sourceRuleId");

ALTER TABLE "FinanceConsolidationAdjustmentResult"
ADD CONSTRAINT "FinanceConsolidationAdjustmentResult_sourceRuleId_fkey"
FOREIGN KEY ("sourceRuleId") REFERENCES "FinanceConsolidationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceConsolidationAdjustmentRuleLine" RENAME TO "FinanceConsolidationAdjustmentResultLine";
ALTER TABLE "FinanceConsolidationAdjustmentResultLine" RENAME COLUMN "ruleId" TO "resultId";

ALTER INDEX "FinanceConsolidationAdjustmentRuleLine_ruleId_lineNo_key"
RENAME TO "FinanceConsolidationAdjustmentResultLine_resultId_lineNo_key";
ALTER INDEX "FinanceConsolidationAdjustmentRuleLine_ruleId_statementType_idx"
RENAME TO "FinanceConsolidationAdjustmentResultLine_resultId_statementType_idx";
ALTER TABLE "FinanceConsolidationAdjustmentResultLine"
RENAME CONSTRAINT "FinanceConsolidationAdjustmentRuleLine_pkey" TO "FinanceConsolidationAdjustmentResultLine_pkey";
ALTER TABLE "FinanceConsolidationAdjustmentResultLine"
RENAME CONSTRAINT "FinanceConsolidationAdjustmentRuleLine_ruleId_fkey" TO "FinanceConsolidationAdjustmentResultLine_resultId_fkey";
