import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCheckTaskCache } from "./check-task-cache.mjs";

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "check-task-cache-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const pendingDirectory = path.join(cwd, ".cache/check-results-pending/fixture");
  fs.mkdirSync(pendingDirectory, { recursive: true });
  const env = {
    CHECK_LOCK: "0",
    CHECK_WORKSPACE_SNAPSHOT_KEY: "a".repeat(64),
    CHECK_CACHE_PENDING_DIR: pendingDirectory,
    PATH: "/fixture/bin",
  };
  const task = { id: "fixture", command: "node", args: ["fixture.js"] };
  return { cwd, env, pendingDirectory, task };
}

function promotePending(cwd, pendingDirectory) {
  const resultDirectory = path.join(cwd, ".cache/check-results");
  fs.mkdirSync(resultDirectory, { recursive: true });
  for (const file of fs.readdirSync(pendingDirectory)) {
    fs.renameSync(path.join(pendingDirectory, file), path.join(resultDirectory, file));
  }
}

test("writes a pending receipt and reuses it after promotion", (t) => {
  const { cwd, env, pendingDirectory, task } = fixture(t);
  const cache = createCheckTaskCache({ cwd, env, runtime: { node: "fixture" } });

  assert.equal(cache.read(task), null);
  cache.write(task, "passed", 1234);
  promotePending(cwd, pendingDirectory);

  const receipt = cache.read(task);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.durationMs, 1234);
});

test("keeps warning results reusable but bypasses explicitly unsafe tasks", (t) => {
  const { cwd, env, pendingDirectory, task } = fixture(t);
  const cache = createCheckTaskCache({ cwd, env, runtime: { node: "fixture" } });

  cache.write(task, "warning", 90);
  promotePending(cwd, pendingDirectory);
  assert.equal(cache.read(task).status, "warning");

  const unsafeTask = { ...task, cacheable: false };
  assert.equal(cache.read(unsafeTask), null);
});

test("environment, command, and snapshot changes cannot reuse a receipt", (t) => {
  const { cwd, env, pendingDirectory, task } = fixture(t);
  const cache = createCheckTaskCache({ cwd, env, runtime: { node: "fixture" } });
  cache.write(task, "passed", 1);
  promotePending(cwd, pendingDirectory);

  assert.equal(createCheckTaskCache({
    cwd,
    env: { ...env, NODE_OPTIONS: "--conditions=other" },
    runtime: { node: "fixture" },
  }).read(task), null);
  assert.equal(createCheckTaskCache({
    cwd,
    env: { ...env, NODE_OPTIONS: "--max-old-space-size=4096" },
    runtime: { node: "fixture" },
  }).read(task)?.status, "passed");
  assert.equal(cache.read({ ...task, args: ["other.js"] }), null);
  assert.equal(createCheckTaskCache({
    cwd,
    env: { ...env, CHECK_WORKSPACE_SNAPSHOT_KEY: "b".repeat(64) },
    runtime: { node: "fixture" },
  }).read(task), null);
});

test("disables writes without a validated outer pending directory", (t) => {
  const { cwd, env, task } = fixture(t);
  const cache = createCheckTaskCache({
    cwd,
    env: { ...env, CHECK_CACHE_PENDING_DIR: path.join(cwd, "outside") },
    runtime: { node: "fixture" },
  });

  cache.write(task, "passed", 1);
  assert.equal(fs.existsSync(path.join(cwd, "outside")), false);
});
