import assert from "node:assert/strict";
import test from "node:test";
import { canMaintainWorkItem, resolveWorkPlanMaintenance } from "./work-plan-maintenance-policy";

test("time control disabled unlocks every active OKR maintenance surface", () => {
  assert.deepEqual(resolveWorkPlanMaintenance({
    kind: "okr",
    stage: "objective_submitted",
    status: "active",
    isArchived: false,
    timeControlEnabled: false,
  }), {
    plan: true,
    objective: true,
    task: true,
    keyResult: true,
  });
});

test("time control enabled applies stage-specific OKR maintenance", () => {
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

test("closed lifecycle remains immutable when time control is disabled", () => {
  for (const input of [
    { stage: "closed", status: "active", isArchived: false },
    { stage: "executing", status: "done", isArchived: false },
    { stage: "executing", status: "active", isArchived: true },
  ]) {
    assert.deepEqual(resolveWorkPlanMaintenance({
      kind: "okr",
      timeControlEnabled: false,
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
    timeControlEnabled: true,
  });
  assert.equal(canMaintainWorkItem(maintenance, "task"), true);
  assert.equal(canMaintainWorkItem(maintenance, "objective"), false);
  assert.equal(canMaintainWorkItem(maintenance, "key_result"), false);
});
