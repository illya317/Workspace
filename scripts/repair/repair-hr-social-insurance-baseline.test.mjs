import assert from "node:assert/strict";
import test from "node:test";

import { buildHrSocialInsuranceBaselinePlan } from "./repair-hr-social-insurance-baseline.mjs";

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
  });
  assert.deepEqual(plan.rows[1].missingFields, ["companyId", "startMonth", "endMonth", "stopReason"]);
  assert.deepEqual(plan.rows[2].missingFields, []);
});
