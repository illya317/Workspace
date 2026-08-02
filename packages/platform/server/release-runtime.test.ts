import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { releaseHealthResponse } from "./release-runtime";

function withWorkspaceConfigDir(value: string, run: () => Promise<void>) {
  const previous = process.env.WORKSPACE_CONFIG_DIR;
  process.env.WORKSPACE_CONFIG_DIR = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env.WORKSPACE_CONFIG_DIR;
    else process.env.WORKSPACE_CONFIG_DIR = previous;
  });
}

test("release health reports ready when the runtime config path is traversable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "workspace-health-ready-"));
  try {
    await withWorkspaceConfigDir(directory, async () => {
      const response = await releaseHealthResponse();
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "ok");
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("release health fails closed when the runtime config path cannot be traversed", async () => {
  const directory = mkdtempSync(join(tmpdir(), "workspace-health-denied-"));
  const missing = join(directory, "missing");
  try {
    await withWorkspaceConfigDir(missing, async () => {
      const response = await releaseHealthResponse();
      assert.equal(response.status, 503);
      assert.equal((await response.json()).status, "error");
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
