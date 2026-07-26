import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const tool = path.resolve(import.meta.dirname, "release-process-timing.mjs");

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root, file, body, message) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, body);
  git(root, "add", file);
  git(root, "-c", "user.name=Ops Test", "-c", "user.email=ops@example.invalid", "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

function run(root, command, stateFile, options = {}) {
  const args = [tool, command, "--file", stateFile];
  for (const [key, value] of Object.entries(options)) args.push(`--${key}`, String(value));
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("release timing persists across every retry and explicitly excludes main work and CI", () => {
  const root = mkdtempSync(path.join(tmpdir(), "workspace-release-process-"));
  const stateFile = path.join(root, ".cache", "release-process.json");
  try {
    git(root, "init", "-q");
    const firstSha = commit(root, "business.ts", "export const value = 1;\n", "business");
    const first = run(root, "begin", stateFile, {
      "repository-root": root,
      "source-sha": firstSha,
      now: 100,
    });
    assert.equal(first.releaseAttemptCount, 1);
    assert.equal(first.releaseProcessSeconds, 0);

    const finalOpsSha = commit(root, "ops/release.sh", "#!/bin/sh\nexit 0\n", "ops");
    const retry = run(root, "begin", stateFile, {
      "repository-root": root,
      "source-sha": finalOpsSha,
      now: 130,
    });
    assert.equal(retry.releaseAttemptCount, 2);
    assert.equal(retry.releaseProcessSeconds, 30);
    assert.equal(retry.resetReason, null);

    const deployToolSha = commit(root, "scripts/deploy/check.ts", "export const check = true;\n", "deploy tool");
    const deployToolRetry = run(root, "begin", stateFile, {
      "repository-root": root,
      "source-sha": deployToolSha,
      now: 140,
    });
    assert.equal(deployToolRetry.releaseAttemptCount, 3);
    assert.equal(deployToolRetry.resetReason, null);

    const afterCi = run(root, "exclude", stateFile, { seconds: 10, now: 150 });
    assert.equal(afterCi.releaseProcessSeconds, 40);

    const paused = run(root, "pause", stateFile, { now: 160 });
    assert.equal(paused.releaseProcessPhase, "main");
    assert.equal(paused.releaseProcessSeconds, 50);

    const businessSha = commit(root, "business.ts", "export const value = 2;\n", "business fix");
    const stillPaused = run(root, "snapshot", stateFile, { now: 200 });
    assert.equal(stillPaused.releaseProcessSeconds, 50);
    const resumed = run(root, "resume", stateFile, { now: 200 });
    assert.equal(resumed.releaseProcessPhase, "ops");

    const retryAfterMain = run(root, "begin", stateFile, {
      "repository-root": root,
      "source-sha": businessSha,
      now: 205,
    });
    assert.equal(retryAfterMain.resetReason, null);
    assert.equal(retryAfterMain.releaseAttemptCount, 4);
    assert.equal(retryAfterMain.releaseProcessSeconds, 55);

    const complete = run(root, "complete", stateFile, { now: 210 });
    assert.equal(complete.releaseProcessSeconds, 60);
    assert.equal(existsSync(stateFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
