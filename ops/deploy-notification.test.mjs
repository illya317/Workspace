import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createFullDeployEvent,
  createProfileDeployEvent,
  createUnitDeployEvent,
  main,
  writeDeployEvent,
} from "./deploy-notification.mjs";

const build = "a".repeat(40);
const generation = "b".repeat(64);

test("Full deploy event binds terminal CNB timing and exact Ops total", () => {
  const event = createFullDeployEvent({
    sourceSha: build,
    releaseId: "20260727105913-aaaaaaaa",
    cnbBuildSn: "cnb-uio-example",
    packageVersion: "0.1.2",
    durationSeconds: 362,
    finishedAt: "2026-07-27T03:00:55.000Z",
    timing: {
      releaseProcessSeconds: 7,
      releaseAttemptCount: 1,
      releaseProcessStartedAt: "2026-07-27T02:54:46.000Z",
      localPreflightSeconds: 2,
      tenantSyncSeconds: 4,
      releaseTriggerSeconds: 2,
      pipelineDurationMs: 314000,
      stages: [
        { scope: "cnb.pipeline", stage: "build-release-target", status: "success", durationMs: 144000 },
        { scope: "cnb.pipeline", stage: "End", status: "success", durationMs: 32000 },
      ],
    },
  });
  assert.equal(event.deploymentKind, "full");
  assert.equal(event.status, "succeeded");
  assert.equal(event.durationSeconds, 362);
  assert.equal(event.opsDurationSeconds, 369);
  assert.equal(event.startedAt, "2026-07-27T02:54:46.000Z");
  assert.equal(event.finishedAt, "2026-07-27T03:00:55.000Z");
  assert.deepEqual(event.timing.cnb, { buildSn: "cnb-uio-example", pipelineDurationMs: 314000 });
  assert.equal(event.timing.slowestStage.stage, "build-release-target");
  assert.equal(event.timing.local.tenantSyncSeconds, 4);
});

test("Full deploy CLI derives final stage evidence from terminal CNB status", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-full-deploy-event-"));
  const statusFile = path.join(root, "cnb-status.json");
  const eventFile = path.join(root, "event.json");
  writeFileSync(statusFile, JSON.stringify({
    data: {
      pipelinesStatus: {
        "cnb-uio-example": {
          duration: 314000,
          stages: [
            { name: "build-release-target", status: "success", duration: 144000 },
            { name: "End", status: "success", duration: 32000 },
          ],
        },
      },
    },
  }));
  await main([
    "full-write",
    "--source-sha", build,
    "--release-id", "20260727105913-aaaaaaaa",
    "--cnb-build-sn", "cnb-uio-example",
    "--cnb-status-file", statusFile,
    "--package-version", "0.1.2",
    "--duration-seconds", "362",
    "--release-process-seconds", "7",
    "--release-attempt-count", "1",
    "--release-process-started-at", "2026-07-27T02:54:46.000Z",
    "--local-preflight-seconds", "2",
    "--tenant-sync-seconds", "4",
    "--release-trigger-seconds", "2",
    "--finished-at", "2026-07-27T03:00:55.000Z",
    "--event-file", eventFile,
  ]);
  const event = JSON.parse(readFileSync(eventFile, "utf8"));
  assert.equal(event.release, "20260727105913-aaaaaaaa");
  assert.equal(event.opsDurationSeconds, 369);
  assert.equal(event.timing.cnb.pipelineDurationMs, 314000);
  assert.deepEqual(event.timing.stages.map((stage) => stage.stage), ["build-release-target", "End"]);
});

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

test("remote deploy event preserves the existing home directory mode", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-remote-deploy-event-"));
  const home = path.join(root, "home");
  const remoteDir = path.join(home, "workspace");
  mkdirSync(home, { mode: 0o710 });
  chmodSync(home, 0o710);
  const result = spawnSync("python3", [
    fileURLToPath(new URL("./release/diagnostics/record-deploy-attempt.py", import.meta.url)),
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      REMOTE_DIR: remoteDir,
      DEPLOY_SOURCE_SHA: build,
      RELEASE_PLAN_ID: "ci-example",
      RELEASE_STAGE: "deploy",
      DEPLOY_STATUS: "succeeded",
      DEPLOY_TRANSPORT: "local",
      DEPLOY_STARTED_EPOCH_SECONDS: "1785582067",
      DEPLOY_DURATION_SECONDS: "244",
      RELEASE_PROCESS_STARTED_AT: "2026-08-01T11:00:00Z",
      DEPLOY_CONTROL_SOURCE_SHA: "c".repeat(40),
      DEPLOY_CONTROL_TREE_ID: "d".repeat(40),
      DEPLOY_CONTROL_DIGEST: "e".repeat(64),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(statSync(home).mode & 0o777, 0o710);
  assert.deepEqual(JSON.parse(readFileSync(path.join(home, ".finance-bot-deploy-event.json"), "utf8")).control, {
    sourceSha: "c".repeat(40), treeId: "d".repeat(40), digest: "e".repeat(64),
  });
  assert.equal(statSync(path.join(home, ".finance-bot-deploy-event.json")).mode & 0o777, 0o600);
  assert.equal(statSync(path.join(home, ".finance-bot-deploy-events", "pending")).mode & 0o777, 0o700);
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
