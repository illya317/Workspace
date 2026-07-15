BEGIN;

-- 没有确认人或确认时间的历史 manual 标记不能视为人工确认。
UPDATE "ReclassResult" AS result
SET "ruleId" = NULL
FROM "FinanceReclassRule" AS rule
WHERE result."ruleId" = rule."id"
  AND (rule."confirmedBy" IS NULL OR rule."confirmedAt" IS NULL);

UPDATE "FinanceBalanceReclassAdjustment" AS adjustment
SET "ruleId" = NULL
FROM "FinanceReclassRule" AS rule
WHERE adjustment."ruleId" = rule."id"
  AND (rule."confirmedBy" IS NULL OR rule."confirmedAt" IS NULL);

DELETE FROM "FinanceReclassRule"
WHERE "confirmedBy" IS NULL
   OR "confirmedAt" IS NULL;

COMMIT;
