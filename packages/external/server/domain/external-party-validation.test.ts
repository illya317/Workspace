import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExternalPartyCreateCommand,
  buildExternalPartyUpdateCommand,
} from "./external-party-validation";

test("splits legal subject fields from customer role fields", () => {
  const result = buildExternalPartyCreateCommand("customer", {
    subjectType: "organization",
    relatedPartyType: "group",
    code: " C-001 ",
    name: " 示例公司 ",
    identityNumber: " 9132x ",
    contactPerson: " 客户联系人 ",
    creditDays: 30,
    isActive: true,
  }, 7);

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
    isActive: true,
  });
});

test("accepts an explicit existing subject when adding a second role", () => {
  const result = buildExternalPartyCreateCommand("supplier", {
    existingPartyId: 42,
    code: "V-009",
    name: "示例公司",
  }, 7);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.existingPartyId, 42);
});

test("keeps aggregate version mandatory for role updates", () => {
  const result = buildExternalPartyUpdateCommand(42, "supplier", { code: "V-010" }, 7);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "expectedVersion");
});
