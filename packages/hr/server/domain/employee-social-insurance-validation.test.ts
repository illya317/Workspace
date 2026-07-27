import assert from "node:assert/strict";
import test from "node:test";

import { buildEmployeeSocialInsuranceCommand } from "./employee-social-insurance-validation";

test("social insurance accepts one company and a YYYY-MM start month", () => {
  assert.deepEqual(buildEmployeeSocialInsuranceCommand({
    kind: "register",
    insuranceStatus: "insured",
    companyId: 12,
    startMonth: "2026-07",
    note: "  首次参保  ",
  }), {
    ok: true,
    data: {
      kind: "register",
      insuranceStatus: "insured",
      companyId: 12,
      startMonth: "2026-07",
      endMonth: null,
      stopReason: null,
      note: "首次参保",
    },
  });
});

test("social insurance rejects day precision and voluntary non-payment reasons", () => {
  const invalidMonth = buildEmployeeSocialInsuranceCommand({
    kind: "register",
    insuranceStatus: "insured",
    companyId: 12,
    startMonth: "2026-07-01",
  });
  assert.equal(invalidMonth.ok, false);
  const invalidReason = buildEmployeeSocialInsuranceCommand({
    kind: "stop",
    periodUid: "f2799f26-64d9-4a28-accc-979abf4e3d9d",
    expectedVersion: 1,
    endMonth: "2026-07",
    stopReason: "员工自愿不缴",
  });
  assert.equal(invalidReason.ok, false);
});

test("social insurance applies required fields by explicit status", () => {
  assert.deepEqual(buildEmployeeSocialInsuranceCommand({
    kind: "register",
    insuranceStatus: "uninsured",
  }), {
    ok: true,
    data: {
      kind: "register",
      insuranceStatus: "uninsured",
      companyId: null,
      startMonth: null,
      endMonth: null,
      stopReason: null,
      note: null,
    },
  });

  const stoppedWithoutEnd = buildEmployeeSocialInsuranceCommand({
    kind: "register",
    insuranceStatus: "stopped",
    companyId: null,
    startMonth: null,
    stopReason: "劳动关系终止",
  });
  assert.equal(stoppedWithoutEnd.ok, false);

  const invalidOptionalMonth = buildEmployeeSocialInsuranceCommand({
    kind: "register",
    insuranceStatus: "retired",
    startMonth: "2026-13",
  });
  assert.equal(invalidOptionalMonth.ok, false);
});

test("social insurance supplement accepts only explicit missing-field patch values", () => {
  assert.deepEqual(buildEmployeeSocialInsuranceCommand({
    kind: "supplement-missing",
    periodUid: "f2799f26-64d9-4a28-accc-979abf4e3d9d",
    expectedVersion: 2,
    patch: { startMonth: "2026-01", stopReason: "劳动关系终止" },
    reason: "  补录纸质档案  ",
  }), {
    ok: true,
    data: {
      kind: "supplement-missing",
      periodUid: "f2799f26-64d9-4a28-accc-979abf4e3d9d",
      expectedVersion: 2,
      patch: { startMonth: "2026-01", stopReason: "劳动关系终止" },
      reason: "补录纸质档案",
    },
  });
  assert.equal(buildEmployeeSocialInsuranceCommand({
    kind: "supplement-missing",
    periodUid: "f2799f26-64d9-4a28-accc-979abf4e3d9d",
    expectedVersion: 2,
    patch: {},
    reason: "补录",
  }).ok, false);
  assert.equal(buildEmployeeSocialInsuranceCommand({
    kind: "supplement-missing",
    periodUid: "f2799f26-64d9-4a28-accc-979abf4e3d9d",
    expectedVersion: 2,
    patch: { note: "绕过" },
    reason: "补录",
  }).ok, false);
});
