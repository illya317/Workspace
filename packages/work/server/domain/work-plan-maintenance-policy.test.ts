import assert from "node:assert/strict";
import test from "node:test";
import {
  canMaintainWorkItem,
  resolveWorkPlanMaintenance,
  validateWorkPlanReopenTransition,
  workItemMutationFacets,
} from "./work-plan-maintenance-policy";

test("legacy OKR stages do not lock maintenance", () => {
  assert.deepEqual(resolveWorkPlanMaintenance({
    kind: "okr",
    stage: "objective_submitted",
    status: "done",
    isArchived: false,
  }), {
    plan: true,
    objective: true,
    task: true,
    keyResult: true,
  });
});

test("archived OKR plans remain immutable", () => {
  assert.deepEqual(resolveWorkPlanMaintenance({
    kind: "okr",
    stage: "closed",
    status: "done",
    isArchived: true,
  }), {
    plan: false,
    objective: false,
    task: false,
    keyResult: false,
  });
});

test("work item mutation facets keep KR definition separate from its current result", () => {
  assert.deepEqual(workItemMutationFacets("objective"), ["target"]);
  assert.deepEqual(workItemMutationFacets("task"), ["execution"]);
  assert.deepEqual(workItemMutationFacets("key_result"), ["target"]);
  assert.deepEqual(workItemMutationFacets("key_result", { changesKrCurrentValue: true }), ["target", "result"]);
});

test("routine plans only allow task maintenance", () => {
  const maintenance = resolveWorkPlanMaintenance({
    kind: "routine",
    stage: "closed",
    status: "active",
    isArchived: false,
  });
  assert.equal(canMaintainWorkItem(maintenance, "task"), true);
  assert.equal(canMaintainWorkItem(maintenance, "objective"), false);
  assert.equal(canMaintainWorkItem(maintenance, "key_result"), false);
});

test("completed OKR plans can reopen only through the canonical revision adapter", () => {
  const bypass = validateWorkPlanReopenTransition({
    kind: "okr",
    currentStatus: "done",
    requestedStatus: "active",
    updateGuard: undefined,
  });
  assert.equal(bypass.ok, false);
  if (!bypass.ok) assert.equal(bypass.issue.status, 409);
  assert.deepEqual(validateWorkPlanReopenTransition({
    kind: "okr",
    currentStatus: "done",
    requestedStatus: "active",
    updateGuard: "workflow-approved",
  }), { ok: true, data: { reopening: true } });
  assert.deepEqual(validateWorkPlanReopenTransition({
    kind: "okr",
    currentStatus: "done",
    requestedStatus: "active",
    updateGuard: undefined,
    directTargetRevision: true,
  }), { ok: true, data: { reopening: true } });
  assert.deepEqual(validateWorkPlanReopenTransition({
    kind: "okr",
    currentStatus: "active",
    requestedStatus: "active",
    updateGuard: undefined,
  }), { ok: true, data: { reopening: false } });
});

test("workflow-mode target revisions cannot be bypassed by direct lifecycle reopen", () => {
  const blocked = validateWorkPlanReopenTransition({
    kind: "okr",
    currentStatus: "done",
    requestedStatus: "active",
    updateGuard: undefined,
    directTargetRevision: false,
  });
  assert.equal(blocked.ok, false);
});
