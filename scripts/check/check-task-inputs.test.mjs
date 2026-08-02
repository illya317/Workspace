// workspace-test-filesystem: isolated
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { DOMAIN_GATE_CHECK_NAMES, UI_GATE_CHECK_NAMES } from "../arch/gate-check-contracts.mjs";
import { createCheckTaskCache } from "./check-task-cache.mjs";
import { declaredCheckTaskKeys } from "./check-task-contracts.mjs";
import { captureCheckTaskInput, classifyTaskInputPath } from "./check-task-inputs.mjs";

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

function writeTracked(cwd, file, body = `${file}\n`) {
  const target = path.join(cwd, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
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

test("isolated filesystem tests do not bind fixture-looking paths to the live repository", (t) => {
  const cwd = fixture(t);
  writeTracked(cwd, "packages/news/ui/NewsPage.tsx", "export const heading = 'old';\n");
  writeTracked(cwd, "scripts/check/isolated.test.mjs", [
    "// workspace-test-filesystem: isolated",
    "const fixture = 'packages/news/ui/NewsPage.tsx';",
    "void fixture;",
    "",
  ].join("\n"));
  run(cwd, "git", ["add", "."]);
  const task = {
    id: "test-node.scripts.check",
    command: "node",
    args: ["scripts/testing/run-node-tests.mjs", "shard", "scripts.check"],
    shard: "scripts.check",
    testFiles: ["scripts/check/isolated.test.mjs"],
  };
  const first = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } });
  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const heading = 'new';\n");
  const second = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } });
  assert.equal(first.inputDigest, second.inputDigest);
});

test("isolated filesystem marker rejects live repository anchors", (t) => {
  const cwd = fixture(t);
  writeTracked(cwd, "scripts/check/invalid.test.mjs", [
    "// workspace-test-filesystem: isolated",
    "const repository" + "Root = process." + "cwd();",
    "void repository" + "Root;",
    "",
  ].join("\n"));
  run(cwd, "git", ["add", "."]);
  assert.throws(() => captureCheckTaskInput({
    id: "test-node.scripts.check",
    command: "node",
    args: ["scripts/testing/run-node-tests.mjs", "shard", "scripts.check"],
    shard: "scripts.check",
    testFiles: ["scripts/check/invalid.test.mjs"],
  }, { cwd, env: {}, runtime: { node: "24" } }), /references the live repository/);
});

test("detector closure binds every literal import form including side effects", (t) => {
  const cwd = fixture(t);
  writeTracked(cwd, "scripts/check/check-action-registry.ts", [
    "import './side-effect-helper.mjs';",
    "import { imported } from './import-from-helper.mjs';",
    "export { exported } from './export-from-helper.mjs';",
    "void import('./dynamic-import-helper.mjs');",
    "require('./require-helper.cjs');",
    "void imported;",
    "",
  ].join("\n"));
  const helpers = [
    "side-effect-helper.mjs",
    "import-from-helper.mjs",
    "export-from-helper.mjs",
    "dynamic-import-helper.mjs",
    "require-helper.cjs",
  ];
  for (const helper of helpers) writeTracked(cwd, `scripts/check/${helper}`, "export const rule = 1;\n");
  run(cwd, "git", ["add", "."]);
  const task = { id: "action-registry", command: "npm", args: ["run", "action-registry:check"] };
  const first = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } });
  for (const helper of helpers) {
    const file = path.join(cwd, "scripts/check", helper);
    fs.writeFileSync(file, "export const rule = 2;\n");
    const changed = captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } });
    assert.notEqual(first.inputDigest, changed.inputDigest, helper);
    fs.writeFileSync(file, "export const rule = 1;\n");
  }
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

