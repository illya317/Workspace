import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readReleaseDeployMetadata } from "./release-deploy-metadata.mjs";

test("CNB release metadata reaches the unit deploy shell as four real lines", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-release-metadata-"));
  const file = path.join(root, ".cnb-release.json");
  writeFileSync(file, JSON.stringify({
    deployment: {
      startedAtEpochSeconds: 100,
      localTiming: {
        releaseProcessSeconds: 42,
        releaseAttemptCount: 3,
        releaseProcessStartedAt: "2026-07-25T09:10:22.000Z",
      },
    },
  }));
  assert.deepEqual(readReleaseDeployMetadata(file), {
    startedAtEpochSeconds: 100,
    releaseProcessSeconds: 42,
    releaseAttemptCount: 3,
    releaseProcessStartedAt: "2026-07-25T09:10:22.000Z",
  });
  const lines = execFileSync(process.execPath, [path.resolve("ops/release-deploy-metadata.mjs"), "lines", file], {
    encoding: "utf8",
  }).trimEnd().split("\n");
  assert.deepEqual(lines, ["100", "42", "3", "2026-07-25T09:10:22.000Z"]);
});
