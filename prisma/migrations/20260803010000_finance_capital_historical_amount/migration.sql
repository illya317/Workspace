-- workspace:migration-mode=expand

ALTER TABLE "FinanceVoucherItem"
  ADD COLUMN "capitalHistoricalAmountCny" DECIMAL(20,2),
  ADD COLUMN "capitalEvidenceKind" TEXT,
  ADD COLUMN "capitalEvidence" TEXT;

ALTER TABLE "FinanceAccountBalance"
  ADD COLUMN "capitalHistoricalAmountCny" DECIMAL(20,2),
  ADD COLUMN "capitalEvidenceKind" TEXT,
  ADD COLUMN "capitalEvidence" TEXT;

ALTER TABLE "FinanceVoucherItem"
  ADD CONSTRAINT "FinanceVoucherItem_capital_historical_evidence_check"
  CHECK (
    ("capitalHistoricalAmountCny" IS NULL AND "capitalEvidenceKind" IS NULL AND "capitalEvidence" IS NULL)
    OR (
      "capitalHistoricalAmountCny" > 0
      AND "capitalEvidenceKind" IN ('openingVoucher', 'cumulativeVoucher')
      AND length(btrim("capitalEvidence")) > 0
    )
  );

ALTER TABLE "FinanceAccountBalance"
  ADD CONSTRAINT "FinanceAccountBalance_capital_historical_evidence_check"
  CHECK (
    ("capitalHistoricalAmountCny" IS NULL AND "capitalEvidenceKind" IS NULL AND "capitalEvidence" IS NULL)
    OR (
      "capitalHistoricalAmountCny" > 0
      AND "capitalEvidenceKind" = 'openingBalance'
      AND length(btrim("capitalEvidence")) > 0
    )
  );
