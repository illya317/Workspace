import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@workspace/platform/server/prisma";
import {
  buildContractLegalSnapshot,
  contractSnapshotProjection,
  mergeContractLegalSnapshot,
  parseContractLegalSnapshot,
} from "./contract-lifecycle-records";
import { buildContractData } from "./domain/administration-contract-validation";

function legacyContract() {
  return {
    contractNo: "LEGACY-001",
    name: "旧精度合同",
    partyA: "甲方",
    partyB: "乙方",
    shareholder: null,
    categoryId: 1,
    content: null,
    owningCompanyId: null,
    ownerDepartmentId: null,
    partyAId: null,
    partyBId: null,
    handlerEmployeeId: null,
    signedOn: new Date("2024-05-01T00:00:00.000Z"),
    expiresOn: null,
    signedOnPrecision: "month",
    expiresOnPrecision: null,
    legacySignDateRaw: "2024年5月",
    legacyEndDateRaw: "长期",
    amount: new Prisma.Decimal("100.00"),
    executedAmount: null,
    currencyCode: "CNY",
    confidentialityLevel: 2,
    location: null,
    remark: null,
  };
}

function normalizedFullForm(signedOn = "2024-05-01") {
  const normalized = buildContractData({
    contractNo: "LEGACY-001",
    name: "旧精度合同",
    partyA: "甲方",
    partyB: "乙方",
    shareholder: null,
    categoryId: 1,
    content: null,
    owningCompanyId: null,
    ownerDepartmentId: null,
    partyAId: null,
    partyBId: null,
    handlerEmployeeId: null,
    signedOn,
    expiresOn: null,
    amount: "100.00",
    executedAmount: null,
    currencyCode: "CNY",
    confidentialityLevel: 2,
    location: null,
    remark: "只修改备注",
  }, {
    owningCompanyId: null,
    ownerDepartmentId: null,
    partyAId: null,
    partyBId: null,
    handlerEmployeeId: null,
  });
  if (!normalized.ok) throw new Error(normalized.issue.message);
  assert.equal(normalized.ok, true);
  return normalized.data;
}

test("normalized full-form correction preserves unchanged legacy date precision and raw display text", () => {
  const normalized = normalizedFullForm();
  assert.equal(normalized.signedOnPrecision, "day", "domain normalization sees the full date field");
  assert.equal(normalized.legacySignDateRaw, null);
  const snapshot = mergeContractLegalSnapshot(legacyContract(), normalized);
  assert.equal(snapshot.signedOnPrecision, "month");
  assert.equal(snapshot.legacySignDateRaw, "2024年5月");
  assert.equal(snapshot.legacyEndDateRaw, "长期");
  const projection = contractSnapshotProjection(snapshot);
  assert.equal(projection.signedOnPrecision, "month");
  assert.equal(projection.legacySignDateRaw, "2024年5月");
  assert.equal(projection.legacyEndDateRaw, "长期");
});

test("editing a date deliberately upgrades precision and clears its legacy raw value", () => {
  const snapshot = mergeContractLegalSnapshot(legacyContract(), normalizedFullForm("2024-05-16"));
  assert.equal(snapshot.signedOn, "2024-05-16");
  assert.equal(snapshot.signedOnPrecision, "day");
  assert.equal(snapshot.legacySignDateRaw, null);
});

test("version 1 snapshots without precision fields preserve the current anchor projection", () => {
  const legacySnapshot = buildContractLegalSnapshot(legacyContract());
  delete legacySnapshot.signedOnPrecision;
  delete legacySnapshot.expiresOnPrecision;
  delete legacySnapshot.legacySignDateRaw;
  delete legacySnapshot.legacyEndDateRaw;
  const parsed = parseContractLegalSnapshot(legacySnapshot as unknown as Prisma.JsonObject);
  assert.ok(parsed);
  const projection = contractSnapshotProjection(parsed);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, "signedOnPrecision"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, "expiresOnPrecision"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, "legacySignDateRaw"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, "legacyEndDateRaw"), false);
});
