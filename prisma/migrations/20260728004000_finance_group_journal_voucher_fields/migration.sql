ALTER TABLE "FinanceConsolidationEntry"
  ADD COLUMN "postingDate" TEXT,
  ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'groupAdjustment',
  ADD COLUMN "postingLevel" TEXT NOT NULL DEFAULT '20';

UPDATE "FinanceConsolidationEntry" AS entry
SET "postingDate" = TO_CHAR(
  (MAKE_DATE(batch."year", batch."month", 1) + INTERVAL '1 month - 1 day')::date,
  'YYYY-MM-DD'
)
FROM "FinanceConsolidationBatch" AS batch
WHERE batch."id" = entry."batchId";

ALTER TABLE "FinanceConsolidationEntry"
  ALTER COLUMN "postingDate" SET NOT NULL;

ALTER TABLE "FinanceConsolidationEntryLine"
  ADD COLUMN "groupAccountId" INTEGER;

ALTER TABLE "FinanceConsolidationEntryLine"
  ADD CONSTRAINT "FinanceConsolidationEntryLine_groupAccountId_fkey"
  FOREIGN KEY ("groupAccountId") REFERENCES "FinanceGroupAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FinanceConsolidationEntry_postingDate_documentType_status_idx"
  ON "FinanceConsolidationEntry"("postingDate", "documentType", "status");

CREATE INDEX "FinanceConsolidationEntryLine_groupAccountId_idx"
  ON "FinanceConsolidationEntryLine"("groupAccountId");
