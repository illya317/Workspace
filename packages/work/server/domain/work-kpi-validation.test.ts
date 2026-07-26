import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkKpiDefinitionCommand, validateWorkKpiDefinitionDeleteCommand } from "./work-kpi-definition-validation";
import { validateWorkKpiScorecardCommand } from "./work-kpi-scorecard-validation";
import { validateWorkKpiResultCommitCommand } from "./work-kpi-result-validation";

test("KPI definition normalizes stable code and percent unit", () => {
  const result = validateWorkKpiDefinitionCommand({
    code: "sales.growth",
    name: "销售增长率",
    displayType: "percent",
    direction: "higher_is_better",
    ownerDepartmentId: 10,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.code, "SALES.GROWTH");
  assert.equal(result.data.unit, "%");
  assert.deepEqual(result.data.scoringRule, { kind: "linear", targetScore: 100, floorScore: 0, capScore: 120 });
});

test("KPI definition delete requires target, actor, and optimistic version", () => {
  assert.equal(validateWorkKpiDefinitionDeleteCommand({ actorUserId: 8, definitionId: 12, expectedVersion: 2 }).ok, true);
  assert.equal(validateWorkKpiDefinitionDeleteCommand({ actorUserId: 8, definitionId: 12 }).ok, false);
  assert.equal(validateWorkKpiDefinitionDeleteCommand({ actorUserId: 8, definitionId: 0, expectedVersion: 2 }).ok, false);
});

test("KPI scorecard draft allows incomplete total but finalization requires 100", () => {
  const entries = [
    { definitionId: 1, ownerEmployeeId: 2, weight: 40, targetValue: 10 },
    { definitionId: 2, ownerEmployeeId: 2, weight: 50, targetValue: 20 },
  ];
  assert.equal(validateWorkKpiScorecardCommand({ planId: 1, intent: "draft", entries }).ok, true);
  const final = validateWorkKpiScorecardCommand({ planId: 1, intent: "finalize", entries });
  assert.equal(final.ok, false);
  if (!final.ok) assert.match(final.issue.message, /100%/);
});

test("KPI scorecard rejects duplicate definitions and invalid decomposition", () => {
  const duplicate = validateWorkKpiScorecardCommand({
    planId: 1,
    entries: [
      { definitionId: 1, ownerEmployeeId: 2, weight: 50, targetValue: 10 },
      { definitionId: 1, ownerEmployeeId: 3, weight: 50, targetValue: 20 },
    ],
  });
  assert.equal(duplicate.ok, false);
  const missingSource = validateWorkKpiScorecardCommand({
    planId: 1,
    entries: [{ definitionId: 1, ownerEmployeeId: 2, relationKind: "decompose", weight: 100, targetValue: 10 }],
  });
  assert.equal(missingSource.ok, false);
});

test("KPI manual score adjustment requires a reason", () => {
  const result = validateWorkKpiResultCommitCommand({
    planId: 1,
    workReportId: 2,
    adjustments: [{ assignmentId: 3, confirmedScore: 105 }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue.message, /原因/);
});
