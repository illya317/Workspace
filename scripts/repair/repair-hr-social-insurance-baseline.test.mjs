import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExistingSocialInsuranceRowsMatch,
  buildHrSocialInsuranceBaselinePlan,
} from "./repair-hr-social-insurance-baseline.mjs";

test("social insurance baseline persists known status without inventing months", () => {
  const plan = buildHrSocialInsuranceBaselinePlan([{
    employmentId: 1,
    employeeId: 2,
    contracts: JSON.stringify([
      { company: "测试公司", insuranceStatus: "已参保" },
      { company: "外部主体", insuranceStatus: "已停保" },
      { insuranceStatus: "未参保" },
    ]),
  }], [{ id: 9, name: "测试公司" }]);
  assert.equal(plan.summary.rows, 3);
  assert.deepEqual(plan.rows[0], {
    employeeId: 2,
    employmentId: 1,
    sourceRef: plan.rows[0].sourceRef,
    insuranceStatus: "insured",
    companyId: 9,
    companyNameSnapshot: "测试公司",
    startMonth: null,
    endMonth: null,
    stopReason: null,
    missingFields: ["startMonth"],
    rawRecord: { company: "测试公司", insuranceStatus: "已参保" },
    fieldProjection: plan.rows[0].fieldProjection,
  });
  assert.deepEqual(plan.rows[1].missingFields, ["companyId", "startMonth", "endMonth", "stopReason"]);
  assert.deepEqual(plan.rows[2].missingFields, []);
});

test("social insurance baseline quarantines a missing required status instead of dropping the source item", () => {
  const raw = { company: "测试公司", insuranceStatus: null, legacyNote: "必须保留" };
  const plan = buildHrSocialInsuranceBaselinePlan([{
    employmentId: 1,
    employeeId: 2,
    contracts: JSON.stringify([raw]),
  }], [{ id: 9, name: "测试公司" }]);
  assert.equal(plan.summary.sourceItems, 1);
  assert.equal(plan.summary.rows, 0);
  assert.equal(plan.summary.quarantined, 1);
  assert.deepEqual(plan.quarantine[0].rawRecord, raw);
  assert.deepEqual(plan.quarantine[0].missingFields, ["insuranceStatus"]);
});

test("social insurance baseline adopts only an exactly matching governed legacy baseline", () => {
  const planned = {
    sourceRef: "employment:10:abc:social-insurance",
    employeeId: 20,
    insuranceStatus: "insured",
    companyId: 9,
    companyNameSnapshot: "测试公司",
    startMonth: null,
    endMonth: null,
    stopReason: null,
    missingFields: ["startMonth"],
  };
  const existing = {
    sourceRef: planned.sourceRef,
    employeeId: planned.employeeId,
    insuranceStatus: planned.insuranceStatus,
    companyId: planned.companyId,
    companyNameSnapshot: planned.companyNameSnapshot,
    startMonth: planned.startMonth,
    endMonth: planned.endMonth,
    stopReason: planned.stopReason,
    missingFieldsJson: JSON.stringify(planned.missingFields),
  };
  assert.doesNotThrow(() => assertExistingSocialInsuranceRowsMatch([existing], [planned]));
  assert.throws(() => assertExistingSocialInsuranceRowsMatch([{ ...existing, companyId: 10 }], [planned]), /differs/);
});
