import assert from "node:assert/strict";
import test from "node:test";

import { agreementChoiceLabel } from "./EmployeeProfileContractView";

test("agreement choices use business identity and expiry instead of internal version", () => {
  const base = {
    company: "丰华天力通",
    isPrimary: false,
    expiryDate: "2028-12-31",
    terms: [{ recordState: "confirmed", termKind: "initial", effectiveThrough: "2028-12-31" }],
  } as const;
  assert.equal(
    agreementChoiceLabel({ ...base, contractType: "返聘协议" }),
    "丰华天力通 · 返聘协议 · 到期日期 2028-12-31",
  );
  assert.equal(
    agreementChoiceLabel({ ...base, contractType: "劳动合同", expiryDate: "2030-04-15", terms: [{ recordState: "confirmed", termKind: "renewal", effectiveThrough: "2030-04-15" }] }),
    "丰华天力通 · 劳动合同 · 到期日期 2030-04-15",
  );
});
