INSERT OR IGNORE INTO "FinanceReclassRule" (
  "companyCode",
  "year",
  "sourceAccountCode",
  "abnormalSide",
  "targetAccountCode",
  "enabled",
  "source",
  "createdAt",
  "updatedAt"
)
SELECT
  "companyCode",
  "year",
  "code",
  CASE WHEN "balanceDirection" = 'debit' THEN 'credit' ELSE 'debit' END,
  TRIM("reclassTargetCode"),
  1,
  'manual',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "FinanceAccount"
WHERE "year" IS NOT NULL
  AND "reclassTargetCode" IS NOT NULL
  AND TRIM("reclassTargetCode") <> '';

ALTER TABLE "FinanceAccount" DROP COLUMN "reclassTargetCode";
