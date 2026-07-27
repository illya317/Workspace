import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildEmploymentAgreementBaselinePlan,
  validateHrEmploymentAgreementBaselineInput,
} from "./repair-hr-employment-agreement-baseline.mjs";

function source(contracts, overrides = {}) {
  return { employmentId: 10, employeeId: 20, expectedVersion: 1, contracts, ...overrides };
}

test("agreement baseline preserves overlapping renewal dates as confirmed facts", () => {
  const contracts = JSON.stringify([{
    company: "测试公司",
    firstContractStartDate: "2025-01-01",
    firstContractEndDate: "2026-12-31",
    secondContractStartDate: "2026-10-01",
    secondContractEndDate: "2027-09-30",
  }]);
  const plan = buildEmploymentAgreementBaselinePlan([source(contracts)]);
  assert.equal(plan.summary.agreements, 1);
  assert.equal(plan.summary.terms, 2);
  assert.equal(plan.summary.incompleteAgreements, 0);
  assert.deepEqual(plan.agreements[0].terms.map((term) => term.recordState), ["confirmed", "confirmed"]);
});

test("agreement baseline persists missing fields separately from business validity", () => {
  const contracts = JSON.stringify([{ company: "测试公司", contractType: "固定期限" }]);
  const plan = buildEmploymentAgreementBaselinePlan([source(contracts)]);
  assert.equal(plan.summary.incompleteAgreements, 1);
  assert.deepEqual(plan.agreements[0].terms, [{
    sequence: 1,
    termKind: "initial",
    effectiveFrom: null,
    effectiveThrough: null,
    recordState: "confirmed",
  }]);
  assert.deepEqual(plan.agreements[0].dataQuality.missingFields, [
    "content.employmentForm",
    "content.legalRelation",
    "terms.1.effectiveThrough",
    "terms.1.effectiveFrom",
  ].sort());
});

test("agreement baseline records optional missing content without marking the agreement incomplete", () => {
  const contracts = JSON.stringify([{
    company: "测试公司",
    firstContractStartDate: "2026-01-01",
    firstContractEndDate: "2028-12-31",
  }]);
  const plan = buildEmploymentAgreementBaselinePlan([source(contracts)]);
  assert.deepEqual(plan.agreements[0].dataQuality.missingFields, [
    "content.contractType",
    "content.employmentForm",
    "content.legalRelation",
  ]);
  assert.equal(plan.agreements[0].incomplete, false);
});

test("agreement baseline input pins every source version and JSON digest", () => {
  const contracts = JSON.stringify([{ company: "测试公司" }]);
  const sources = [source(contracts, { contractsSha256: createHash("sha256").update(contracts).digest("hex") })];
  const value = {
    schemaVersion: 1,
    kind: "hr-employment-agreement-baseline",
    baselineKey: "2026-07-27-production-v1",
    actorUserId: 2,
    expected: { employments: 1, agreements: 1, terms: 1, incompleteAgreements: 1, incompleteTerms: 1 },
    sources: sources.map(({ contracts: _contracts, ...item }) => item),
  };
  assert.equal(validateHrEmploymentAgreementBaselineInput(value).baselineKey, value.baselineKey);
  assert.throws(() => validateHrEmploymentAgreementBaselineInput({
    ...value,
    sources: [{ ...value.sources[0], contractsSha256: "bad" }],
  }), /invalid or duplicate employment/);
});
