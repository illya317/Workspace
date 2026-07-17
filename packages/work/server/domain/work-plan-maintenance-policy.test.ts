import assert from "node:assert/strict";
import test from "node:test";
import { isBoundWorkOkrTimeControlEnabled } from "./work-okr-bound-control";
import {
  canMaintainWorkItem,
  resolveWorkPlanMaintenance,
  validateWorkPlanReopenTransition,
} from "./work-plan-maintenance-policy";

test("bound time control unlocks maintenance only for an explicit disabled snapshot", () => {
  const snapshot = JSON.stringify({
    version: 1,
    okrControl: { version: 1, settings: { enabled: false }, policy: null },
    actions: { objective_submit: { policy: { mode: "required" } } },
  });
  assert.equal(isBoundWorkOkrTimeControlEnabled(snapshot), false);
  assert.equal(isBoundWorkOkrTimeControlEnabled("{}"), true);
  assert.equal(isBoundWorkOkrTimeControlEnabled("invalid"), true);
});

test("submitted objectives remain locked while time control is enabled", () => {
  assert.deepEqual(resolveWorkPlanMaintenance({
    kind: "okr",
    stage: "objective_submitted",
    status: "active",
    isArchived: false,
    timeControlEnabled: true,
  }), {
    plan: false,
    objective: false,
    task: false,
    keyResult: false,
  });
});

test("disabled time control unlocks every maintenance area for active OKR plans", () => {
  for (const stage of ["objective_draft", "objective_submitted", "executing", "kr_open", "kr_submitted"]) {
    assert.deepEqual(resolveWorkPlanMaintenance({
      kind: "okr",
      stage,
      status: "active",
      isArchived: false,
      timeControlEnabled: false,
    }), {
      plan: true,
      objective: true,
      task: true,
      keyResult: true,
    });
  }
});

test("OKR maintenance follows lifecycle stage", () => {
  assert.deepEqual(resolveWorkPlanMaintenance({
    kind: "okr",
    stage: "objective_draft",
    status: "active",
    isArchived: false,
    timeControlEnabled: true,
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
    timeControlEnabled: true,
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
      timeControlEnabled: false,
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
    timeControlEnabled: false,
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
