import assert from "node:assert/strict";
import test from "node:test";

import { projectExternalParty, type ExternalPartyWithRoles } from "./external-party-projection";

test("projects the same subject id through both L2 roles without mixing role fields", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "unrelated" },
    name: "同一主体",
    fullName: "同一主体有限公司",
    identityNumber: "9132X",
    legalRepresentative: "张三",
    editedBy: 7,
    editedAt: timestamp,
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    externalRoles: [
      role(1, 12, "customer", "C-001", "客户联系人", 30, timestamp),
      role(2, 12, "supplier", "V-009", "供应商联系人", 60, timestamp),
    ],
  } as ExternalPartyWithRoles;

  const customer = projectExternalParty(party, "customer", ["customer", "supplier"]);
  const supplier = projectExternalParty(party, "supplier", ["customer", "supplier"]);

  assert.equal(customer?.id, 12);
  assert.equal(supplier?.id, 12);
  assert.deepEqual(customer?.roles, ["customer", "supplier"]);
  assert.equal(customer?.code, "C-001");
  assert.equal(customer?.contactPerson, "客户联系人");
  assert.equal(customer?.creditDays, 30);
  assert.equal(supplier?.code, "V-009");
  assert.equal(supplier?.contactPerson, "供应商联系人");
  assert.equal(supplier?.creditDays, 60);
});

test("hides role metadata outside the visible permission set", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "unrelated" },
    name: "同一主体",
    fullName: null,
    identityNumber: "P-001",
    legalRepresentative: null,
    editedBy: 7,
    editedAt: timestamp,
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    externalRoles: [
      role(1, 12, "customer", "C-001", "客户联系人", 30, timestamp),
      role(2, 12, "supplier", "V-009", "供应商联系人", 60, timestamp),
    ],
  } as ExternalPartyWithRoles;

  assert.deepEqual(projectExternalParty(party, "customer")?.roles, ["customer"]);
});

function role(
  id: number,
  partyId: number,
  category: string,
  code: string,
  contactPerson: string,
  creditDays: number,
  timestamp: Date,
) {
  return {
    id,
    partyId,
    category,
    code,
    classification: null,
    contactPerson,
    phone: null,
    email: null,
    bankName: null,
    bankAccount: null,
    address: null,
    invoiceTitle: null,
    invoiceAddressPhone: null,
    settlementTerms: null,
    creditLimit: null,
    creditDays,
    taxRate: null,
    remark: null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
