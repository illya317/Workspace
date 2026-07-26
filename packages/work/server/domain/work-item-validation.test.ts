import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkItemCreateCommand, buildWorkItemUpdateCommand } from "./work-item-validation";

test("keeps selected responsibility ids in a standing task create command", () => {
  const result = buildWorkItemCreateCommand({
    planId: 15,
    targetType: "department",
    targetId: 1,
    category: "routine",
    itemType: "task",
    content: "常设职责任务",
    routineTaskType: "standing",
    ownerEmployeeId: 5840,
    responsibilityNodeId: 2332,
    responsibilityPositionId: 3147,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.responsibilityNodeId, 2332);
  assert.equal(result.data.responsibilityPositionId, 3147);
});

test("keeps selected responsibility ids in a standing task update command", () => {
  const result = buildWorkItemUpdateCommand(123, {
    category: "routine",
    itemType: "task",
    routineTaskType: "standing",
    ownerEmployeeId: 5840,
    responsibilityNodeId: 2332,
    responsibilityPositionId: 3147,
  }, {
    category: "routine",
    itemType: "task",
    routineTaskType: "standing",
    sourceType: "other",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.data.responsibilityNodeId, 2332);
  assert.equal(result.data.data.responsibilityPositionId, 3147);
});
