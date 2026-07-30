import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  evaluateProjectNotificationSchedulerGate,
  resolveProjectNotificationSchedulerRuntime,
} from "./project-notification-scheduler-gate";

function state(slot: "blue" | "green") {
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-state",
    unitId: "work",
    active: { unitId: "work", slot },
  };
}

function replaceCurrent(gateway: string, generation: string) {
  const nextLink = path.join(gateway, `.current-next-${path.basename(generation)}`);
  symlinkSync(generation, nextLink);
  renameSync(nextLink, path.join(gateway, "current"));
}

test("monolith remains eligible when no managed Gateway is configured", async () => {
  const runtime = resolveProjectNotificationSchedulerRuntime({});
  assert.deepEqual(runtime, { mode: "monolith", gateway: null });
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(runtime), {
    active: true,
    reason: "monolith_no_gateway",
  });
});

test("incomplete or foreign deploy-unit fencing fails closed", async () => {
  for (const environment of [
    { WORKSPACE_DEPLOY_UNIT_ID: "work" },
    { WORKSPACE_DEPLOY_UNIT_ID: "finance", WORKSPACE_DEPLOY_SLOT: "blue", WORKSPACE_DEPLOY_CURRENT_STATE_FILE: "/tmp/gateway/current/unit-states/work.json" },
    { WORKSPACE_DEPLOY_UNIT_ID: "work", WORKSPACE_DEPLOY_SLOT: "candidate", WORKSPACE_DEPLOY_CURRENT_STATE_FILE: "/tmp/gateway/current/unit-states/work.json" },
    { WORKSPACE_DEPLOY_UNIT_ID: "work", WORKSPACE_DEPLOY_SLOT: "blue", WORKSPACE_DEPLOY_CURRENT_STATE_FILE: "relative/gateway/current/unit-states/work.json" },
  ]) {
    const runtime = resolveProjectNotificationSchedulerRuntime(environment);
    assert.equal(runtime.mode, "invalid");
    assert.deepEqual(await evaluateProjectNotificationSchedulerGate(runtime), {
      active: false,
      reason: "invalid_configuration",
    });
  }
});

test("committed Gateway promotion transfers authority from monolith to Work and rollback returns it", async (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-project-notification-slot-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const gateway = path.join(root, "gateway");
  const fallbackGeneration = path.join(gateway, "generations", "1".repeat(64));
  const blueGeneration = path.join(gateway, "generations", "2".repeat(64));
  const greenGeneration = path.join(gateway, "generations", "3".repeat(64));
  for (const generation of [fallbackGeneration, blueGeneration, greenGeneration]) {
    mkdirSync(path.join(generation, "unit-states"), { recursive: true });
  }
  writeFileSync(path.join(blueGeneration, "unit-states", "work.json"), JSON.stringify(state("blue")));
  writeFileSync(path.join(greenGeneration, "unit-states", "work.json"), JSON.stringify(state("green")));
  symlinkSync(fallbackGeneration, path.join(gateway, "current"));
  const committedGenerationFile = path.join(gateway, "committed-generation");
  writeFileSync(committedGenerationFile, `${path.basename(fallbackGeneration)}\n`);

  const currentStateFile = path.join(gateway, "current", "unit-states", "work.json");
  const monolithRuntime = resolveProjectNotificationSchedulerRuntime({ WORKSPACE_CONFIG_DIR: root });
  const blueRuntime = resolveProjectNotificationSchedulerRuntime({
    WORKSPACE_DEPLOY_UNIT_ID: "work",
    WORKSPACE_DEPLOY_SLOT: "blue",
    WORKSPACE_DEPLOY_CURRENT_STATE_FILE: currentStateFile,
  });
  const greenRuntime = resolveProjectNotificationSchedulerRuntime({
    WORKSPACE_DEPLOY_UNIT_ID: "work",
    WORKSPACE_DEPLOY_SLOT: "green",
    WORKSPACE_DEPLOY_CURRENT_STATE_FILE: currentStateFile,
  });
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(monolithRuntime), {
    active: true,
    reason: "monolith_no_work_unit",
  });

  replaceCurrent(gateway, blueGeneration);
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(blueRuntime), {
    active: false,
    reason: "gateway_transition",
  });
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(monolithRuntime), {
    active: false,
    reason: "gateway_transition",
  });
  writeFileSync(committedGenerationFile, `${path.basename(blueGeneration)}\n`);
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(blueRuntime), {
    active: true,
    reason: "active_slot",
  });
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(monolithRuntime), {
    active: false,
    reason: "monolith_yields_to_work_unit",
  });

  replaceCurrent(gateway, greenGeneration);
  writeFileSync(committedGenerationFile, `${path.basename(greenGeneration)}\n`);
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(greenRuntime), {
    active: true,
    reason: "active_slot",
  });
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(blueRuntime), {
    active: false,
    reason: "inactive_slot",
  });

  replaceCurrent(gateway, fallbackGeneration);
  writeFileSync(committedGenerationFile, `${path.basename(fallbackGeneration)}\n`);
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(monolithRuntime), {
    active: true,
    reason: "monolith_no_work_unit",
  });
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(greenRuntime), {
    active: false,
    reason: "state_unavailable",
  });
});

test("missing and malformed committed state never authorize a Work slot", async (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-project-notification-state-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const generation = path.join(root, "gateway", "generations", "4".repeat(64));
  mkdirSync(path.join(generation, "unit-states"), { recursive: true });
  symlinkSync(generation, path.join(root, "gateway", "current"));
  writeFileSync(path.join(root, "gateway", "committed-generation"), `${path.basename(generation)}\n`);
  const currentStateFile = path.join(root, "gateway", "current", "unit-states", "work.json");
  const runtime = resolveProjectNotificationSchedulerRuntime({
    WORKSPACE_DEPLOY_UNIT_ID: "work",
    WORKSPACE_DEPLOY_SLOT: "blue",
    WORKSPACE_DEPLOY_CURRENT_STATE_FILE: currentStateFile,
  });
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(runtime), {
    active: false,
    reason: "state_unavailable",
  });
  writeFileSync(path.join(generation, "unit-states", "work.json"), JSON.stringify({
    ...state("blue"),
    unitId: "finance",
  }));
  assert.deepEqual(await evaluateProjectNotificationSchedulerGate(runtime), {
    active: false,
    reason: "state_invalid",
  });
});
