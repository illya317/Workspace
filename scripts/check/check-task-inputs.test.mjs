import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { captureCheckTaskInput } from "./check-task-inputs.mjs";

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "check-task-inputs-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, "scripts/check"), { recursive: true });
  for (const file of [
    ".node-version",
    "package.json",
    "package-lock.json",
    "scripts/check/check-task-contracts.mjs",
    "scripts/check/check-task-inputs.mjs",
    "scripts/check/check-task-cache.mjs",
    "scripts/check/run-check-suite.mjs",
    "scripts/check/with-check-lock.js",
  ]) {
    const target = path.join(cwd, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${file}\n`);
  }
  fs.writeFileSync(path.join(cwd, ".env.example"), "NEXTAUTH_SECRET=example\n");
  run(cwd, "git", ["init", "--quiet"]);
  run(cwd, "git", ["add", "."]);
  return cwd;
}

test("environment receipts bind selected values without exposing them", (t) => {
  const cwd = fixture(t);
  const task = { id: "env", command: "npm", args: ["run", "env:check"] };
  const first = captureCheckTaskInput(task, {
    cwd,
    env: { NEXTAUTH_SECRET: "first-private-value", DATABASE_URL: "postgresql://first" },
    runtime: { node: "24", platform: "linux", arch: "x64" },
  });
  const second = captureCheckTaskInput(task, {
    cwd,
    env: { NEXTAUTH_SECRET: "second-private-value", DATABASE_URL: "postgresql://first" },
    runtime: { node: "24", platform: "linux", arch: "x64" },
  });
  assert.notEqual(first.inputDigest, second.inputDigest);
  assert.doesNotMatch(JSON.stringify(second), /second-private-value/);
});

test("unrelated files do not invalidate a narrow task input", (t) => {
  const cwd = fixture(t);
  fs.mkdirSync(path.join(cwd, "unrelated"));
  fs.writeFileSync(path.join(cwd, "unrelated/value.ts"), "export const value = 1;\n");
  run(cwd, "git", ["add", "."]);
  const task = { id: "env", command: "npm", args: ["run", "env:check"] };
  const first = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } });
  fs.writeFileSync(path.join(cwd, "unrelated/value.ts"), "export const value = 2;\n");
  const second = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } });
  assert.equal(first.inputDigest, second.inputDigest);
});

test("lockfile, runner, command and runtime drift invalidate their respective digests", (t) => {
  const cwd = fixture(t);
  const task = { id: "env", command: "npm", args: ["run", "env:check"] };
  const first = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } });
  fs.writeFileSync(path.join(cwd, "package-lock.json"), "changed\n");
  const lockChanged = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } });
  assert.notEqual(first.inputDigest, lockChanged.inputDigest);
  const commandChanged = captureCheckTaskInput({ ...task, args: ["run", "other"] }, { cwd, env: {}, runtime: { node: "24" } });
  assert.notEqual(lockChanged.commandDigest, commandChanged.commandDigest);
  const runtimeChanged = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "25" } });
  assert.notEqual(lockChanged.runtimeDigest, runtimeChanged.runtimeDigest);
});

test("Prisma receipts bind connection category without invalidating on credential rotation", (t) => {
  const cwd = fixture(t);
  const task = { id: "db-validate", command: "npm", args: ["run", "db:validate"] };
  const first = captureCheckTaskInput(task, {
    cwd,
    env: { DATABASE_URL: "postgresql://user:first@127.0.0.1:5432/workspace_ci" },
    runtime: { node: "24" },
  });
  const credentialRotated = captureCheckTaskInput(task, {
    cwd,
    env: { DATABASE_URL: "postgresql://user:second@127.0.0.1:5432/workspace_ci" },
    runtime: { node: "24" },
  });
  const categoryChanged = captureCheckTaskInput(task, {
    cwd,
    env: { DATABASE_URL: "postgresql://user:second@127.0.0.1:5432/another_database" },
    runtime: { node: "24" },
  });
  assert.equal(first.inputDigest, credentialRotated.inputDigest);
  assert.notEqual(first.inputDigest, categoryChanged.inputDigest);
});
