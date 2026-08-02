import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacyAgreementRows,
  inspectLegacyEmploymentAgreements,
} from "./employment-agreement-legacy";

test("legacy rows use content fingerprints instead of synthetic numeric ids", () => {
  const [row] = buildLegacyAgreementRows([{
    id: 8,
    contracts: JSON.stringify([{ company: "测试公司", firstContractStartDate: "2026-01-01" }]),
    employee: { employeeId: "E001", name: "测试员工" },
  }], "2026-07-27");
  assert.match(row.id, /^legacy:8:[0-9a-f]{24}:1$/);
  assert.equal(row.source, "legacy-json");
  assert.equal(row.temporalState, "current");
});

test("preflight refuses to guess identities for duplicate legacy records", () => {
  const record = { company: "测试公司", firstContractStartDate: "2026-01-01" };
  const issues = inspectLegacyEmploymentAgreements({ id: 9, contracts: JSON.stringify([record, record]) });
  assert.equal(issues.some((issue) => issue.code === "legacy.duplicate_record"), true);
});

test("preflight reports invalid JSON without dropping the evidence silently", () => {
  assert.deepEqual(inspectLegacyEmploymentAgreements({ id: 10, contracts: "{" }), [{
    code: "legacy.invalid_json",
    employmentId: 10,
    detail: "contracts 不是合法 JSON",
  }]);
});
