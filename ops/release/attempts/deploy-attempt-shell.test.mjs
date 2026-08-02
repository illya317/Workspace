import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));

test("retry-fence rejection records admission without starting or failing production mutation", (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-shell-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const ledger = path.join(root, "ledger");
  mkdirSync(bin, { recursive: true });
  mkdirSync(ledger, { recursive: true });
  const fakeNode = path.join(bin, "node");
  writeFileSync(fakeNode, `#!/usr/bin/env bash
case "$2" in
  consume-clear) exit 43 ;;
  record-admission) : > "$ADMISSION_MARKER" ; exit 0 ;;
  record) : > "$DEPLOY_FAILURE_MARKER" ; exit 0 ;;
  *) exit 99 ;;
esac
`);
  chmodSync(fakeNode, 0o755);
  const admissionMarker = path.join(root, "admission-recorded");
  const deployFailureMarker = path.join(root, "deploy-failure-recorded");
  const mutationMarker = path.join(root, "mutation-started");
  const result = spawnSync("bash", ["-c", `
    source "$DEPLOY_ATTEMPT_SHELL"
    release_deploy_attempt_run -- bash -c ': > "$MUTATION_MARKER"'
  `], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DEPLOY_ATTEMPT_SHELL: path.join(sourceRoot, "deploy-attempt-shell.sh"),
      DEPLOY_ATTEMPT_ROOT: ledger,
      DEPLOY_ATTEMPT_REPOSITORY: root,
      RELEASE_SCRIPT_DIR: sourceRoot,
      RELEASE_DEPLOY_ATTEMPT_ID: "deploy-fence-blocked",
      RELEASE_DEPLOY_RETRY_FENCE_RECEIPT_FILE: path.join(root, "retry-ready.json"),
      SELECTED_READY_TARGET: "monolith",
      SELECTED_READY_MODE: "activate",
      RELEASE_CONTENT_DIGEST: "a".repeat(64),
      RELEASE_SOURCE_SHA: "b".repeat(40),
      RELEASE_SOURCE_TREE: "c".repeat(40),
      DEPLOY_CONTROL_SOURCE_SHA: "d".repeat(40),
      DEPLOY_CONTROL_TREE_ID: "e".repeat(40),
      DEPLOY_CONTROL_DIGEST: "f".repeat(64),
      ADMISSION_MARKER: admissionMarker,
      DEPLOY_FAILURE_MARKER: deployFailureMarker,
      MUTATION_MARKER: mutationMarker,
    },
  });
  assert.equal(result.status, 43, result.stderr);
  assert.equal(existsSync(admissionMarker), true);
  assert.equal(existsSync(deployFailureMarker), false);
  assert.equal(existsSync(mutationMarker), false);
});

test("derived baseline recording can never turn a successful deploy into failure", () => {
  const result = spawnSync("bash", ["-c", `
    set -uo pipefail
    source "$DEPLOY_ATTEMPT_SHELL"
    release_deploy_record_success_baseline
  `], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      DEPLOY_ATTEMPT_SHELL: path.join(sourceRoot, "deploy-attempt-shell.sh"),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /快速发布基线未写入/);
});