test("deploy-unit-apps receipt becomes pending when canonical app or generator input changes", (t) => {
  const cwd = fixture(t);
  const sources = {
    "app/(modules)/news/page.tsx": "export default function Page() { return null; }\n",
    "apps/news/app/page.tsx": "export { default } from '../../../../app/(modules)/news/page';\n",
    "ops/deploy.sh": "#!/bin/bash\n",
    "packages/news/index.ts": "export const news = true;\n",
    "scripts/deploy/deploy-unit-app-generator.ts": "export const generatorVersion = 1;\n",
  };
  for (const [file, body] of Object.entries(sources)) {
    const target = path.join(cwd, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
  run(cwd, "git", ["add", "."]);

  const pendingDirectory = path.join(cwd, ".cache/check-results-pending/release-inputs");
  fs.mkdirSync(pendingDirectory, { recursive: true });
  const env = {
    CHECK_LOCK: "0",
    CHECK_CACHE_PENDING_DIR: pendingDirectory,
    CHECK_SOURCE_RUN_ID: "ci-release-inputs",
  };
  const task = { id: "deploy-unit-apps", command: "npm", args: ["run", "deploy:apps:check"] };
  createCheckTaskCache({ cwd, env }).write(task, "passed", 1);
  fs.cpSync(pendingDirectory, path.join(cwd, ".cache/check-results"), { recursive: true });
  assert.equal(createCheckTaskCache({ cwd, env }).freezeTaskGraph([task]).tasks[0].status, "reused");

  const appFile = path.join(cwd, "app/(modules)/news/page.tsx");
  fs.writeFileSync(appFile, "export default function ChangedPage() { return null; }\n");
  assert.equal(createCheckTaskCache({ cwd, env }).freezeTaskGraph([task]).tasks[0].status, "pending");

  fs.writeFileSync(appFile, sources["app/(modules)/news/page.tsx"]);
  fs.writeFileSync(
    path.join(cwd, "scripts/deploy/deploy-unit-app-generator.ts"),
    "export const generatorVersion = 2;\n",
  );
  assert.equal(createCheckTaskCache({ cwd, env }).freezeTaskGraph([task]).tasks[0].status, "pending");
});

test("task input paths classify private owner slices and fail closed for shared or unknown paths", () => {
  assert.deepEqual(classifyTaskInputPath("packages/news/ui/NewsPage.tsx"), { kind: "owner", owner: "news" });
  assert.deepEqual(classifyTaskInputPath("app/(modules)/news/page.tsx"), { kind: "owner", owner: "news" });
  for (const file of [
    "prisma/models/news.prisma",
    "package-lock.json",
    "packages/core/ui/index.ts",
    "packages/platform/module-registry.ts",
    "ops/cnb-release.sh",
  ]) {
    assert.deepEqual(classifyTaskInputPath(file), { kind: "global", owner: null }, file);
  }
  assert.throws(
    () => classifyTaskInputPath("misc/unowned-runtime.ts"),
    /no canonical global or owner classification/,
  );
  assert.throws(() => classifyTaskInputPath("../outside.ts"), /not repository-relative/);
});

test("News copy-only change invalidates only the golden task input set", (t) => {
  const cwd = fixture(t);
  for (const owner of [
    "administration",
    "capital-securities",
    "external",
    "finance",
    "hr",
    "inventory",
    "library",
    "news",
    "production",
    "work",
  ]) writeTracked(cwd, `packages/${owner}/index.ts`);
  writeTracked(cwd, "packages/news/ui/NewsPage.tsx", "export const heading = '旧文案';\n");
  writeTracked(
    cwd,
    "packages/platform/module-registry.ts",
    [...fs.readdirSync(path.join(cwd, "packages"))].map((owner) => `@workspace/${owner}`).join("\n"),
  );
  writeTracked(cwd, "scripts/deploy/deploy-unit-spec.ts", "export const deployUnitBlueprints = [];\n");
  writeTracked(cwd, "scripts/check/check-action-registry.ts", "export const detector = 1;\n");
  run(cwd, "git", ["add", "."]);

  const tasks = declaredCheckTaskKeys().map((id) => ({ id, command: "npm", args: ["run", id] }));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const inputDigest = (id) => captureCheckTaskInput(taskById.get(id), {
    cwd,
    env: {},
    runtime: { node: "24" },
  }).inputDigest;
  const before = new Map(tasks.map((task) => [task.id, captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } }).inputDigest]));
  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const heading = '新文案';\n");
  const pending = tasks
    .filter((task) => captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } }).inputDigest !== before.get(task.id))
    .map((task) => task.id);

  assert.deepEqual(pending, [
    "build-next",
    "business-code-hardcoding",
    "company-hardcoding-warning",
    "deploy-unit-apps",
    "lint-changed",
    "lint-full",
    "shell-errexit-policy",
    "split-quality",
    "structure-domain",
    "structure-ui",
    "surface-boundaries-warning",
    "surface-page-adoption-warning",
    "surface-visualization-adoption-warning",
    "typecheck-full",
  ]);
  const architectureTasks = [
    ...DOMAIN_GATE_CHECK_NAMES.map((name) => ({
      id: `domain-architecture.${name}`,
      command: "node",
      args: ["scripts/arch/domain-gate.ts", "--check", name],
    })),
    ...UI_GATE_CHECK_NAMES.map((name) => ({
      id: `ui-architecture.${name}`,
      command: "node",
      args: ["scripts/arch/ui-gate.ts", "--check", name],
    })),
  ];
  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const heading = '旧文案';\n");
  const architectureBefore = new Map(architectureTasks.map((task) => [
    task.id,
    captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } }).inputDigest,
  ]));
  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const heading = '新文案';\n");
  assert.deepEqual(architectureTasks.filter((task) => (
    captureCheckTaskInput(task, { cwd, env: {}, runtime: { node: "24" } }).inputDigest !== architectureBefore.get(task.id)
  )).map((task) => task.id), [
    "domain-architecture.scan",
    "domain-architecture.deps",
    "domain-architecture.split-priority",
    ...UI_GATE_CHECK_NAMES
      .filter((name) => !name.startsWith("core-ui-"))
      .map((name) => `ui-architecture.${name}`),
  ]);

  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const projectCode = 'GW';\n");
  assert.notEqual(inputDigest("business-code-hardcoding"), before.get("business-code-hardcoding"));

  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "import '@workspace/work';\nexport const heading = '旧文案';\n");
  assert.notEqual(inputDigest("deploy-unit-apps"), before.get("deploy-unit-apps"));

  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const search = <input placeholder='查找' />;\n");
  const beforeSearchCopy = inputDigest("structure-ui");
  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const search = <input placeholder='搜索' />;\n");
  assert.notEqual(inputDigest("structure-ui"), beforeSearchCopy);

  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const heading = '旧文案';\n");
  writeTracked(cwd, "packages/news/ui/NewOwnedSource.ts", "export const value = 1;\n");
  run(cwd, "git", ["add", "packages/news/ui/NewOwnedSource.ts"]);
  assert.notEqual(inputDigest("typecheck-project-references"), before.get("typecheck-project-references"));
  const beforeUnknownSource = inputDigest("typecheck-project-references");
  writeTracked(cwd, "misc/unowned-runtime.ts", "export const value = 1;\n");
  run(cwd, "git", ["add", "misc/unowned-runtime.ts"]);
  assert.notEqual(inputDigest("typecheck-project-references"), beforeUnknownSource);

  writeTracked(cwd, "packages/core/ui/PageSurface.types.ts", "export interface PageSurfaceProps { changed: true }\n");
  run(cwd, "git", ["add", "packages/core/ui/PageSurface.types.ts"]);
  assert.notEqual(inputDigest("core-ui-contracts"), before.get("core-ui-contracts"));

  writeTracked(cwd, "packages/news/server/service.ts", "export const changed = true;\n");
  run(cwd, "git", ["add", "packages/news/server/service.ts"]);
  assert.notEqual(inputDigest("domain-changed"), before.get("domain-changed"));

  writeTracked(cwd, "prisma/models/news.prisma", "model News { id Int @id }\n");
  run(cwd, "git", ["add", "prisma/models/news.prisma"]);
  assert.notEqual(inputDigest("import-reference"), before.get("import-reference"));

  fs.writeFileSync(path.join(cwd, "packages/news/ui/NewsPage.tsx"), "export const heading = '旧文案';\n");
  const beforeDetector = new Map(tasks.map((task) => [task.id, inputDigest(task.id)]));
  fs.writeFileSync(path.join(cwd, "scripts/check/check-action-registry.ts"), "export const detector = 2;\n");
  const detectorPending = tasks
    .filter((task) => inputDigest(task.id) !== beforeDetector.get(task.id))
    .map((task) => task.id);
  assert.deepEqual(detectorPending, ["action-registry", "shell-errexit-policy", "typecheck-full"]);
});

test("owner-scoped task inputs reject packages absent from the canonical registry", (t) => {
  const cwd = fixture(t);
  writeTracked(cwd, "packages/ghost/index.ts");
  writeTracked(cwd, "packages/platform/module-registry.ts", "@workspace/news\n");
  writeTracked(cwd, "scripts/deploy/deploy-unit-spec.ts", "export const deployUnitBlueprints = [];\n");
  run(cwd, "git", ["add", "."]);
  assert.throws(
    () => captureCheckTaskInput({
      id: "fixture-owner",
      command: "node",
      args: [],
      input: { kind: "files", owners: ["ghost"] },
    }, { cwd, env: {}, runtime: { node: "24" } }),
    /owner absent from canonical registry: ghost/,
  );
});
