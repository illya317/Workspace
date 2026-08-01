import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveDeployUnitTurbopackRoot } from "./deploy-unit-turbopack-root";

const helperFile = path.resolve(import.meta.dirname, "deploy-unit-turbopack-root.ts");

test("raw repository Node can require the explicit TypeScript helper", () => {
  const output = execFileSync(process.execPath, [
    "-e",
    `const helper = require(${JSON.stringify(helperFile)}); process.stdout.write(typeof helper.resolveDeployUnitTurbopackRoot);`,
  ], { encoding: "utf8" });
  assert.equal(output, "function");
});

function temporaryRuntime(t: test.TestContext) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-turbopack-root-"));
  const runtimeRoot = path.join(fixtureRoot, "runtime");
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  return { fixtureRoot, runtimeRoot };
}

function trustedSymlinkFixture(t: test.TestContext, lockContent = "matching-lock") {
  const { fixtureRoot, runtimeRoot } = temporaryRuntime(t);
  const repositoryRoot = path.join(runtimeRoot, "release");
  const sourceRoot = path.join(runtimeRoot, "source");
  const cachedNodeModules = path.join(sourceRoot, "node_modules");
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(cachedNodeModules, { recursive: true });
  fs.writeFileSync(path.join(repositoryRoot, "package-lock.json"), lockContent);
  fs.writeFileSync(path.join(sourceRoot, "package-lock.json"), lockContent);
  fs.symlinkSync(cachedNodeModules, path.join(repositoryRoot, "node_modules"), "dir");
  return { fixtureRoot, runtimeRoot, repositoryRoot, sourceRoot };
}

test("deploy-unit Turbopack root stays at the repository when node_modules is local", (t) => {
  const { runtimeRoot } = temporaryRuntime(t);
  const repositoryRoot = path.join(runtimeRoot, "release");
  fs.mkdirSync(path.join(repositoryRoot, "node_modules"), { recursive: true });

  assert.equal(
    resolveDeployUnitTurbopackRoot(repositoryRoot),
    fs.realpathSync(repositoryRoot),
  );
});

test("deploy-unit Turbopack root accepts the lock-matched sibling source dependency", (t) => {
  const { runtimeRoot, repositoryRoot } = trustedSymlinkFixture(t);

  assert.equal(
    resolveDeployUnitTurbopackRoot(repositoryRoot),
    fs.realpathSync(runtimeRoot),
  );
});

test("deploy-unit Turbopack root rejects an arbitrary sibling dependency", (t) => {
  const { runtimeRoot } = temporaryRuntime(t);
  const repositoryRoot = path.join(runtimeRoot, "release");
  const arbitraryNodeModules = path.join(runtimeRoot, "cache", "node_modules");
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(arbitraryNodeModules, { recursive: true });
  fs.symlinkSync(arbitraryNodeModules, path.join(repositoryRoot, "node_modules"), "dir");

  assert.throws(
    () => resolveDeployUnitTurbopackRoot(repositoryRoot),
    /must target trusted sibling/,
  );
});

test("deploy-unit Turbopack root rejects dependency lock drift", (t) => {
  const { repositoryRoot, sourceRoot } = trustedSymlinkFixture(t, "release-lock");
  fs.writeFileSync(path.join(sourceRoot, "package-lock.json"), "source-lock");

  assert.throws(
    () => resolveDeployUnitTurbopackRoot(repositoryRoot),
    /package-lock\.json drift/,
  );
});

test("deploy-unit Turbopack root rejects a dependency above the repository parent", (t) => {
  const { fixtureRoot, runtimeRoot } = temporaryRuntime(t);
  const repositoryRoot = path.join(runtimeRoot, "release");
  const outsideNodeModules = path.join(fixtureRoot, "cache", "node_modules");
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(outsideNodeModules, { recursive: true });
  fs.symlinkSync(outsideNodeModules, path.join(repositoryRoot, "node_modules"), "dir");

  assert.throws(
    () => resolveDeployUnitTurbopackRoot(repositoryRoot),
    /must target trusted sibling/,
  );
});
