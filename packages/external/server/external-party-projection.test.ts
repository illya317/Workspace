import assert from "node:assert/strict";
import test from "node:test";

import { projectExternalParty, type ExternalPartyWithRoles } from "./external-party-projection";
import {
  projectExternalRelatedParty,
  projectExternalRelatedPartyCandidate,
} from "./related-party-projection";

test("projects the same subject id through both L2 roles without mixing role fields", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "unrelated" },
    company: null,
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
    ownedInterests: [],
    legalFactRevisions: [legalFact(1, timestamp)],
  } as ExternalPartyWithRoles & { ownedInterests: [] };

  const customer = projectExternalParty(party, "customer", ["customer", "supplier"], "2026-07-14");
  const supplier = projectExternalParty(party, "supplier", ["customer", "supplier"], "2026-07-14");

  assert.equal(customer?.id, 12);
  assert.equal(supplier?.id, 12);
  assert.deepEqual(customer?.roles, ["customer", "supplier"]);
  assert.equal(customer?.code, "C-001");
  assert.equal(customer?.contactPerson, "客户联系人");
  assert.equal(customer?.creditDays, 30);
  assert.equal(supplier?.code, "V-009");
  assert.equal(supplier?.contactPerson, "供应商联系人");
  assert.equal(supplier?.creditDays, 60);
  assert.equal(customer?.legalFactRevision, 1);
});

test("hides role metadata outside the visible permission set", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "unrelated" },
    company: null,
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
    ownedInterests: [],
    legalFactRevisions: [legalFact(1, timestamp)],
  } as ExternalPartyWithRoles & { ownedInterests: [] };

  assert.deepEqual(projectExternalParty(party, "customer", ["customer"], "2026-07-14")?.roles, ["customer"]);
});

test("projects a related-party directory row without role-specific business fields", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "investor_influence" },
    company: null,
    name: "控制方",
    fullName: "控制方有限公司",
    identityNumber: "9132X",
    legalRepresentative: "张三",
    editedBy: 7,
    editedAt: timestamp,
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    externalRoles: [
      role(1, 12, "customer", "C-001", "不应进入名录", 30, timestamp),
      role(2, 12, "supplier", "V-009", "不应进入名录", 60, timestamp),
    ],
    ownedInterests: [],
    legalFactRevisions: [legalFact(1, timestamp)],
  } as ExternalPartyWithRoles & { ownedInterests: [] };

  const relatedParty = projectExternalRelatedParty(party, "2026-07-14");

  assert.equal(relatedParty?.relatedPartyType, "investor_influence");
  assert.equal(relatedParty?.targetKind, "party");
  assert.equal(relatedParty?.version, 3);
  assert.equal(relatedParty?.systemConfigured, false);
  assert.deepEqual(relatedParty?.roles, ["customer", "supplier"]);
  assert.equal("contactPerson" in (relatedParty ?? {}), false);
  assert.equal("bankAccount" in (relatedParty ?? {}), false);
});

test("projects a system default even when the External profile is unrelated", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "unrelated" },
    company: { id: 1 },
    name: "集团公司",
    fullName: null,
    identityNumber: "9132X",
    legalRepresentative: null,
    editedBy: 7,
    editedAt: timestamp,
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    externalRoles: [],
    ownedInterests: [],
    legalFactRevisions: [legalFact(1, timestamp)],
  } as ExternalPartyWithRoles & { ownedInterests: [] };

  const relatedParty = projectExternalRelatedParty(party, "2026-07-14", {
    relatedPartyType: "group",
    systemConfiguredReason: "内部公司由系统配置维护",
  });

  assert.equal(relatedParty?.relatedPartyType, "group");
  assert.equal(relatedParty?.systemConfigured, true);
});

test("projects an unrelated customer or supplier as an FK candidate using only visible roles", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "unrelated" },
    company: null,
    name: "候选主体",
    fullName: "候选主体有限公司",
    identityNumber: "9132X",
    legalRepresentative: "张三",
    editedBy: 7,
    editedAt: timestamp,
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    externalRoles: [
      role(1, 12, "customer", "C-001", "不应进入候选", 30, timestamp),
      role(2, 12, "supplier", "V-009", "不应进入候选", 60, timestamp),
    ],
    ownedInterests: [],
    legalFactRevisions: [legalFact(1, timestamp)],
  } as ExternalPartyWithRoles & { ownedInterests: [] };

  const candidate = projectExternalRelatedPartyCandidate(party, ["customer"], "2026-07-14");

  assert.equal(candidate?.id, 12);
  assert.equal(candidate?.version, 3);
  assert.deepEqual(candidate?.roles, ["customer"]);
  assert.equal("contactPerson" in (candidate ?? {}), false);
  assert.equal("code" in (candidate ?? {}), false);
});

test("does not offer an already-related Party as an FK candidate", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "group" },
    company: null,
    name: "已登记主体",
    fullName: null,
    identityNumber: "9132X",
    legalRepresentative: null,
    editedBy: 7,
    editedAt: timestamp,
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    externalRoles: [role(1, 12, "customer", "C-001", "联系人", 30, timestamp)],
    ownedInterests: [],
    legalFactRevisions: [legalFact(1, timestamp)],
  } as ExternalPartyWithRoles & { ownedInterests: [] };

  assert.equal(projectExternalRelatedPartyCandidate(party, ["customer"], "2026-07-14"), null);
});

test("does not offer a system-configured Party as an FK candidate", () => {
  const timestamp = new Date("2026-07-14T00:00:00.000Z");
  const party = {
    id: 12,
    subjectType: "organization",
    externalProfile: { partyId: 12, relatedPartyType: "unrelated" },
    company: { id: 1 },
    name: "集团公司",
    fullName: null,
    identityNumber: "9132X",
    legalRepresentative: null,
    editedBy: 7,
    editedAt: timestamp,
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    externalRoles: [role(1, 12, "customer", "C-001", "联系人", 30, timestamp)],
    ownedInterests: [],
    legalFactRevisions: [legalFact(1, timestamp)],
  } as ExternalPartyWithRoles & { ownedInterests: [] };

  assert.equal(projectExternalRelatedPartyCandidate(party, ["customer"], "2026-07-14"), null);
});

function legalFact(id: number, timestamp: Date) {
  return {
    id,
    partyId: 12,
    revision: id,
    commandKind: "establish",
    effectiveOn: timestamp,
    recordState: "confirmed",
    supersedesId: null,
    subjectType: "organization",
    name: "同一主体",
    fullName: "同一主体有限公司",
    identityNumber: "9132X",
    legalRepresentative: "张三",
    registeredCapital: null,
    registeredAddress: null,
    registeredDate: null,
    sourceRegistryChangeId: null,
    sourceType: "test",
    sourceLabel: "测试",
    sourceReference: null,
    reason: null,
    idempotencyKey: `legal-fact-${id}`,
    recordedBy: 7,
    recordedAt: timestamp,
  };
}

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
    availabilityVersion: 1,
    availabilityPeriods: [{
      id,
      roleId: id,
      sequence: 1,
      validFrom: "2026-01-01",
      validThrough: null,
      recordState: "confirmed",
      commandKind: "establish",
      supersedesId: null,
      idempotencyKey: `role-period-${id}`,
      reason: null,
      recordedBy: 7,
      recordedAt: timestamp,
    }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
