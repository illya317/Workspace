import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInvestorDueDiligenceCreateCommand,
  buildInvestorDueDiligenceUpdateCommand,
  buildInvestorShareholderProfileUpdateCommand,
} from "./investor-relations-validation";

test("shareholder relationship profile accepts contact fields without mutating capital facts", () => {
  const result = buildInvestorShareholderProfileUpdateCommand({
    issuerCompanyId: 7,
    shareholderPartyId: 11,
    expectedVersion: null,
    body: {
      investorCategory: "institutional",
      relationshipStatus: "priority",
      contactName: "张经理",
      email: "zhang@example.com",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.data, {
    investorCategory: "institutional",
    contactName: "张经理",
    contactTitle: null,
    phone: null,
    email: "zhang@example.com",
    address: null,
    relationshipOwner: null,
    relationshipStatus: "priority",
    communicationPreference: null,
    notes: null,
  });
  assert.equal("shareRatio" in result.data.data, false);
});

test("due diligence record requires participant, organization and a valid date", () => {
  const result = buildInvestorDueDiligenceCreateCommand({
    issuerCompanyId: 7,
    idempotencyKey: "test-command",
    body: {
      investorOrganization: "示例资本",
      visitorName: "李女士",
      diligenceDate: "2026-07-30",
      diligenceType: "financial",
      visitMethod: "onsite",
      status: "planned",
      ndaStatus: "signed",
      dataRoomStatus: "open",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.data.investorOrganization, "示例资本");
  assert.equal(result.data.data.diligenceDate.toISOString().slice(0, 10), "2026-07-30");
  assert.equal(result.data.data.ndaStatus, "signed");
});

test("due diligence update rejects invalid email and stale version shapes", () => {
  const invalidEmail = buildInvestorDueDiligenceUpdateCommand({
    id: 3,
    issuerCompanyId: 7,
    expectedVersion: 2,
    body: {
      investorOrganization: "示例资本",
      visitorName: "李女士",
      diligenceDate: "2026-07-30",
      email: "not-an-email",
    },
  });
  assert.equal(invalidEmail.ok, false);

  const invalidVersion = buildInvestorDueDiligenceUpdateCommand({
    id: 3,
    issuerCompanyId: 7,
    expectedVersion: -1,
    body: {
      investorOrganization: "示例资本",
      visitorName: "李女士",
      diligenceDate: "2026-07-30",
    },
  });
  assert.equal(invalidVersion.ok, false);
});
