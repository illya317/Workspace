import assert from "node:assert/strict";
import test from "node:test";
import {
  canMaintainWorkItem,
  resolveWorkPlanMaintenance,
  validateWorkPlanReopenTransition,
} from "./work-plan-maintenance-policy";

test("submitted objectives remain locked independently of time-control settings", () => {
  assert.deepEqual(resolveWorkPlanMaintenance({
    kind: "okr",
    stage: "objective_submitted",
    status: "active",
    isArchived: false,
  }), {
    plan: false,
    objective: false,
    task: false,
    keyResult: false,
  });
});

test("OKR maintenance follows lifecycle stage", () => {
  assert.deepEqual(resolveWorkPlanMaintenance({
    kind: "okr",
    stage: "objective_draft",
    status: "active",
    isArchived: false,
  }), {
    plan: true,
    objective: true,
    task: false,
    keyResult: false,
  });
  assert.deepEqual(resolveWorkPlanMaintenance({
    kind: "okr",
    stage: "executing",
    status: "active",
    isArchived: false,
  }), {
    plan: false,
    objective: false,
    task: true,
    keyResult: true,
  });
});

test("closed lifecycle remains immutable", () => {
  for (const input of [
    { stage: "closed", status: "active", isArchived: false },
    { stage: "executing", status: "done", isArchived: false },
    { stage: "executing", status: "active", isArchived: true },
  ]) {
    assert.deepEqual(resolveWorkPlanMaintenance({
      kind: "okr",
      ...input,
    }), {
      plan: false,
      objective: false,
      task: false,
      keyResult: false,
    });
  }
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
    currentStatus: "active",
    requestedStatus: "active",
    updateGuard: undefined,
  }), { ok: true, data: { reopening: false } });
});
