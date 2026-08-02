const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { findRawCompilerInvocations, scanRepository } = require("./check-typecheck-entrypoints");
const { resolveCompilerArguments } = require("./run-typecheck");

const repoRoot = path.resolve(__dirname, "../..");

test("raw TypeScript command detector covers supported bypass forms", () => {
  const source = [
    "npx tsc --noEmit",
    "npm exec -- tsc --build",
    "./node_modules/.bin/tsc --project tsconfig.json",
    "eslint . && tsc --noEmit",
    "tsc -b packages/production",
  ].join("\n");
  assert.equal(findRawCompilerInvocations(source).length, 5);
});

test("repository-owned commands and active instructions use governed typecheck entrypoints", () => {
  assert.deepEqual(scanRepository(), []);

  const scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).scripts;
  for (const name of ["typecheck:scope", "typecheck:full"]) {
    assert.match(scripts[name], /with-check-lock\.js -- node scripts\/check\/run-typecheck\.js/);
  }
  assert.match(scripts["typecheck:quick"], /with-check-lock\.js -- node scripts\/check\/run-local-typecheck\.js/);
});

test("scoped typecheck maps package names to governed build projects", () => {
  assert.deepEqual(resolveCompilerArguments(["--scope", "production"]), [
    "--build",
    "packages/production",
    "--pretty",
    "false",
  ]);
  assert.deepEqual(resolveCompilerArguments(["--scope", "app"]), [
    "--build",
    "tsconfig.app.json",
    "--pretty",
    "false",
  ]);
  assert.throws(() => resolveCompilerArguments(["--scope", "missing"]), /Unknown TypeScript scope/);
});

test("the TypeScript runner rejects direct execution before loading the compiler", () => {
  const environment = { ...process.env };
  delete environment.CHECK_LOCK;
  delete environment.CHECK_LOCK_OWNER_PID;
  delete environment.CHECK_WORKSPACE_SNAPSHOT_KEY;
  const result = spawnSync(process.execPath, ["scripts/check/run-typecheck.js", "--noEmit"], {
    cwd: repoRoot,
    env: environment,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must run through the project check lock/);
});
