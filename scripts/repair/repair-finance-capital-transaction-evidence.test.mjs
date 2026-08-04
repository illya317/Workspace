import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeCapitalTransactionEvidence,
  validateFinanceCapitalTransactionEvidenceInput,
} from "./repair-finance-capital-transaction-evidence.mjs";

const fact = {
  companyCode: "ZX01",
  accountCode: "1511",
  voucherDate: "2025-03-31",
  voucherNo: "2025-03-记-0007",
  bookedAmountCny: 500,
  originalCurrency: "CAD",
  originalAmount: 100,
  contributionDate: "2025-03-14",
  targetCompanyCode: "ZX05",
  targetLineCode: "capitalReserve",
  label: "境外公司资本公积",
  evidence: "经复核的出资记录",
};

test("capital transaction evidence input accepts a strict voucher target", () => {
  const input = validateFinanceCapitalTransactionEvidenceInput({
    kind: "finance-capital-transaction-evidence",
    schemaVersion: 1,
    facts: [fact],
  });
  assert.equal(input.facts[0]?.originalAmount, 100);
});

test("capital transaction evidence merges matching facts without removing imported metadata", () => {
  assert.deepEqual(mergeCapitalTransactionEvidence({ ccode_equal: "1511" }, fact), {
    ccode_equal: "1511",
    evidence: {
      actualContributionDate: "2025-03-14",
      matching: {
        label: "境外公司资本公积",
        companyCode: "ZX05",
        lineCode: "capitalReserve",
        currencyCode: "CAD",
        originalAmount: 100,
      },
      capitalTransactionEvidence: "经复核的出资记录",
    },
  });
});

test("capital transaction evidence refuses to overwrite different matching evidence", () => {
  assert.throws(() => mergeCapitalTransactionEvidence({
    evidence: {
      actualContributionDate: "2025-03-14",
      matching: {
        label: "另一权益行",
        companyCode: "ZX05",
        lineCode: "paidInCapital",
        currencyCode: "CAD",
        originalAmount: 100,
      },
    },
  }, fact), /different capital matching evidence/);
});

test("capital transaction evidence rejects duplicate voucher targets", () => {
  assert.throws(() => validateFinanceCapitalTransactionEvidenceInput({
    kind: "finance-capital-transaction-evidence",
    schemaVersion: 1,
    facts: [fact, { ...fact }],
  }), /duplicate targets/);
});
