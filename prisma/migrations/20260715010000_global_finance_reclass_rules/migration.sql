BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "FinanceReclassRule"
    GROUP BY "sourceAccountCode", "abnormalSide"
    HAVING COUNT(DISTINCT "targetAccountCode") > 1
  ) THEN
    RAISE EXCEPTION 'Cannot globalize FinanceReclassRule: conflicting targets exist for the same source account and abnormal side';
  END IF;
END $$;

CREATE TEMP TABLE "_FinanceReclassRuleCanonical" ON COMMIT DROP AS
SELECT
  "id",
  FIRST_VALUE("id") OVER (
    PARTITION BY "sourceAccountCode", "abnormalSide"
    ORDER BY
      CASE "source" WHEN 'manual' THEN 0 WHEN 'auto' THEN 1 WHEN 'suggested' THEN 2 ELSE 3 END,
      "confirmedAt" DESC NULLS LAST,
      "updatedAt" DESC,
      "id"
  ) AS "canonicalId"
FROM "FinanceReclassRule";

UPDATE "ReclassResult" AS result
SET "ruleId" = mapping."canonicalId"
FROM "_FinanceReclassRuleCanonical" AS mapping
WHERE result."ruleId" = mapping."id"
  AND mapping."id" <> mapping."canonicalId";

DELETE FROM "FinanceReclassRule" AS rule
USING "_FinanceReclassRuleCanonical" AS mapping
WHERE rule."id" = mapping."id"
  AND mapping."id" <> mapping."canonicalId";

DROP INDEX IF EXISTS "FinanceReclassRule_companyCode_year_sourceAccountCode_abnor_key";
DROP INDEX IF EXISTS "FinanceReclassRule_companyCode_year_idx";

ALTER TABLE "FinanceReclassRule"
  DROP COLUMN "companyCode",
  DROP COLUMN "year";

CREATE UNIQUE INDEX "FinanceReclassRule_sourceAccountCode_abnormalSide_key"
ON "FinanceReclassRule"("sourceAccountCode", "abnormalSide");

COMMIT;
