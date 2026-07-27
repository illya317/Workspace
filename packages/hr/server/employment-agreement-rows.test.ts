import assert from "node:assert/strict";
import test from "node:test";

import { normalizedEmploymentAgreementRow } from "./employment-agreement-rows";

function agreement(terms: Array<Record<string, unknown>>, missingFields: string[] = []) {
  const content = JSON.stringify({ company: "测试公司", contractType: "固定期限" });
  return {
    id: 1,
    agreementUid: "agreement-baseline-001",
    employmentId: 10,
    recordState: "confirmed",
    isPrimary: true,
    sourceKind: "legacy-baseline",
    sourceRef: "employment:10:fingerprint",
    missingFieldsJson: JSON.stringify(missingFields),
    actualEndDate: null,
    reason: null,
    version: 1,
    currentPublishedRevisionId: 11,
    createdBy: 2,
    updatedBy: 2,
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
    updatedAt: new Date("2026-07-27T00:00:00.000Z"),
    currentPublishedRevision: { contentJson: content, revisionUid: "revision-baseline-001" },
    revisions: [{
      id: 11,
      revisionUid: "revision-baseline-001",
      revisionNo: 1,
      recordState: "published",
      changeKind: "baseline-import",
      contentJson: content,
      supersedes: null,
      reason: null,
      createdAt: new Date("2026-07-27T00:00:00.000Z"),
    }],
    terms: terms.map((term, index) => ({
      id: index + 1,
      termUid: `term-baseline-${index + 1}`,
      sequence: index + 1,
      termKind: index === 0 ? "initial" : "renewal",
      effectiveFrom: null,
      effectiveThrough: null,
      recordState: "confirmed",
      changeKind: "legacy",
      reason: null,
      ...term,
    })),
    attachments: [],
    employment: { employee: { id: 20, employeeId: "E001", name: "测试员工" } },
  };
}

test("normalized baseline remains visible when its required start date is missing", () => {
  const row = normalizedEmploymentAgreementRow(
    agreement([{}], ["terms.1.effectiveFrom", "terms.1.effectiveThrough"]) as never,
    "2026-07-27",
  );
  assert.equal(row.source, "normalized");
  assert.equal(row.migrationState, "baseline-incomplete");
  assert.equal(row.terms[0].effectiveFrom, null);
  assert.equal(row.terms[0].recordState, "confirmed");
  assert.equal(row.temporalState, "current");
});

test("overlapping confirmed renewal dates remain a complete baseline", () => {
  const row = normalizedEmploymentAgreementRow(agreement([
    { effectiveFrom: "2025-01-01", effectiveThrough: "2026-12-31", recordState: "confirmed" },
    { effectiveFrom: "2026-10-01", effectiveThrough: "2027-09-30", recordState: "confirmed" },
  ]) as never, "2026-07-27");
  assert.equal(row.migrationState, "baseline");
  assert.equal(row.terms.length, 2);
  assert.equal(row.expiryDate, "2027-09-30");
  assert.equal(row.endDate, null);
});

test("missing optional baseline attributes do not mark a contract incomplete", () => {
  const row = normalizedEmploymentAgreementRow(agreement([
    { effectiveFrom: "2026-01-01", effectiveThrough: "2028-12-31", recordState: "confirmed" },
  ], ["content.employmentForm", "content.legalRelation"]) as never, "2026-07-27");
  assert.equal(row.migrationState, "baseline");
  assert.equal(row.terms[0].effectiveFrom, "2026-01-01");
  assert.deepEqual(row.missingFields, [
    { path: "content.employmentForm", label: "用工形式", required: false },
    { path: "content.legalRelation", label: "法律关系", required: false },
  ]);
});

test("contract endDate is the recorded actual end rather than the contractual expiry", () => {
  const source = agreement([
    { effectiveFrom: "2024-04-16", effectiveThrough: "2030-04-15", recordState: "confirmed" },
  ]) as Omit<ReturnType<typeof agreement>, "actualEndDate"> & { actualEndDate: string | null };
  source.actualEndDate = "2025-12-31";
  const row = normalizedEmploymentAgreementRow(source as never, "2026-07-27");
  assert.equal(row.secondContractEndDate, null);
  assert.equal(row.firstContractEndDate, "2030-04-15");
  assert.equal(row.expiryDate, "2030-04-15");
  assert.equal(row.endDate, "2025-12-31");
  assert.equal(row.temporalState, "past");
});
