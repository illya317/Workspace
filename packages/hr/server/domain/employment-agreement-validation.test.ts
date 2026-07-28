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
    termKind: "initial",
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
    termKind: "renewal",
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
    termKind: "renewal",
  });
  assert.equal(result.ok, true);
});

test("builds replacement with the same complete payload as creation", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "replace",
    agreementUid: "agreement-001",
    expectedVersion: 2,
    employmentId: 7,
    effectiveFrom: "2026-08-01",
    effectiveThrough: null,
    termKind: "permanent",
    content: { company: "新签约主体", contractType: "劳动合同" },
    reason: "更换协议",
  });
  assert.equal(result.ok, true);
  if (result.ok && result.data.kind === "replace") {
    assert.equal(result.data.content.company, "新签约主体");
    assert.equal(result.data.termKind, "permanent");
  }
});

test("requires an expiry for fixed terms and forbids one for indefinite terms", () => {
  const fixedWithoutExpiry = buildEmploymentAgreementCommand({
    kind: "renew",
    agreementUid: "agreement-001",
    expectedVersion: 2,
    effectiveFrom: "2026-08-01",
    termKind: "renewal",
  });
  assert.equal(fixedWithoutExpiry.ok, false);
  if (!fixedWithoutExpiry.ok) assert.equal(fixedWithoutExpiry.issue.field, "effectiveThrough");

  const indefiniteWithExpiry = buildEmploymentAgreementCommand({
    kind: "correct",
    agreementUid: "agreement-001",
    expectedVersion: 2,
    termUid: "term-00000001",
    effectiveFrom: "2009-06-10",
    effectiveThrough: "2014-06-09",
    termKind: "permanent",
    reason: "修正历史录入",
  });
  assert.equal(indefiniteWithExpiry.ok, false);
  if (!indefiniteWithExpiry.ok) assert.equal(indefiniteWithExpiry.issue.field, "effectiveThrough");
});

test("builds a missing-term supplement without expanding it into a correction", () => {
  const result = buildEmploymentAgreementCommand({
    kind: "supplement-term",
    agreementUid: "agreement-001",
    expectedVersion: 2,
    termUid: "term-00000001",
    patch: { effectiveThrough: "2014-06-09" },
    reason: "补齐历史期限",
  });
  assert.equal(result.ok, true);
  if (result.ok && result.data.kind === "supplement-term") {
    assert.deepEqual(result.data.patch, { effectiveThrough: "2014-06-09" });
  }
});

test("requires a reason when supplementing baseline fields", () => {
  const invalid = buildEmploymentAgreementCommand({
    kind: "supplement-missing",
    agreementUid: "agreement-001",
    expectedVersion: 1,
    patch: { legalRelation: "劳动关系" },
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.issue.field, "reason");
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
