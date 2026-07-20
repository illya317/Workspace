import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAgentCreateWorkItemInput,
  parseAgentUpdateWorkItemInput,
  parseStoredAgentUpdateWorkItem,
} from "./agent-work-item-proposal-validation";

test("Work Agent accepts a scoped department task proposal", () => {
  const result = parseAgentCreateWorkItemInput({
    targetType: "department",
    targetId: 825,
    planId: 12,
    itemType: "task",
    category: "non-routine",
    content: "完成部门绩效材料复核",
    plannedEndDate: "2026-07-31",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.targetId, 825);
  assert.equal(result.data.content, "完成部门绩效材料复核");
});

test("Work Agent defaults a concise create request to a non-routine task", () => {
  const result = parseAgentCreateWorkItemInput({
    targetType: "department",
    targetId: 825,
    content: "整理本周招聘进展",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.category, "non-routine");
  assert.equal(result.data.itemType, "task");
});

test("Work Agent rejects an update without fields", () => {
  const result = parseAgentUpdateWorkItemInput({ workId: 42 });
  assert.equal(result.success, false);
});

test("stored Work Agent update requires an optimistic timestamp", () => {
  const result = parseStoredAgentUpdateWorkItem({
    input: { workId: 42, status: "done" },
    expectedUpdatedAt: "not-a-timestamp",
  });
  assert.equal(result.success, false);
});
