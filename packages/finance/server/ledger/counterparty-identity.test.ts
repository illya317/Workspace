import assert from "node:assert/strict";
import test from "node:test";

import { resolveCounterpartyIdentityFact } from "./counterparty-identity";

const unmatched = {
  id: 1,
  linkedCompanyId: null,
  linkedEmployeeId: null,
  linkedPartyId: null,
};

test("resolves company and core employee FK targets without name matching", () => {
  assert.deepEqual(resolveCounterpartyIdentityFact(
    { ...unmatched, linkedCompanyId: 9 },
    new Set(),
    undefined,
  ), {
    identityMatched: true,
    targetKind: "company",
    relatedPartyType: "group",
  });
  assert.equal(resolveCounterpartyIdentityFact(
    { ...unmatched, linkedEmployeeId: 7 },
    new Set([7]),
    undefined,
  ).relatedPartyType, "key_management_related");
});

test("uses system-derived Party relationships before manual classification", () => {
  const member = { ...unmatched, linkedPartyId: 12 };
  assert.equal(resolveCounterpartyIdentityFact(member, new Set(), {
    activeCompany: false,
    coreManagementEmployee: false,
    ownershipInfluence: true,
    manualRelatedPartyType: "other_related",
  }).relatedPartyType, "investor_influence");
  assert.equal(resolveCounterpartyIdentityFact(member, new Set(), {
    activeCompany: false,
    coreManagementEmployee: false,
    ownershipInfluence: false,
    manualRelatedPartyType: "joint_venture_associate",
  }).relatedPartyType, "joint_venture_associate");
});

test("does not classify an unresolved auxiliary identity as non-related", () => {
  assert.deepEqual(resolveCounterpartyIdentityFact(unmatched, new Set(), undefined), {
    identityMatched: false,
    targetKind: null,
    relatedPartyType: null,
  });
});
