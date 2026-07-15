BEGIN;

-- 自动或默认规则不再构成人工结论；先清理其派生结果，再删除规则。
UPDATE "ReclassResult" AS result
SET "ruleId" = NULL
FROM "FinanceReclassRule" AS rule
WHERE result."ruleId" = rule."id"
  AND rule."source" <> 'manual';

DELETE FROM "FinanceBalanceReclassAdjustment" AS adjustment
WHERE adjustment."sourceType" = 'auxiliary_balance'
  AND adjustment."status" = 'approved'
  AND (
    adjustment."ruleId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "FinanceReclassRule" AS rule
      WHERE rule."id" = adjustment."ruleId"
        AND rule."source" <> 'manual'
    )
  );

DELETE FROM "FinanceReclassRule"
WHERE "source" <> 'manual';

ALTER TABLE "FinanceReclassRule"
  ALTER COLUMN "targetAccountCode" DROP NOT NULL,
  ADD COLUMN "decision" TEXT NOT NULL DEFAULT 'reclassify';

ALTER TABLE "FinanceReclassRule"
  ADD CONSTRAINT "FinanceReclassRule_decision_target_check"
  CHECK (
    ("decision" = 'reclassify' AND "targetAccountCode" IS NOT NULL)
    OR ("decision" = 'no_reclass' AND "targetAccountCode" IS NULL)
  );

COMMIT;
