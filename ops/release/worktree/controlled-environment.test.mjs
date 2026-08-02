import assert from "node:assert/strict";
import { mkdtemp, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureControlledEnvironment } from "./controlled-environment.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "release-worktree-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const worktree = path.join(root, "release");
  const environment = path.join(root, "private", "ci.env");
  const dependencies = path.join(root, "runtime", "node_modules");
  await mkdir(worktree);
  await mkdir(path.dirname(environment));
  await mkdir(dependencies, { recursive: true });
  await writeFile(environment, "DATABASE_URL=redacted\n", { mode: 0o600 });
  return { root, worktree, environment, dependencies };
}

test("fresh release worktree receives controlled external environment and dependency symlinks", async (t) => {
  const files = await fixture(t);
  await ensureControlledEnvironment(files);
  assert.equal(await readlink(path.join(files.worktree, ".env")), files.environment);
  assert.equal(await readlink(path.join(files.worktree, "node_modules")), files.dependencies);
  await assert.doesNotReject(() => ensureControlledEnvironment(files));
});

test("regular, wrong, missing, and worktree-local environments fail closed", async (t) => {
  const regular = await fixture(t);
  await writeFile(path.join(regular.worktree, ".env"), "DATABASE_URL=must-not-be-read\n");
  await assert.rejects(() => ensureControlledEnvironment(regular), /must be a symlink/);

  const wrong = await fixture(t);
  const other = path.join(wrong.root, "private", "other.env");
  await writeFile(other, "DATABASE_URL=other\n");
  await symlink(other, path.join(wrong.worktree, ".env"));
  await assert.rejects(() => ensureControlledEnvironment(wrong), /controlled environment/);

  const missing = await fixture(t);
  await rm(missing.environment);
  await assert.rejects(() => ensureControlledEnvironment(missing), /does not exist/);

  const local = await fixture(t);
  local.environment = path.join(local.worktree, "private.env");
  await writeFile(local.environment, "DATABASE_URL=local\n");
  await assert.rejects(() => ensureControlledEnvironment(local), /outside the release worktree/);

  const dependencyDirectory = await fixture(t);
  await mkdir(path.join(dependencyDirectory.worktree, "node_modules"));
  await assert.rejects(() => ensureControlledEnvironment(dependencyDirectory), /must be a symlink/);

  const localDependencies = await fixture(t);
  localDependencies.dependencies = path.join(localDependencies.worktree, "private-node-modules");
  await mkdir(localDependencies.dependencies);
  await assert.rejects(() => ensureControlledEnvironment(localDependencies), /outside the release worktree/);
});
