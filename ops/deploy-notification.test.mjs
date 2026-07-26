import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProfileDeployEvent, createUnitDeployEvent, writeDeployEvent } from "./deploy-notification.mjs";

const build = "a".repeat(40);
const generation = "b".repeat(64);

test("unit deploy event identifies the exact public module", () => {
  const event = createUnitDeployEvent({
    contract: {
      kind: "workspace-deploy-unit-contract",
      id: "finance",
      moduleKeys: ["finance"],
      moduleLabels: ["财务管理"],
    },
    manifest: {
      kind: "workspace-deploy-unit-artifact",
      unit: { id: "finance" },
      source: { commitSha: build },
    },
    releaseId: "finance-a1",
    gatewayGeneration: generation,
    packageVersion: "0.1.2",
    durationSeconds: 42,
    timing: {
      releaseProcessSeconds: 18,
      releaseAttemptCount: 2,
      releaseProcessStartedAt: "2026-07-25T08:00:00.000Z",
      stages: [{ scope: "cnb", stage: "artifact.build", status: "passed", durationMs: 12000 }],
    },
  });
  assert.equal(event.deploymentKind, "unit");
  assert.equal(event.deploymentMode, "activate");
  assert.equal(event.action, "deploy");
  assert.deepEqual(event.modules, [{ unitId: "finance", moduleKeys: ["finance"], moduleLabels: ["财务管理"] }]);
  assert.equal(event.durationSeconds, 42);
  assert.equal(event.opsDurationSeconds, 60);
  assert.equal(event.timing.local.releaseAttemptCount, 2);
  assert.equal(event.timing.slowestStage.stage, "artifact.build");
  assert.equal(event.timing.slowestStage.percentOfTotal, 20);
});

test("shadow unit event identifies a deployed module without claiming a Gateway generation", () => {
  const event = createUnitDeployEvent({
    contract: { kind: "workspace-deploy-unit-contract", id: "finance", moduleKeys: ["finance"], moduleLabels: ["财务管理"] },
    manifest: { kind: "workspace-deploy-unit-artifact", unit: { id: "finance" }, source: { commitSha: build } },
    deploymentMode: "shadow",
    releaseId: "finance-shadow-a1",
  });
  assert.equal(event.deploymentKind, "unit");
  assert.equal(event.deploymentMode, "shadow");
  assert.equal(Object.hasOwn(event, "gatewayGeneration"), false);
});

test("profile deploy event reports only rollout targets", () => {
  const event = createProfileDeployEvent({
    profile: {
      kind: "workspace-deployment-profile",
      id: "full",
      label: "Workspace 全功能",
      units: [
        { id: "finance", moduleKeys: ["finance"], moduleLabels: ["财务管理"] },
        { id: "hr", moduleKeys: ["hr"], moduleLabels: ["人事管理"] },
      ],
    },
    release: {
      kind: "workspace-deployment-profile-release",
      profile: { id: "full" },
      releaseSetSha256: "c".repeat(64),
      units: [
        { unitId: "finance", source: { commitSha: build } },
        { unitId: "hr", source: { commitSha: "e".repeat(40) } },
      ],
    },
    receipt: {
      kind: "workspace-deployment-profile-promotion-receipt",
      profile: { id: "full" },
      targetUnitIds: ["hr"],
      generationId: generation,
      promotionSha256: "d".repeat(64),
    },
  });
  assert.equal(event.deploymentKind, "profile");
  assert.deepEqual(event.modules.map((module) => module.unitId), ["hr"]);
  assert.deepEqual(event.modules[0].moduleLabels, ["人事管理"]);
  assert.equal(event.build, "e".repeat(40));
});

test("profile deploy event preserves mixed source identity per module", () => {
  const event = createProfileDeployEvent({
    profile: {
      kind: "workspace-deployment-profile",
      id: "full",
      label: "Workspace 全功能",
      units: [
        { id: "finance", moduleKeys: ["finance"], moduleLabels: ["财务管理"] },
        { id: "hr", moduleKeys: ["hr"], moduleLabels: ["人事管理"] },
      ],
    },
    release: {
      kind: "workspace-deployment-profile-release",
      profile: { id: "full" },
      releaseSetSha256: "c".repeat(64),
      units: [
        { unitId: "finance", source: { commitSha: build } },
        { unitId: "hr", source: { commitSha: "e".repeat(40) } },
      ],
    },
    receipt: {
      kind: "workspace-deployment-profile-promotion-receipt",
      profile: { id: "full" },
      targetUnitIds: ["finance", "hr"],
      generationId: generation,
      promotionSha256: "d".repeat(64),
    },
  });
  assert.equal(event.build, "mixed");
  assert.deepEqual(event.builds, [
    { unitId: "finance", commitSha: build },
    { unitId: "hr", commitSha: "e".repeat(40) },
  ]);
});

test("deploy event write is atomic and private", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-notification-"));
  const file = path.join(root, "event.json");
  const event = { id: "example" };
  writeDeployEvent(file, event);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), event);
  if (os.platform() !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("deploy event history keeps an append-only index and per-event evidence", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-history-"));
  const file = path.join(root, "event.json");
  const historyDir = path.join(root, "history");
  const event = { id: "unit:finance:example", finishedAt: "2026-07-25T08:00:00.000Z" };
  writeDeployEvent(file, event, { historyDir });
  assert.deepEqual(JSON.parse(readFileSync(path.join(historyDir, "latest.json"), "utf8")), event);
  assert.deepEqual(JSON.parse(readFileSync(path.join(historyDir, "deployments.ndjson"), "utf8")), event);
  assert.equal(readdirSync(historyDir).filter((name) => name.startsWith("20260725080000-")).length, 1);
  if (os.platform() !== "win32") {
    assert.equal(statSync(historyDir).mode & 0o777, 0o700);
    assert.equal(statSync(path.join(historyDir, "deployments.ndjson")).mode & 0o777, 0o600);
  }
});
