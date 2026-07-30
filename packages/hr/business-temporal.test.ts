import assert from "node:assert/strict";
import test from "node:test";

import { businessTemporalRetrospectiveChanges } from "@workspace/platform/contracts/business-temporal";
import {
  HR_ASSIGNMENT_TEMPORAL,
  HR_EMPLOYMENT_AGREEMENT_TEMPORAL,
  HR_EMPLOYMENT_TEMPORAL,
  HR_SOCIAL_INSURANCE_TEMPORAL,
} from "./business-temporal";

test("HR period contracts make overlap, retrospective entry, and revision explicit", () => {
  assert.equal(HR_EMPLOYMENT_TEMPORAL.policy.overlaps, "forbid");
  assert.equal(HR_ASSIGNMENT_TEMPORAL.policy.overlaps, "by-slot");
  assert.equal(HR_EMPLOYMENT_AGREEMENT_TEMPORAL.policy.overlaps, "allow");

  for (const registration of [
    HR_EMPLOYMENT_TEMPORAL,
    HR_ASSIGNMENT_TEMPORAL,
    HR_EMPLOYMENT_AGREEMENT_TEMPORAL,
  ]) {
    assert.equal(businessTemporalRetrospectiveChanges(registration.policy), "allow");
    assert.notEqual(registration.policy.revision, "forbid");
    assert.equal(registration.commands.includes("correct"), true);
  }
  assert.equal("recordView" in HR_EMPLOYMENT_TEMPORAL.ui, false);
});

test("social insurance is registered as a standard lifecycle record with baseline completion", () => {
  assert.equal(HR_SOCIAL_INSURANCE_TEMPORAL.policy.storage, "effective-version");
  assert.equal(HR_SOCIAL_INSURANCE_TEMPORAL.baseline?.persistence, "preload-authority");
  assert.equal(HR_SOCIAL_INSURANCE_TEMPORAL.baseline?.missingFieldPresentation, "inline-editable");
  assert.equal(HR_SOCIAL_INSURANCE_TEMPORAL.records.authority.some((source) => source.kind === "model" && source.model === "EmployeeSocialInsurancePeriodRevision"), true);
});

test("employment agreement baseline is preloaded and incomplete facts remain queryable without inventing inactivity", () => {
  assert.deepEqual(HR_EMPLOYMENT_AGREEMENT_TEMPORAL.baseline, {
    persistence: "preload-authority",
    missingRecordState: "confirm-unless-explicitly-inactive",
    missingValidFrom: "open-boundary-with-quality-marker",
    missingValidThrough: "open-boundary",
    missingAttributes: "null-with-nonblocking-quality-marker",
    missingFieldCompletion: "separate-patch-command",
    missingFieldPresentation: "inline-editable",
    knownFieldPresentation: "read-only",
    existingFactCorrection: "separate-audited-command",
    existingFactCorrectionPresentation: "explicit-mode",
    businessChange: "new-lifecycle-fact",
    requiredFields: ["terms.*.effectiveFrom"],
    defaultQuery: "include-incomplete",
    exactBoundaryAutomation: "require-known-boundary",
    hardConflicts: "quarantine",
  });
  assert.equal(HR_EMPLOYMENT_AGREEMENT_TEMPORAL.ui.recordState, false);
});
