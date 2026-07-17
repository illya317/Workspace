import test from "node:test";
import assert from "node:assert/strict";
import { getActionContractMetadata } from "@workspace/platform/action-contract-registry";
import { normalizeApprovalPayload } from "./task-approval-normalize";

test("KPI objective payload survives Work approval normalization", () => {
  const entries = [{ definitionId: 3, ownerEmployeeId: 7, weight: 100, targetValue: 12 }];
  const result = normalizeApprovalPayload({
    entityType: "objective_plan",
    targetType: "department",
    targetId: 5,
    planId: 11,
    data: { title: "年度目标", expectedPlanGovernanceRevision: 2, kpiScorecardEntries: entries },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.entityType, "objective_plan");
  assert.deepEqual(result.data.data.kpiScorecardEntries, entries);
  assert.equal(result.data.data.expectedPlanGovernanceRevision, 2);
});

test("KPI result commit survives Work approval normalization", () => {
  const commit = { workReportId: 19, adjustments: [{ assignmentId: 4, confirmedScore: 98, adjustmentReason: "口径复核" }] };
  const result = normalizeApprovalPayload({
    entityType: "kr_review",
    targetType: "personal",
    targetId: 8,
    planId: 12,
    data: { title: "考核结果", kpiResultCommit: commit },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.entityType, "kr_review");
  assert.deepEqual(result.data.data.kpiResultCommit, commit);
});

test("Work goal contracts switch one finalization entry between direct save and workflow submit", () => {
  for (const key of [
    "work.tasks.goal.department.objective.submit",
    "work.tasks.goal.personal.objective.submit",
    "work.tasks.goal.department.report.submit",
    "work.tasks.goal.personal.report.submit",
  ]) {
    const contract = getActionContractMetadata(key);
    assert.ok(contract);
    assert.equal(contract.workflow.kind, "configurable");
    if (contract.workflow.kind !== "configurable") continue;
    assert.equal(contract.workflow.whenDisabled, "direct_write");
    assert.equal(contract.workflow.entrySemantics, "form_finalization");
    assert.ok(contract.form);
    if (!contract.form) continue;
    assert.deepEqual(contract.form.supportedModes, ["direct", "workflow"]);
  }
});
