import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { transpileConfig } from "next/dist/build/next-config-ts/transpile-config.js";

import { generatedDeployUnitAppFiles } from "./deploy-unit-app-generator";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function newsConfigContent() {
  const generatedConfig = generatedDeployUnitAppFiles("news")
    .find((file) => file.path.endsWith("/next.config.ts"));
  assert.ok(generatedConfig);
  assert.doesNotMatch(generatedConfig.content, /deploy-unit-turbopack-root/);
  return generatedConfig.content;
}

function temporaryRuntime(t: test.TestContext) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-next-config-"));
  const runtimeRoot = path.join(fixtureRoot, "runtime");
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  return { fixtureRoot, runtimeRoot };
}

function writeGeneratedConfig(repository: string) {
  const appRoot = path.join(repository, "apps/news");
  fs.mkdirSync(appRoot, { recursive: true });
  const nextConfigPath = path.join(appRoot, "next.config.ts");
  fs.writeFileSync(nextConfigPath, newsConfigContent());
  return nextConfigPath;
}

async function loadGeneratedConfig(repository: string) {
  const nextConfigPath = writeGeneratedConfig(repository);
  const loaded = await transpileConfig({ nextConfigPath, dir: path.dirname(nextConfigPath) });
  return loaded.default ?? loaded;
}

function trustedSymlinkFixture(t: test.TestContext, lockContent = "matching-lock") {
  const { fixtureRoot, runtimeRoot } = temporaryRuntime(t);
  const repository = path.join(runtimeRoot, "release");
  const sourceRoot = path.join(runtimeRoot, "source");
  const cachedNodeModules = path.join(sourceRoot, "node_modules");
  fs.mkdirSync(repository, { recursive: true });
  fs.mkdirSync(cachedNodeModules, { recursive: true });
  fs.writeFileSync(path.join(repository, "package-lock.json"), lockContent);
  fs.writeFileSync(path.join(sourceRoot, "package-lock.json"), lockContent);
  fs.symlinkSync(cachedNodeModules, path.join(repository, "node_modules"), "dir");
  return { runtimeRoot, repository, sourceRoot };
}

function errorText(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  return `${error.message}\n${error.cause instanceof Error ? error.cause.message : String(error.cause ?? "")}`;
}

test("real generated news config loads through Next transpileConfig", async () => {
  const nextConfigPath = path.join(repositoryRoot, "apps/news/next.config.ts");
  const loaded = await transpileConfig({ nextConfigPath, dir: path.dirname(nextConfigPath) });
  const config = loaded.default ?? loaded;
  const realRepositoryRoot = fs.realpathSync(repositoryRoot);
  const expectedTurbopackRoot = fs.lstatSync(path.join(repositoryRoot, "node_modules")).isSymbolicLink()
    ? path.dirname(realRepositoryRoot)
    : realRepositoryRoot;
  assert.equal(config.outputFileTracingRoot, expectedTurbopackRoot);
  assert.equal(config.turbopack.root, expectedTurbopackRoot);
});

test("generated config keeps Turbopack root at a repository with local node_modules", async (t) => {
  const { runtimeRoot } = temporaryRuntime(t);
  const repository = path.join(runtimeRoot, "release");
  fs.mkdirSync(path.join(repository, "node_modules"), { recursive: true });

  const config = await loadGeneratedConfig(repository);
  const expectedRoot = fs.realpathSync(repository);
  assert.equal(config.outputFileTracingRoot, expectedRoot);
  assert.equal(config.turbopack.root, expectedRoot);
});

test("generated config accepts the lock-matched trusted sibling source dependency", async (t) => {
  const { runtimeRoot, repository } = trustedSymlinkFixture(t);

  const config = await loadGeneratedConfig(repository);
  const expectedRoot = fs.realpathSync(runtimeRoot);
  assert.equal(config.outputFileTracingRoot, expectedRoot);
  assert.equal(config.turbopack.root, expectedRoot);
});

test("generated config rejects an arbitrary sibling dependency", async (t) => {
  const { runtimeRoot } = temporaryRuntime(t);
  const repository = path.join(runtimeRoot, "release");
  const arbitraryNodeModules = path.join(runtimeRoot, "cache", "node_modules");
  fs.mkdirSync(repository, { recursive: true });
  fs.mkdirSync(arbitraryNodeModules, { recursive: true });
  fs.symlinkSync(arbitraryNodeModules, path.join(repository, "node_modules"), "dir");

  await assert.rejects(
    () => loadGeneratedConfig(repository),
    (error) => {
      assert.match(errorText(error), /must target trusted sibling/);
      return true;
    },
  );
});

test("generated config rejects dependency lock drift", async (t) => {
  const { repository, sourceRoot } = trustedSymlinkFixture(t, "release-lock");
  fs.writeFileSync(path.join(sourceRoot, "package-lock.json"), "source-lock");

  await assert.rejects(
    () => loadGeneratedConfig(repository),
    (error) => {
      assert.match(errorText(error), /package-lock\.json drift/);
      return true;
    },
  );
});

test("generated config rejects a dependency above the repository parent", async (t) => {
  const { fixtureRoot, runtimeRoot } = temporaryRuntime(t);
  const repository = path.join(runtimeRoot, "release");
  const outsideNodeModules = path.join(fixtureRoot, "cache", "node_modules");
  fs.mkdirSync(repository, { recursive: true });
  fs.mkdirSync(outsideNodeModules, { recursive: true });
  fs.symlinkSync(outsideNodeModules, path.join(repository, "node_modules"), "dir");

  await assert.rejects(
    () => loadGeneratedConfig(repository),
    (error) => {
      assert.match(errorText(error), /must target trusted sibling/);
      return true;
    },
  );
});
