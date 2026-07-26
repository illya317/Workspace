import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmploymentAgreementCommand,
  employmentAgreementPeriodsOverlap,
} from "./employment-agreement-validation";

test("builds a normalized agreement create command", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "create",
    employmentId: 7,
    isPrimary: true,
    effectiveFrom: "2026-08-01",
    effectiveThrough: "2027-07-31",
    content: { company: "测试公司", contractType: "固定期限" },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "create");
    assert.equal(result.data.sourceKind, "workspace");
    assert.equal(result.data.content.company, "测试公司");
  }
});

test("rejects inverted agreement periods", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "renew",
    agreementUid: "agreement-001",
    expectedVersion: 2,
    effectiveFrom: "2027-08-01",
    effectiveThrough: "2027-07-31",
    reason: "修正续签期间",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.status, 409);
});

test("requires optimistic version for commands targeting an agreement", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "set-primary",
    agreementUid: "agreement-001",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "expectedVersion");
});

test("detects inclusive overlap including a shared end date", () => {
  assert.equal(employmentAgreementPeriodsOverlap(
    { effectiveFrom: "2026-01-01", effectiveThrough: "2026-06-30" },
    { effectiveFrom: "2026-06-30", effectiveThrough: "2026-12-31" },
  ), true);
  assert.equal(employmentAgreementPeriodsOverlap(
    { effectiveFrom: "2026-01-01", effectiveThrough: "2026-06-30" },
    { effectiveFrom: "2026-07-01", effectiveThrough: "2026-12-31" },
  ), false);
});

test("validates publish revision identity", () => {
  const invalid = buildEmploymentAgreementCommand({
    kind: "publish",
    agreementUid: "agreement-001",
    expectedVersion: 1,
    revisionUid: "short",
  });
  assert.equal(invalid.ok, false);
});
