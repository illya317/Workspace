import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExternalPartyAggregateTouchInput,
  buildExternalPartyCreateCommand,
  buildExternalPartyUpdateCommand,
} from "./external-party-validation";

test("validates aggregate touch identifiers before persistence", () => {
  assert.doesNotThrow(() => assertExternalPartyAggregateTouchInput({ partyId: 1, expectedVersion: 2, userId: 3 }));
  assert.throws(
    () => assertExternalPartyAggregateTouchInput({ partyId: 0, expectedVersion: 2, userId: 3 }),
    /partyId 必须是正整数/,
  );
});

test("splits legal subject fields from customer role fields", () => {
  const result = buildExternalPartyCreateCommand("customer", {
    subjectType: "organization",
    relatedPartyType: "group",
    code: " C-001 ",
    name: " 示例公司 ",
    identityNumber: " 9132x ",
    contactPerson: " 客户联系人 ",
    creditDays: 30,
    availabilityFrom: "2026-08-01",
  }, 7, "create-customer-1");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.subjectData, {
    subjectType: "organization",
    relatedPartyType: "group",
    name: "示例公司",
    identityNumber: "9132X",
  });
  assert.deepEqual(result.data.roleData, {
    code: "C-001",
    contactPerson: "客户联系人",
    creditDays: 30,
  });
  assert.equal(result.data.availabilityFrom, "2026-08-01");
  assert.equal(result.data.availabilityThrough, null);
});

test("accepts an explicit existing subject when adding a second role", () => {
  const result = buildExternalPartyCreateCommand("supplier", {
    existingPartyId: 42,
    code: "V-009",
    name: "示例公司",
    identityNumber: "9132X",
  }, 7, "create-supplier-42");

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.existingPartyId, 42);
});

test("allows create commands to leave the role code for server allocation", () => {
  const result = buildExternalPartyCreateCommand("supplier", {
    code: "",
    name: "自动编号供应商",
    identityNumber: "9132AUTO",
  }, 7, "create-supplier-auto");

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.roleData.code, "");
});

test("requires a unified code or identity number for a new role record", () => {
  const result = buildExternalPartyCreateCommand("customer", {
    code: "C-002",
    name: "缺少统一代码的单位",
    identityNumber: "",
  }, 7, "create-customer-2");

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "identityNumber");
});

test("keeps aggregate version mandatory for role updates", () => {
  const result = buildExternalPartyUpdateCommand(42, "supplier", { code: "V-010" }, 7, undefined, "update-supplier-42");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "expectedVersion");
});
