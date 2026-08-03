-- workspace:migration-mode=expand

ALTER TABLE "FinanceVoucherItem"
  DROP CONSTRAINT "FinanceVoucherItem_capital_historical_evidence_check";

ALTER TABLE "FinanceVoucherItem"
  ADD CONSTRAINT "FinanceVoucherItem_capital_historical_evidence_check"
  CHECK (
    ("capitalHistoricalAmountCny" IS NULL AND "capitalEvidenceKind" IS NULL AND "capitalEvidence" IS NULL)
    OR (
      "capitalHistoricalAmountCny" > 0
      AND "capitalEvidenceKind" IN ('voucher', 'openingVoucher', 'cumulativeVoucher')
      AND length(btrim("capitalEvidence")) > 0
    )
  );
