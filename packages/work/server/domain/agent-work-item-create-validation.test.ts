import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentCreateWorkItemBody,
  parseAgentCreateWorkItemInput,
  parseStoredAgentCreateWorkItem,
} from "./agent-work-item-create-validation";

test("Work Agent create derives canonical non-routine defaults", () => {
  const parsed = parseAgentCreateWorkItemInput({
    targetType: "personal",
    targetId: 11,
    planId: 72,
    itemType: "objective",
    content: "  完成客户交付  ",
    parentWorkItemId: null,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const body = buildAgentCreateWorkItemBody(parsed.data, 4);
  assert.deepEqual({
    category: body.category,
    content: body.content,
    description: body.description,
    importance: body.importance,
    urgency: body.urgency,
    status: body.status,
    sourceType: body.sourceType,
    participants: body.participants,
    sortOrder: body.sortOrder,
  }, {
    category: "non-routine",
    content: "完成客户交付",
    description: "",
    importance: 3,
    urgency: 3,
    status: "active",
    sourceType: "other",
    participants: "",
    sortOrder: 4,
  });
});

test("Work Agent create requires an existing root objective id for KR and task", () => {
  const base = {
    targetType: "department",
    targetId: 7,
    planId: 72,
    content: "交付材料",
  };
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "key_result" }).success, false);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "task" }).success, false);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "objective" }).success, false);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "task", parentWorkItemId: 81 }).success, true);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "objective", parentWorkItemId: null }).success, true);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "objective", parentWorkItemId: 81 }).success, false);
  const kr = parseAgentCreateWorkItemInput({ ...base, itemType: "key_result", parentWorkItemId: 81, evidenceTaskIds: [20, 20, 21] });
  assert.equal(kr.success, true);
  if (kr.success) assert.deepEqual(kr.data.evidenceTaskIds, [20, 21]);
});

test("Work Agent create mirrors visible conditional form fields", () => {
  const base = {
    targetType: "department",
    targetId: 7,
    planId: 72,
    content: "交付材料",
  };
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "objective", parentWorkItemId: null, importance: 5 }).success, false);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "task", parentWorkItemId: 81, krTargetValue: 100 }).success, false);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "task", parentWorkItemId: 81, evidenceTaskIds: [] }).success, false);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "key_result", parentWorkItemId: 81, plannedEndDate: "2026-08-31" }).success, false);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, itemType: "task", parentWorkItemId: 81, collaborationId: 9 }).success, true);
  assert.equal(parseAgentCreateWorkItemInput({ ...base, targetType: "personal", itemType: "task", parentWorkItemId: 81, collaborationId: 9 }).success, false);
});

test("Work Agent create rejects source, lifecycle, ordering, runtime and deployment fields", () => {
  const base = {
    targetType: "personal",
    targetId: 11,
    planId: 72,
    itemType: "objective",
    content: "完成客户交付",
    parentWorkItemId: null,
  };
  const excluded: Record<string, unknown> = {
    category: "routine",
    routineTaskType: "standing",
    sourceType: "project",
    linkedProjectId: 9,
    participants: "张三",
    sortOrder: -100,
    parentPeriodWorkItemId: 8,
    previousPeriodWorkItemId: 7,
    isArchived: true,
    shellCommand: "git pull",
    deploymentPath: "/srv/other-app",
  };
  for (const [field, value] of Object.entries(excluded)) {
    assert.equal(
      parseAgentCreateWorkItemInput({ ...base, [field]: value }).success,
      false,
      `${field} should not be accepted`,
    );
  }
});

test("stored Work Agent create payload is strict and fixes the reviewed sort order", () => {
  const input = {
    targetType: "personal",
    targetId: 11,
    planId: 72,
    itemType: "objective",
    content: "完成客户交付",
    parentWorkItemId: null,
  };
  assert.equal(parseStoredAgentCreateWorkItem({ input, sortOrder: 4 }).success, true);
  assert.equal(parseStoredAgentCreateWorkItem({ input, sortOrder: -1 }).success, false);
  assert.equal(parseStoredAgentCreateWorkItem({ input: { ...input, sourceType: "project" }, sortOrder: 4 }).success, false);
});
