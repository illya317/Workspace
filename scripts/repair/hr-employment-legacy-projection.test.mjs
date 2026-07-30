import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmploymentLegacyProjectionArtifact,
  parseEmploymentLegacyItems,
} from "./hr-employment-legacy-projection.mjs";
import { buildEmploymentAgreementBaselinePlan } from "./repair-hr-employment-agreement-baseline.mjs";
import { buildHrSocialInsuranceBaselinePlan } from "./repair-hr-social-insurance-baseline.mjs";

test("lossless parser separates exact raw values from normalized projection values", () => {
  const raw = { company: "", unknownField: { nested: true } };
  const item = parseEmploymentLegacyItems(JSON.stringify([raw]), 10)[0];
  assert.deepEqual(item.rawRecord, raw);
  assert.equal(item.record.company, null);
  assert.deepEqual(item.fieldProjection.find((field) => field.sourceField === "unknownField"), {
    sourceField: "unknownField",
    mappedTo: [],
    retainedIn: ["source.raw"],
  });
});

test("projection artifact conserves every item and source field", () => {
  const sources = [{
    employmentId: 10,
    employeeId: 20,
    contracts: JSON.stringify([
      { company: "测试公司", insuranceStatus: "已参保", firstContractStartDate: "2026-01-01" },
      { company: "测试公司", insuranceStatus: null, legacyNote: "待确认" },
    ]),
  }];
  const agreementPlan = buildEmploymentAgreementBaselinePlan(sources);
  const socialPlan = buildHrSocialInsuranceBaselinePlan(sources, [{ id: 9, name: "测试公司" }]);
  const artifact = buildEmploymentLegacyProjectionArtifact({
    sources,
    agreements: agreementPlan.agreements,
    socialRows: socialPlan.rows,
    socialQuarantine: socialPlan.quarantine,
  });
  assert.equal(artifact.summary.sourceItems, 2);
  assert.equal(artifact.summary.agreementRows, 2);
  assert.equal(artifact.summary.socialInsuranceRows, 1);
  assert.equal(artifact.summary.quarantinedSocialInsuranceRows, 1);
  assert.equal(artifact.summary.sourceFields, artifact.summary.retainedFields);
  assert.equal(artifact.items[1].socialInsurance.outcome, "quarantined");
  assert.equal(artifact.items[1].source.raw.legacyNote, "待确认");
});
