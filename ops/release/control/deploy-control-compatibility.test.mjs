import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { isDeployControlPath, verifyDeployControlCompatibility } from "./deploy-control-compatibility.mjs";

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}

function commit(repository, message) {
  git(repository, "add", ".");
  git(repository, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", message);
  return git(repository, "rev-parse", "HEAD");
}

test("a tested deploy controller may advance without changing the Ready application source", (t) => {
  const repository = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-control-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  git(repository, "init", "-q");
  mkdirSync(path.join(repository, "app"), { recursive: true });
  mkdirSync(path.join(repository, "ops", "release", "control"), { recursive: true });
  writeFileSync(path.join(repository, "app", "page.tsx"), "export default function Page() {}\n");
  writeFileSync(path.join(repository, "ops", "deploy.sh"), "#!/bin/bash\n");
  const readySource = commit(repository, "ready");
  writeFileSync(path.join(repository, "ops", "deploy.sh"), "#!/bin/bash\nset -e\n");
  writeFileSync(path.join(repository, "ops", "release", "control", "note.mjs"), "export const version = 1;\n");
  const controllerSource = commit(repository, "controller");
  const result = verifyDeployControlCompatibility({ repository, readySource });
  assert.equal(result.sourceSha, controllerSource);
  assert.equal(result.requiresValidation, true);
  assert.deepEqual(result.changedFiles, ["ops/deploy.sh", "ops/release/control/note.mjs"]);
  assert.match(result.controlDigest, /^[0-9a-f]{64}$/);
});

test("application drift cannot cross the deploy controller seam", (t) => {
  const repository = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-control-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  git(repository, "init", "-q");
  mkdirSync(path.join(repository, "app"), { recursive: true });
  mkdirSync(path.join(repository, "ops"), { recursive: true });
  writeFileSync(path.join(repository, "app", "page.tsx"), "export default function Page() {}\n");
  writeFileSync(path.join(repository, "ops", "deploy.sh"), "#!/bin/bash\n");
  const readySource = commit(repository, "ready");
  writeFileSync(path.join(repository, "app", "page.tsx"), "export default function Changed() {}\n");
  commit(repository, "application drift");
  assert.throws(
    () => verifyDeployControlCompatibility({ repository, readySource }),
    /artifact\/source inputs: app\/page\.tsx/,
  );
});

test("uncommitted controller changes fail closed", (t) => {
  const repository = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-control-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  mkdirSync(path.join(repository, "ops"), { recursive: true });
  git(repository, "init", "-q");
  writeFileSync(path.join(repository, "ops", "deploy.sh"), "#!/bin/bash\n");
  const readySource = commit(repository, "ready");
  writeFileSync(path.join(repository, "ops", "deploy.sh"), "#!/bin/bash\nset -e\n");
  assert.throws(
    () => verifyDeployControlCompatibility({ repository, readySource }),
    /worktree must be clean/,
  );
});

test("receipt, preflight, injection, and their tests are explicit deploy-control paths", () => {
  for (const file of [
    "ops/cnb-builder-contract.test.mjs",
    "ops/production-deploy-preflight.mjs",
    "ops/production-deploy-preflight.test.mjs",
    "ops/release-receipt.mjs",
    "ops/release-receipt.test.mjs",
    "ops/run-cnb-release-stage.sh",
  ]) assert.equal(isDeployControlPath(file), true, file);
  assert.equal(isDeployControlPath("app/page.tsx"), false);
  assert.equal(isDeployControlPath("prisma/schema.prisma"), false);
  assert.equal(isDeployControlPath("ops/build-standalone-artifact.mjs"), false);
});
