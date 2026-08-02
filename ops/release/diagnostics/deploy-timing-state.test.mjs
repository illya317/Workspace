import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(new URL("./deploy-timing-state.mjs", import.meta.url));

test("deploy timing state keeps request and mutation clocks distinct", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-timing-"));
  const file = path.join(root, "timing.json");
  execFileSync(process.execPath, [
    tool, "initialize", "--file", file,
    "--requested-at", "2026-08-01T10:00:00.000Z",
    "--requested-epoch", "1785578400",
  ]);
  execFileSync(process.execPath, [tool, "phase", "--file", file, "--value", "deploy.lock"]);
  execFileSync(process.execPath, [tool, "mutation-start", "--file", file, "--phase", "deploy.tenant-config"]);
  const state = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(state.deployRequestedAt, "2026-08-01T10:00:00.000Z");
  assert.equal(state.deployRequestedAtEpochSeconds, 1785578400);
  assert.equal(typeof state.mutationStartedAt, "string");
  assert.equal(typeof state.mutationStartedAtEpochSeconds, "number");
  assert.equal(state.currentPhase, "deploy.tenant-config");
});
