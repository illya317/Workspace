import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmploymentAgreementCommand,
  validateEmploymentAgreementMissingFields,
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

test("accepts a renewal period even when it starts before the prior contract ends", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "renew",
    agreementUid: "agreement-001",
    expectedVersion: 2,
    effectiveFrom: "2026-06-01",
    effectiveThrough: "2027-05-31",
  });
  assert.equal(result.ok, true);
});

test("supplementing baseline fields keeps the explanation optional", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "supplement-missing",
    agreementUid: "agreement-001",
    expectedVersion: 1,
    patch: { content: { legalRelation: "劳动关系" } },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.reason, null);
});

test("builds a supplement patch for a missing agreement term date", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "supplement-missing",
    agreementUid: "agreement-001",
    expectedVersion: 1,
    patch: { terms: [{ termUid: "term-00000003", effectiveThrough: "2028-07-31" }] },
    reason: "补充第三期到期日期",
  });
  assert.equal(result.ok, true);
  if (result.ok && result.data.kind === "supplement-missing") {
    assert.deepEqual(result.data.patch, {
      content: {},
      terms: [{ termUid: "term-00000003", effectiveThrough: "2028-07-31" }],
    });
  }
});

test("builds a patch command without inventing unchanged fields", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "correct-existing",
    agreementUid: "agreement-001",
    expectedVersion: 1,
    patch: { company: "测试公司" },
    reason: "修正主体录入",
  });
  assert.equal(result.ok, true);
  if (result.ok && result.data.kind === "correct-existing") {
    assert.deepEqual(result.data.patch, { company: "测试公司" });
  }
});

test("validates the persisted baseline missing-field projection", () => {
  const result = validateEmploymentAgreementMissingFields(["content.company", "content.company"]);
  assert.deepEqual(result.ok ? result.data : null, ["content.company"]);
});
