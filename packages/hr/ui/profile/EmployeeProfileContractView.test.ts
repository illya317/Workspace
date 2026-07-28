import assert from "node:assert/strict";
import test from "node:test";

import { agreementChoiceLabel } from "./EmployeeProfileContractView";

test("agreement choices use business identity and expiry instead of internal version", () => {
  const term = {
    sequence: 1,
    recordState: "confirmed" as const,
    temporalState: "current" as const,
    termKind: "initial" as const,
    effectiveFrom: "2026-01-01",
    effectiveThrough: "2028-12-31" as string | null,
  };
  const base = {
    company: "丰华天力通",
    isPrimary: false,
    expiryDate: "2028-12-31",
    terms: [term],
  } as const;
  assert.equal(
    agreementChoiceLabel({ ...base, contractType: "返聘协议" }),
    "丰华天力通 · 返聘协议 · 到期日期 2028-12-31",
  );
  assert.equal(
    agreementChoiceLabel({ ...base, contractType: "劳动合同", expiryDate: "2030-04-15", terms: [{ ...term, sequence: 2, termKind: "renewal", effectiveFrom: "2029-01-01", effectiveThrough: "2030-04-15" }] }),
    "丰华天力通 · 劳动合同 · 到期日期 2030-04-15",
  );
});

test("agreement choices distinguish missing expiry from an indefinite term", () => {
  const base = {
    company: "丰华制药",
    contractType: "劳动合同",
    isPrimary: true,
    expiryDate: null,
  };
  const semantic = {
    sequence: 1,
    recordState: "confirmed" as const,
    temporalState: "current" as const,
    effectiveFrom: "2017-12-28",
    effectiveThrough: null,
  };
  assert.equal(
    agreementChoiceLabel({ ...base, terms: [{ ...semantic, termKind: "initial" as const }] }),
    "丰华制药 · 劳动合同 · 到期日期待补充",
  );
  assert.equal(
    agreementChoiceLabel({ ...base, terms: [{ ...semantic, termKind: "permanent" as const }] }),
    "丰华制药 · 劳动合同 · 无固定期限",
  );
});
