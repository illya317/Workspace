import assert from "node:assert/strict";
import test from "node:test";

import {
  agentWorkItemAvailabilityError,
  expandAgentWorkItemFormPatch,
  intersectAgentWorkReferenceOptions,
  parseAgentUpdateWorkItemInput,
  parseAgentWorkReferenceOptionsInput,
  parseAgentWorkSpaceDetailInput,
  parseStoredAgentUpdateWorkItem,
  validateAgentWorkItemFormFields,
} from "./agent-work-item-proposal-validation";

test("Work Agent exposes the same unavailable error for missing and archived nodes", () => {
  assert.equal(agentWorkItemAvailabilityError(null), "工作节点不存在或不可维护");
  assert.equal(agentWorkItemAvailabilityError({ isArchived: true }), "工作节点不存在或不可维护");
  assert.equal(agentWorkItemAvailabilityError({ isArchived: false }), null);
});

test("Work Agent accepts the visible recurrence, relation, evidence, and responsibility fields", () => {
  const result = parseAgentUpdateWorkItemInput({
    workId: 42,
    content: "完成部门绩效材料复核",
    importance: 5,
    urgency: 1,
    plannedEndDate: "2026-07-31",
    routineRecurrenceType: "weekly",
    routineRecurrenceTime: "09:30",
    routineRecurrenceWeekday: 3,
    parentWorkItemId: 10,
    parentPeriodWorkItemId: 11,
    previousPeriodWorkItemId: 12,
    responsibilityNodeId: 13,
    responsibilityPositionId: 14,
    evidenceTaskIds: [20, 21, 20],
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.evidenceTaskIds, [20, 21]);
});

test("Work Agent rejects ratings outside the same 1 to 5 range as the form", () => {
  assert.equal(parseAgentUpdateWorkItemInput({ workId: 42, importance: 10 }).success, false);
  assert.equal(parseAgentUpdateWorkItemInput({ workId: 42, urgency: 0 }).success, false);
  assert.equal(parseAgentUpdateWorkItemInput({ workId: 42, importance: 5 }).success, true);
});

test("Work Agent only accepts real date-only values", () => {
  assert.equal(parseAgentUpdateWorkItemInput({ workId: 42, plannedEndDate: "07/31/2026" }).success, false);
  assert.equal(parseAgentUpdateWorkItemInput({ workId: 42, plannedEndDate: "2026-02-31" }).success, false);
  assert.equal(parseAgentUpdateWorkItemInput({ workId: 42, plannedEndDate: "2026-07-31" }).success, true);
  assert.equal(parseAgentUpdateWorkItemInput({ workId: 42, plannedEndDate: null }).success, true);
});

test("Work Agent rejects fields locked or hidden by the manual edit form", () => {
  const hiddenFields: Record<string, unknown> = {
    planId: 12,
    category: "routine",
    itemType: "task",
    routineTaskType: "standing",
    sourceType: "project",
    sourceDepartmentId: 9,
    linkedProjectId: 8,
    linkedProjectPhaseId: 7,
    participants: "张三",
    sortOrder: -99,
  };

  for (const [field, value] of Object.entries(hiddenFields)) {
    assert.equal(
      parseAgentUpdateWorkItemInput({ workId: 42, [field]: value }).success,
      false,
      `${field} should not be accepted`,
    );
  }
});

test("Work Agent rejects an update without fields", () => {
  assert.equal(parseAgentUpdateWorkItemInput({ workId: 42 }).success, false);
});

test("Work Agent normalizes text exactly like the canonical writer before confirmation", () => {
  const parsed = parseAgentUpdateWorkItemInput({
    workId: 42,
    description: "  交付口径  ",
    krUnit: "  %  ",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.description, "交付口径");
    assert.equal(parsed.data.krUnit, "%");
  }

  const cleared = parseAgentUpdateWorkItemInput({ workId: 42, krUnit: "   " });
  assert.equal(cleared.success, true);
  if (cleared.success) assert.equal(cleared.data.krUnit, null);
});

test("stored Work Agent update requires an optimistic timestamp and the same strict payload", () => {
  assert.equal(parseStoredAgentUpdateWorkItem({
    input: { workId: 42, status: "done" },
    expectedUpdatedAt: "not-a-timestamp",
  }).success, false);
  assert.equal(parseStoredAgentUpdateWorkItem({
    input: { workId: 42, sortOrder: 20 },
    expectedUpdatedAt: "2026-07-21T08:00:00.000Z",
  }).success, false);
});

test("conditional Work form guard allows recurrence only on ordinary routine tasks", () => {
  const parsed = parseAgentUpdateWorkItemInput({ workId: 42, routineRecurrenceType: "weekly" });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(validateAgentWorkItemFormFields(parsed.data, {
    targetType: "department",
    category: "routine",
    itemType: "task",
    routineTaskType: "task",
    routineRecurrenceType: "weekly",
    isMilestone: false,
  }), null);
  assert.match(validateAgentWorkItemFormFields(parsed.data, {
    targetType: "department",
    category: "non-routine",
    itemType: "task",
    routineTaskType: null,
    routineRecurrenceType: null,
    isMilestone: false,
  }) ?? "", /普通日常任务/);
});

test("conditional Work form guard allows evidence only on KR", () => {
  const parsed = parseAgentUpdateWorkItemInput({ workId: 42, evidenceTaskIds: [7] });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(validateAgentWorkItemFormFields(parsed.data, {
    targetType: "department",
    category: "non-routine",
    itemType: "key_result",
    routineTaskType: null,
    routineRecurrenceType: null,
    isMilestone: false,
  }), null);
  assert.match(validateAgentWorkItemFormFields(parsed.data, {
    targetType: "department",
    category: "non-routine",
    itemType: "task",
    routineTaskType: null,
    routineRecurrenceType: null,
    isMilestone: false,
  }) ?? "", /只有 KR/);
});

test("conditional Work form guard rejects hidden recurrence subfields", () => {
  const parsed = parseAgentUpdateWorkItemInput({ workId: 42, routineRecurrenceMonthDay: 20 });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.match(validateAgentWorkItemFormFields(parsed.data, {
    targetType: "department",
    category: "routine",
    itemType: "task",
    routineTaskType: "task",
    routineRecurrenceType: "weekly",
    isMilestone: false,
  }) ?? "", /每月周期/);
});

test("conditional Work form guard rejects milestone date while milestone is disabled", () => {
  const parsed = parseAgentUpdateWorkItemInput({ workId: 42, milestoneDate: "2026-08-01" });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.match(validateAgentWorkItemFormFields(parsed.data, {
    targetType: "department",
    category: "non-routine",
    itemType: "objective",
    routineTaskType: null,
    routineRecurrenceType: null,
    isMilestone: false,
  }) ?? "", /启用里程碑/);
  assert.equal(validateAgentWorkItemFormFields({ ...parsed.data, isMilestone: true }, {
    targetType: "department",
    category: "non-routine",
    itemType: "objective",
    routineTaskType: null,
    routineRecurrenceType: null,
    isMilestone: false,
  }), null);
});

test("manual-form expansion exposes status and milestone clearing side effects", () => {
  const snapshot = {
    targetType: "department",
    category: "non-routine",
    itemType: "objective",
    routineTaskType: null,
    routineRecurrenceType: null,
    routineRecurrenceTime: null,
    status: "done",
    isMilestone: true,
  };
  assert.deepEqual(expandAgentWorkItemFormPatch({ workId: 42, status: "active" }, snapshot), {
    workId: 42,
    status: "active",
    actualEndDate: null,
  });
  assert.deepEqual(expandAgentWorkItemFormPatch({ workId: 42, isMilestone: false }, snapshot), {
    workId: 42,
    isMilestone: false,
    milestoneDate: null,
  });
});

test("manual-form expansion resets recurrence dependants while preserving explicit visible values", () => {
  const snapshot = {
    targetType: "department",
    category: "routine",
    itemType: "task",
    routineTaskType: "task",
    routineRecurrenceType: "monthly",
    routineRecurrenceTime: "09:30",
    status: "active",
    isMilestone: false,
  };
  assert.deepEqual(expandAgentWorkItemFormPatch({
    workId: 42,
    routineRecurrenceType: "weekly",
    routineRecurrenceWeekday: 3,
  }, snapshot), {
    workId: 42,
    routineRecurrenceType: "weekly",
    routineRecurrenceTime: null,
    routineRecurrenceWeekday: 3,
    routineRecurrenceMonthDay: 1,
    routineRecurrenceQuarterDay: 1,
    routineRecurrenceYearMonth: 1,
    routineRecurrenceYearDay: 1,
  });
  assert.deepEqual(expandAgentWorkItemFormPatch({ workId: 42, routineRecurrenceType: null }, snapshot), {
    workId: 42,
    routineRecurrenceType: null,
    routineRecurrenceTime: "09:30",
    routineRecurrenceWeekday: null,
    routineRecurrenceMonthDay: null,
    routineRecurrenceQuarterDay: null,
    routineRecurrenceYearMonth: null,
    routineRecurrenceYearDay: null,
  });
});

test("Work detail contract supports keyword and exact work id", () => {
  assert.equal(parseAgentWorkSpaceDetailInput({
    targetType: "department",
    targetId: 825,
    workId: 42,
    keyword: "经营分析",
  }).success, true);
  assert.equal(parseAgentWorkSpaceDetailInput({
    targetType: "department",
    targetId: 825,
    workId: "42",
  }).success, false);
});

test("Work reference search only accepts the artificial-form FK allowlist", () => {
  assert.equal(parseAgentWorkReferenceOptionsInput({
    fkKey: "work.tasks.owner.employee",
    targetType: "department",
    targetId: 825,
    ownerEmployeeId: 12,
  }).success, true);
  assert.equal(parseAgentWorkReferenceOptionsInput({
    fkKey: "work.tasks.source.department",
    targetType: "department",
    targetId: 825,
  }).success, false);
});

test("Work reference search requires the same enabling context as the manual fields", () => {
  assert.equal(parseAgentWorkReferenceOptionsInput({
    fkKey: "work.tasks.item.responsibility",
    targetType: "department",
    targetId: 825,
    positionId: 20,
  }).success, false);
  assert.equal(parseAgentWorkReferenceOptionsInput({
    fkKey: "work.tasks.item.responsibility",
    targetType: "department",
    targetId: 825,
    ownerEmployeeId: 7,
    positionId: 20,
  }).success, true);
  assert.equal(parseAgentWorkReferenceOptionsInput({
    fkKey: "work.tasks.parent.item",
    targetType: "department",
    targetId: 825,
  }).success, false);
  assert.equal(parseAgentWorkReferenceOptionsInput({
    fkKey: "work.tasks.parent.item",
    targetType: "department",
    targetId: 825,
    planId: 3,
    currentWorkItemId: 42,
    itemType: "objective",
  }).success, true);
});

test("delegated reference candidates intersect locked responsibility context", () => {
  const actor = [
    { id: 1, name: "职责 A", lockedEmployeeId: 10, lockedPositionId: 100 },
    { id: 1, name: "职责 A", lockedEmployeeId: 11, lockedPositionId: 101 },
    { id: 2, name: "职责 B" },
  ];
  const requester = [
    { id: 1, name: "职责 A", lockedEmployeeId: 10, lockedPositionId: 100 },
    { id: 2, name: "职责 B" },
  ];

  assert.deepEqual(
    intersectAgentWorkReferenceOptions(actor, requester).map((option) => [option.id, option.lockedEmployeeId]),
    [[1, 10], [2, undefined]],
  );
});
