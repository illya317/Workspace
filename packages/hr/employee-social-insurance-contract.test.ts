import assert from "node:assert/strict";
import test from "node:test";

import {
  employeeSocialInsuranceCurrentStatus,
  employeeSocialInsuranceFieldRequired,
  employeeSocialInsuranceRegistrationCompany,
  EMPLOYEE_SOCIAL_INSURANCE_BASELINE_POLICY,
} from "./employee-social-insurance-contract";

test("social insurance required fields are conditional on the recorded status", () => {
  assert.equal(employeeSocialInsuranceFieldRequired({ operation: "register", status: "insured", field: "companyId" }), true);
  assert.equal(employeeSocialInsuranceFieldRequired({ operation: "register", status: "uninsured", field: "companyId" }), false);
  assert.equal(employeeSocialInsuranceFieldRequired({ operation: "register", status: "retired", field: "startMonth" }), false);
});

test("social insurance baseline persists known status while marking missing facts", () => {
  assert.equal(EMPLOYEE_SOCIAL_INSURANCE_BASELINE_POLICY.knownStatus, "persist");
  assert.equal(EMPLOYEE_SOCIAL_INSURANCE_BASELINE_POLICY.missingMonth, "nullable-with-quality-marker");
});

test("registration suggests the latest dated historical social-insurance company", () => {
  const rows = [
    { companyId: 11, companyName: "丰华制药", startMonth: null, endMonth: null },
    { companyId: 9, companyName: "丰华天力通", startMonth: "2025-01", endMonth: "2026-06" },
    { companyId: 10, companyName: "丰华生物", startMonth: "2024-01", endMonth: "2024-12" },
  ];
  assert.deepEqual(employeeSocialInsuranceRegistrationCompany(rows), {
    companyId: 9,
    companyName: "丰华天力通",
  });
  assert.deepEqual(employeeSocialInsuranceRegistrationCompany(rows.map((row) => ({
    ...row,
    startMonth: null,
    endMonth: null,
  }))), {
    companyId: 11,
    companyName: "丰华制药",
  });
});

test("known retirement remains the current status when there is no active insured record", () => {
  assert.equal(employeeSocialInsuranceCurrentStatus([
    { insuranceStatus: "stopped" as const },
    { insuranceStatus: "retired" as const },
    { insuranceStatus: "uninsured" as const },
  ])?.insuranceStatus, "retired");
  assert.equal(employeeSocialInsuranceCurrentStatus([
    { insuranceStatus: "retired" as const },
    { insuranceStatus: "insured" as const },
  ])?.insuranceStatus, "insured");
});
